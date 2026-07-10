"""
agents/last30days_agent.py

Runs the last30days skill for brand-relevant topics and saves results to
research_candidates with source_category="social".

Uses Python 3.13 (required by last30days) as a subprocess.
Sources: Reddit + Hacker News (free, no auth).
If you add AUTH_TOKEN + CT0 to .env (X browser cookies), X/Twitter is included automatically.
"""

import json
import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

from agents.brand_context import get_brand_context
from agents.project_context import scope, stamp
from agents.llm import chat_json, FAST

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

MIN_RESEARCH_SCORE = 4.0  # below this, the AI's own scoring reason says it doesn't fit the brand
# Note: this agent scores purely by rank position (5.0-9.0 range), so this
# filter is a no-op here today — kept for consistency with the other 4
# research agents in case the scoring method changes later.

# last30days requires Python 3.12+ — use the system 3.13 install
PYTHON = "/opt/homebrew/opt/python3/bin/python3.13"
SCRIPT = str(Path(__file__).parent.parent / "lib" / "last30days" / "scripts" / "last30days.py")

# Sources — X included now that AUTH_TOKEN + CT0 are set
DEFAULT_SOURCES = "reddit,hackernews,x"


def _derive_topics(brand_context: str, n: int = 3) -> list[str]:
    """Ask Claude for the best last30days search topics based on brand context."""
    raw = chat_json(
        system=(
            "You generate short, specific search topics for social media research. "
            "Each topic should surface what real communities are discussing right now — "
            "not generic keywords, but specific enough to find relevant Reddit posts and HN threads. "
            "For example: 'B2B SaaS churn reduction', 'LLM fine-tuning cost 2025', 'Stripe vs Paddle'. "
            "Return ONLY a JSON array of strings, nothing else."
        ),
        user=(
            f"Brand context:\n{brand_context[:1500]}\n\n"
            f"Generate {n} search topics that would surface content directly relevant to this brand's "
            f"industry, problems, competitors, or trending discussions their audience cares about. "
            f"Be specific, not generic."
        ),
        model=FAST,
        max_tokens=256,
    )
    try:
        topics = json.loads(raw)
        if isinstance(topics, list):
            return [str(t).strip() for t in topics[:n] if t]
    except Exception:
        pass
    return []


def _run_last30days(topic: str, sources: str = DEFAULT_SOURCES) -> dict:
    """Run the last30days script for a topic and return the parsed JSON report."""
    env = {
        **os.environ,
        "LAST30DAYS_CONFIG_DIR": "",   # skip ~/.config/last30days/.env
        "LAST30DAYS_MEMORY_DIR": "",   # don't save to ~/Documents
        "PYTHONPATH": "",
        # X/Twitter browser cookie auth — passed through from .env
        "AUTH_TOKEN": os.getenv("AUTH_TOKEN", ""),
        "CT0":        os.getenv("CT0", ""),
    }

    cmd = [
        PYTHON, SCRIPT,
        topic,
        "--emit", "json",
        "--search", sources,
        "--quick",
        "--no-browser-cookies",
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            env=env,
        )
    except subprocess.TimeoutExpired:
        print(f"  [last30days] '{topic}' timed out after 120s")
        return {}
    except FileNotFoundError:
        print(f"  [last30days] Python 3.13 not found at {PYTHON}")
        return {}

    if result.returncode != 0:
        err = result.stderr[-500:].strip()
        print(f"  [last30days] '{topic}' failed (exit {result.returncode}): {err}")
        return {}

    # The JSON report prints to stdout
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as e:
        print(f"  [last30days] '{topic}' JSON parse error: {e}")
        return {}


def _parse_candidates(report: dict, topic: str) -> list[dict]:
    """Extract research items from a last30days JSON report."""
    candidates = report.get("ranked_candidates") or []
    items = []
    seen_urls: set[str] = set()

    total = len(candidates[:12])
    for rank, c in enumerate(candidates[:12]):
        title = (c.get("title") or "").strip()
        url   = (c.get("url") or "").strip()
        if not title or url in seen_urls:
            continue
        seen_urls.add(url)

        # Best available body text
        snippet = (c.get("snippet") or "").strip()
        if not snippet:
            for si in (c.get("source_items") or []):
                snippet = (si.get("body") or "").strip()
                if snippet:
                    break

        sources = c.get("sources") or [c.get("source", "social")]
        source_label = ", ".join(sources[:2]) if sources else "social"

        # Score by rank position: position 1 → 9.0, last → 5.0
        score = round(9.0 - (rank / max(total - 1, 1)) * 4.0, 2)

        items.append({
            "title":           title,
            "summary":         snippet[:600],
            "source":          source_label,
            "source_url":      url,
            "score":           score,
            "score_reason":    f"last30days rank {rank+1}: {topic} ({source_label})",
            "source_category": "social",
        })

    return items


def run_last30days_research(save_to_db: bool = True) -> list[dict]:
    """Main entry point: derive topics, run last30days, save results."""
    brand_context = get_brand_context("research")
    if not brand_context:
        print("  [last30days] No brand context — skipping")
        return []

    topics = _derive_topics(brand_context)
    if not topics:
        print("  [last30days] Could not derive topics — skipping")
        return []

    print(f"  [last30days] Topics: {topics}")

    all_items: list[dict] = []
    seen_urls: set[str] = set()

    for topic in topics:
        print(f"  [last30days] Searching: '{topic}'...")
        report = _run_last30days(topic)
        if not report:
            continue

        candidates = _parse_candidates(report, topic)
        print(f"    → {len(candidates)} candidates")

        for item in candidates:
            if item["source_url"] not in seen_urls:
                seen_urls.add(item["source_url"])
                all_items.append(item)

    if not all_items:
        print("  [last30days] No results")
        return []

    if save_to_db:
        # Clear previous social results
        scope(_supabase.table("research_candidates").delete().eq("source_category", "social")).execute()

        # Skip URLs already used in approved drafts
        used_res  = scope(_supabase.table("generated_drafts").select("source_url")
            .not_.is_("source_url", "null").neq("source_url", "")
            .neq("status", "rejected")).execute()
        used_urls = {r["source_url"] for r in (used_res.data or []) if r.get("source_url")}

        before_count = len(all_items)
        all_items = [it for it in all_items if it.get("score", 5.0) >= MIN_RESEARCH_SCORE]
        if len(all_items) < before_count:
            print(f"  [last30days] Dropped {before_count - len(all_items)} low-relevance "
                  f"item(s) below score {MIN_RESEARCH_SCORE}")

        saved = 0
        for item in all_items:
            if item["source_url"] in used_urls:
                continue
            try:
                _supabase.table("research_candidates").insert(stamp({
                    "title":           item["title"],
                    "summary":         item["summary"],
                    "source":          item["source"],
                    "source_url":      item["source_url"],
                    "score":           item["score"],
                    "score_reason":    item["score_reason"],
                    "source_category": "social",
                    "metadata":        {"topics_searched": topics},
                })).execute()
                saved += 1
            except Exception as e:
                print(f"    [last30days] DB insert failed: {e}")

        print(f"  [last30days] Saved {saved}/{len(all_items)} items to DB")

    return all_items
