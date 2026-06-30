"""
agents/trendjack_agent.py

Finds broadly trending topics across the internet (not filtered by industry)
and uses GPT-4o to evaluate whether the brand can authentically connect to
each trend and generate a specific content angle.

This is "newsjacking" / "trendjacking" — the marketing practice of adapting
what's already trending in culture to your brand's message.

Sources: Google trending searches, NewsAPI top headlines, Reddit r/all viral posts.
"""

import json
import os
import time
from datetime import datetime, timezone, timedelta

import requests
from openai import OpenAI
from supabase import create_client
from dotenv import load_dotenv
from agents.brand_context import get_brand_context

load_dotenv()

_openai   = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

TRENDJACK_TTL_HOURS = 24  # trend hooks expire fast — trends move quickly


# ── fetch broad trends ────────────────────────────────────────────────────────

def _fetch_google_trending() -> list[dict]:
    """Today's top trending searches on Google — not filtered by topic."""
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl="en-US", tz=0, timeout=(10, 30))
        trending = pytrends.trending_searches(pn="united_states")
        items = [
            {
                "title": term,
                "summary": "",
                "url": f"https://trends.google.com/trends/explore?q={term.replace(' ', '+')}",
            }
            for term in trending[0].tolist()[:20]
        ]
        print(f"  {len(items)} Google trending searches")
        return items
    except Exception as e:
        print(f"  [trendjack] Google trending failed: {e}")
        return []


def _fetch_newsapi_headlines() -> list[dict]:
    """Top headlines — what everyone is reading today, across all topics."""
    api_key = os.getenv("NEWS_API_KEY")
    if not api_key:
        return []
    try:
        resp = requests.get(
            "https://newsapi.org/v2/top-headlines",
            params={"country": "us", "pageSize": 20, "apiKey": api_key},
            timeout=10,
        )
        resp.raise_for_status()
        items = []
        for article in resp.json().get("articles", []):
            title = (article.get("title") or "").strip()
            if not title or "[Removed]" in title:
                continue
            items.append({
                "title":   title,
                "summary": (article.get("description") or "")[:200],
                "url":     article.get("url", ""),
            })
        print(f"  {len(items)} NewsAPI top headlines")
        return items
    except Exception as e:
        print(f"  [trendjack] NewsAPI headlines failed: {e}")
        return []


def _fetch_reddit_viral() -> list[dict]:
    """Viral posts from r/all — what Reddit is talking about across all communities."""
    client_id     = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    if not client_id or not client_secret:
        return []
    try:
        import praw
        reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent=os.getenv("REDDIT_USER_AGENT", "MarketingAgent/1.0"),
        )
        items = []
        for post in reddit.subreddit("all").hot(limit=30):
            if post.score < 5000:
                continue
            items.append({
                "title":   post.title,
                "summary": (post.selftext or "")[:200],
                "url":     f"https://reddit.com{post.permalink}",
            })
        print(f"  {len(items)} viral Reddit posts from r/all")
        return items
    except Exception as e:
        print(f"  [trendjack] Reddit r/all failed: {e}")
        return []


# ── bridge trends to brand ────────────────────────────────────────────────────

