"""
agents/competitor_agent.py

Competitor intelligence synthesized from real news/Reddit mentions — NOT a
live social-profile scrape. The skill this was ported from runs interactively
inside Claude Code with WebFetch access to competitor social profiles;
headless cron here only has LLM API calls, so this reuses
agents/news_fetchers.py (the same NewsAPI/Google News RSS/Reddit fetchers
research_agent.py already uses) with competitor-name queries, then asks the
LLM to synthesize positioning and gaps from whatever actually surfaces.

If a competitor has no recent coverage, the report says so — it never
invents activity, launches, or sentiment that isn't in the fetched items.
"""

import os
import json

from supabase import create_client
from dotenv import load_dotenv

from agents.brand_context import get_brand_context
from agents.brand_queries import get_research_queries
from agents.project_context import scope, stamp
from agents.news_fetchers import fetch_news, fetch_reddit
from agents.llm import chat_json, SMART

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

MAX_ITEMS_PER_COMPETITOR = 10


def _get_competitors() -> list[dict]:
    try:
        res = scope(_supabase.table("competitors").select("*")).execute()
        return res.data or []
    except Exception:
        return []


def _infer_competitors(brand_context: str) -> list[str]:
    """Zero-config fallback: infer 2-4 competitor names from brand context
    when the user hasn't seeded a list. Inferred rows are clearly marked
    (source='inferred') so a wrong guess is a one-click remove, not a
    silent bad assumption baked into the report."""
    system = (
        "You identify direct competitors for a brand based on its own description. "
        "Only name real, well-known companies you're confident compete in the same space. "
        "If you can't confidently identify any, return an empty list rather than guessing.\n\n"
        'Respond ONLY with JSON: {"competitors": ["Name A", "Name B"]}'
    )
    try:
        raw = chat_json(system, brand_context, model=SMART, max_tokens=200)
        data = json.loads(raw)
        return [n.strip() for n in data.get("competitors", []) if n.strip()][:4]
    except Exception as e:
        print(f"  [competitor] Inference failed ({e})")
        return []


def _save_inferred_competitors(names: list[str]) -> list[dict]:
    rows = []
    for name in names:
        res = _supabase.table("competitors").insert(stamp({"name": name, "source": "inferred"})).execute()
        if res.data:
            rows.append(res.data[0])
    return rows


def _reddit_mentions(name: str, subreddits: list[str]) -> list[dict]:
    """fetch_reddit only pulls each subreddit's hot listing (no keyword
    search API in the free/keyless path), so mentions are found by filtering
    those listings for the competitor's name rather than a targeted search."""
    if not subreddits:
        return []
    items = fetch_reddit(subreddits)
    name_lower = name.lower()
    return [i for i in items if name_lower in (i["title"] + " " + i.get("summary", "")).lower()]


def _synthesize_competitor_positioning(name: str, items: list[dict]) -> dict:
    if not items:
        return {
            "name": name,
            "positioning_summary": "No recent coverage found in news or Reddit mentions.",
            "notable_moves": [],
            "audience_reaction": "",
            "sources": [],
        }

    items_text = "\n\n".join(
        f"[{i['source']}] {i['title']}\n{i.get('summary', '')}"
        for i in items[:MAX_ITEMS_PER_COMPETITOR]
    )
    system = (
        f'You are a competitive intelligence analyst. Below are recent news/Reddit items mentioning '
        f'the competitor "{name}". Summarize ONLY what these items actually say — do not invent '
        f"activity, launches, or sentiment that isn't present in the text. If the items are thin, "
        f"unrelated, or don't actually describe the competitor's own moves, say so plainly.\n\n"
        'Respond ONLY with JSON: {"positioning_summary": "2-3 sentences grounded in the items", '
        '"notable_moves": ["specific move mentioned in an item", ...], '
        '"audience_reaction": "1 sentence, or empty string if no reaction is visible in the items"}'
    )
    try:
        raw = chat_json(system, items_text, model=SMART, max_tokens=500)
        data = json.loads(raw)
        return {
            "name": name,
            "positioning_summary": data.get("positioning_summary", ""),
            "notable_moves": data.get("notable_moves", []),
            "audience_reaction": data.get("audience_reaction", ""),
            "sources": [i.get("url") for i in items[:MAX_ITEMS_PER_COMPETITOR] if i.get("url")],
        }
    except Exception as e:
        print(f"  [competitor] Synthesis failed for {name} ({e})")
        return {
            "name": name, "positioning_summary": "Synthesis failed — try again later.",
            "notable_moves": [], "audience_reaction": "", "sources": [],
        }


def _synthesize_whitespace(brand_context: str, competitor_summaries: list[dict]) -> dict:
    system = (
        "You are a content strategist reviewing competitor summaries built from real news/Reddit "
        "mentions (not a full profile audit — treat thin coverage as limited data, not as evidence "
        "a competitor is inactive). Identify content gaps, whitespace angles this brand could own, "
        "and themes shared across competitors. Ground every claim in the summaries given.\n\n"
        'Respond ONLY with JSON: {"gaps": ["..."], "whitespace_angles": ["..."], "shared_themes": ["..."]}'
    )
    user = f"Brand context:\n{brand_context}\n\nCompetitor summaries:\n{json.dumps(competitor_summaries, indent=2)}"
    try:
        raw = chat_json(system, user, model=SMART, max_tokens=600)
        data = json.loads(raw)
        return {
            "gaps": data.get("gaps", []),
            "whitespace_angles": data.get("whitespace_angles", []),
            "shared_themes": data.get("shared_themes", []),
        }
    except Exception as e:
        print(f"  [competitor] Whitespace synthesis failed ({e})")
        return {"gaps": [], "whitespace_angles": [], "shared_themes": []}


def run_competitor_intel(save_to_db: bool = True) -> dict:
    """
    Scan each configured (or inferred) competitor's recent news/Reddit
    mentions, synthesize positioning per competitor, and derive whitespace
    opportunities relative to this brand. Explicitly NOT a live social-profile
    audit — see module docstring.
    """
    brand_context, _ = get_brand_context(mode="strategy")
    competitors = _get_competitors()

    if not competitors:
        names = _infer_competitors(brand_context)
        if names:
            print(f"[competitor] No competitors configured — inferred: {', '.join(names)}")
            competitors = _save_inferred_competitors(names)

    if not competitors:
        print("[competitor] No competitors configured or inferred — nothing to scan.")
        result = {"competitors": [], "gaps": [], "whitespace_angles": [], "shared_themes": []}
        if save_to_db:
            _supabase.table("competitor_reports").insert(stamp({"findings": result})).execute()
        return result

    queries = get_research_queries()
    subreddits = queries.get("reddit_subreddits", [])

    summaries = []
    for c in competitors:
        name = c["name"]
        print(f"[competitor] Scanning {name}...")
        news_items = fetch_news([name])
        reddit_items = _reddit_mentions(name, subreddits)
        summaries.append(_synthesize_competitor_positioning(name, news_items + reddit_items))

    whitespace = _synthesize_whitespace(brand_context, summaries)
    result = {"competitors": summaries, **whitespace}

    if save_to_db:
        _supabase.table("competitor_reports").insert(stamp({"findings": result})).execute()
        print(f"[competitor] Saved report — {len(summaries)} competitor(s), "
              f"{len(whitespace.get('whitespace_angles', []))} whitespace angle(s)")

    return result