def _bridge_to_brand(trends: list[dict], brand_context: str) -> list[dict]:
    """
    For each trending topic, GPT-4o decides if the brand can authentically
    connect and generates a specific content angle + strength score.
    Only returns trends where a genuine connection exists.
    """
    if not trends:
        return []

    trends_text = "\n".join(
        f"{i + 1}. {t['title']}" + (f" — {t['summary']}" if t.get("summary") else "")
        for i, t in enumerate(trends)
    )

    system = f"""You are a creative marketing strategist who specializes in newsjacking —
connecting what's trending in culture to a brand's message in a way that feels natural, timely, and valuable. Not forced.

Brand context:
{brand_context}

For each trending topic, evaluate:
1. Can this brand authentically connect to this trend without it feeling like a stretch?
2. If yes — generate a SPECIFIC post concept that uses this trend as a hook but delivers real brand value.

Rules:
- Only say yes if the connection is genuinely natural. Forced connections embarrass the brand.
- The angle must be SPECIFIC. Not "comment on this" — an actual post idea with a clear hook.
- The post should feel timely — someone reading it should think "this is relevant right now."
- connection_strength: how strong/natural the connection is (1-10). Only include items where this would be 6+.

Respond ONLY with valid JSON — no markdown:
[
  {{
    "index": 1,
    "can_connect": true,
    "connection_strength": 8,
    "angle_title": "Specific post angle using this trend as the hook",
    "angle_summary": "2-3 sentences: what the post covers, who it's for, what they get from it",
    "hook": "One sentence: how this trend connects to the brand",
    "reason": "Why this angle works for the audience right now"
  }},
  {{
    "index": 2,
    "can_connect": false
  }}
]"""

    try:
        resp = _openai.chat.completions.create(
            model="gpt-4o",
            max_tokens=3000,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": f"Evaluate these trending topics:\n\n{trends_text}"},
            ],
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        results_json = json.loads(raw)
        angles: list[dict] = []

        for s in results_json:
            if not s.get("can_connect"):
                continue
            idx = s["index"] - 1
            if not (0 <= idx < len(trends)):
                continue
            original = trends[idx]
            strength = min(10, max(1, int(s.get("connection_strength", 7))))
            angles.append({
                "title":        s.get("angle_title", original["title"]),
                "summary":      s.get("angle_summary", ""),
                "source":       f"Trend Hook · {original['title']}",
                "url":          original.get("url", ""),
                "score":        float(strength),
                "score_reason": s.get("reason", ""),
                "metadata": {
                    "trend_topic":         original["title"],
                    "hook":                s.get("hook", ""),
                    "connection_strength": strength,
                },
            })

        connected = len(angles)
        skipped   = sum(1 for s in results_json if not s.get("can_connect"))
        print(f"  [trendjack] {connected} trend hooks generated, {skipped} trends had no authentic connection")
        return angles

    except Exception as e:
        print(f"  [trendjack] Bridge step failed: {e}")
        return []


# ── public entry point ────────────────────────────────────────────────────────

def run_trendjack_research(save_to_db: bool = True) -> list[dict]:
    """
    Find what's broadly trending, bridge to brand, save content angles.
    Items expire after 24h — trends move fast.
    """
    print("[trendjack] Fetching broad trends (across all topics)...")
    brand_context = get_brand_context(mode="scoring")[0]

    all_trends: list[dict] = []
    all_trends += _fetch_google_trending()
    all_trends += _fetch_newsapi_headlines()
    all_trends += _fetch_reddit_viral()

    if not all_trends:
        print("[trendjack] No trending topics fetched")
        return []

    # Simple title dedup before sending to GPT
    seen:         set[str]  = set()
    unique_trends: list[dict] = []
    for t in all_trends:
        key = t["title"].lower()[:60]
        if key not in seen:
            seen.add(key)
            unique_trends.append(t)

    print(f"[trendjack] Evaluating {len(unique_trends)} unique trends for brand connection...")
    angles = _bridge_to_brand(unique_trends, brand_context)

    if not angles:
        print("[trendjack] No authentic connections found this run")
        return []

    if save_to_db:
        # Evict old trendjack items — 24h TTL
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=TRENDJACK_TTL_HOURS)).isoformat()
        _supabase.table("research_candidates").delete().eq(
            "source_category", "trendjack"
        ).lt("created_at", cutoff).execute()

        existing_res    = _supabase.table("research_candidates").select("title").eq(
            "source_category", "trendjack"
        ).execute()
        existing_titles = {r["title"].lower()[:60] for r in (existing_res.data or [])}

        saved = 0
        for angle in angles:
            if angle["title"].lower()[:60] in existing_titles:
                continue
            _supabase.table("research_candidates").insert({
                "title":           angle["title"],
                "summary":         angle.get("summary", ""),
                "source":          angle["source"],
                "source_url":      angle.get("url", ""),
                "score":           round(angle.get("score", 7.0), 1),
                "score_reason":    angle.get("score_reason", ""),
                "selected":        False,
                "status":          "new",
                "source_category": "trendjack",
                "metadata":        angle.get("metadata"),
            }).execute()
            saved += 1

        print(f"[trendjack] {saved} trend hook(s) saved to research pool")

    return angles
