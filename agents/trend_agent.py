"""
agents/trend_agent.py

Fetches trending content from YouTube (Data API v3) and Google Trends (pytrends),
scores each item with GPT-4o using the saved brand strategy as context,
and saves results to research_candidates with source_category='video'|'trend'.
"""

import json
import os
import time
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from supabase import create_client
from agents.brand_queries import get_research_queries
from agents.brand_context import get_brand_context
from agents.project_context import scope, stamp
from agents.llm import chat_json

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

MIN_RESEARCH_SCORE = 4.0  # below this, the AI's own scoring reason says it doesn't fit the brand


# ── brand context ─────────────────────────────────────────────────────────────

def _get_brand_context() -> str:
    ctx, _ = get_brand_context(mode="scoring")
    return ctx


# ── YouTube ───────────────────────────────────────────────────────────────────


def _fetch_transcript(video_id: str, max_chars: int = 1200) -> str:
    """Fetch the English transcript for a YouTube video. Returns empty string on failure."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=["en", "en-US", "en-GB"])
        text = " ".join(seg["text"] for seg in transcript)
        return text[:max_chars]
    except Exception:
        return ""


def _fetch_youtube(brand_context: str, queries: list[str]) -> list[dict]:
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        print("  [trends] YOUTUBE_API_KEY not set — skipping YouTube")
        return []

    try:
        from googleapiclient.discovery import build
        youtube = build("youtube", "v3", developerKey=api_key)
    except Exception as e:
        print(f"  [trends] YouTube client error: {e}")
        return []

    after = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    seen: set[str] = set()
    items: list[dict] = []

    for q in queries:
        try:
            search = youtube.search().list(
                part="snippet",
                q=q,
                type="video",
                order="viewCount",
                maxResults=5,
                publishedAfter=after,
                relevanceLanguage="en",
            ).execute()

            ids = [i["id"]["videoId"] for i in search.get("items", []) if i["id"]["videoId"] not in seen]
            if not ids:
                continue
            seen.update(ids)

            stats_res = youtube.videos().list(
                part="statistics,snippet",
                id=",".join(ids),
            ).execute()

            for v in stats_res.get("items", []):
                sn    = v.get("snippet", {})
                stats = v.get("statistics", {})
                views = int(stats.get("viewCount", 0))
                if views < 1_000:
                    continue

                video_id = v["id"]

                # Fetch transcript — falls back to description if unavailable
                transcript = _fetch_transcript(video_id)
                summary = transcript if transcript else sn.get("description", "")[:400]

                items.append({
                    "title":           sn.get("title", ""),
                    "summary":         summary,
                    "source":          f"YouTube · {sn.get('channelTitle', '')}",
                    "url":             f"https://youtube.com/watch?v={video_id}",
                    "source_category": "video",
                    "metadata": {
                        "video_id":       video_id,
                        "view_count":     views,
                        "like_count":     int(stats.get("likeCount", 0)),
                        "comment_count":  int(stats.get("commentCount", 0)),
                        "channel":        sn.get("channelTitle", ""),
                        "thumbnail":      sn.get("thumbnails", {}).get("medium", {}).get("url", ""),
                        "published_at":   sn.get("publishedAt", ""),
                        "has_transcript": bool(transcript),
                    },
                })

            time.sleep(0.3)
        except Exception as e:
            print(f"  [trends] YouTube query '{q}' failed: {e}")

    transcript_count = sum(1 for it in items if it["metadata"].get("has_transcript"))
    print(f"  {len(items)} YouTube videos ({transcript_count} with transcripts)")
    return items


# ── Google Trends ─────────────────────────────────────────────────────────────

def _fetch_google_trends(keywords: list[str]) -> list[dict]:
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl="en-US", tz=0, timeout=(10, 30))
    except Exception as e:
        print(f"  [trends] pytrends init failed: {e}")
        return []

    items: list[dict] = []

    # Today's trending searches
    try:
        trending = pytrends.trending_searches(pn="united_states")
        for term in trending[0].tolist()[:12]:
            items.append({
                "title":           f"Trending: {term}",
                "summary":         f"Currently trending on Google in the US.",
                "source":          "Google Trends",
                "url":             f"https://trends.google.com/trends/explore?q={term.replace(' ', '+')}",
                "source_category": "trend",
                "metadata":        {"term": term, "type": "trending_search"},
            })
    except Exception as e:
        print(f"  [trends] trending searches failed: {e}")

    # Rising related queries for brand keywords (pytrends max 5 at a time)
    try:
        payload_kws = keywords[:5]
        pytrends.build_payload(payload_kws, timeframe="now 7-d")
        related = pytrends.related_queries()
        for kw in payload_kws:
            if kw not in related:
                continue
            rising = related[kw].get("rising")
            if rising is None or rising.empty:
                continue
            for _, row in rising.head(5).iterrows():
                query = str(row.get("query", ""))
                value = int(row.get("value", 0))
                if not query:
                    continue
                items.append({
                    "title":           f"Rising: {query}",
                    "summary":         f"Rising search related to '{kw}' — up {value}% this week.",
                    "source":          "Google Trends",
                    "url":             f"https://trends.google.com/trends/explore?q={query.replace(' ', '+')}",
                    "source_category": "trend",
                    "metadata":        {"term": query, "related_to": kw, "value": value, "type": "rising_query"},
                })
        time.sleep(1)
    except Exception as e:
        print(f"  [trends] related queries failed: {e}")

    print(f"  {len(items)} Google Trends items")
    return items


# ── scoring ───────────────────────────────────────────────────────────────────

def _score_items(items: list[dict], brand_context: str) -> list[dict]:
    if not items:
        return items

    def _item_line(i: int, item: dict) -> str:
        line = f"{i + 1}. [{item['source']}] {item['title']}"
        if item.get("summary"):
            line += f"\n   Content: {item['summary'][:300]}"
        return line

    items_text = "\n".join(_item_line(i, item) for i, item in enumerate(items))

    system = f"""You are a content strategist scoring content ideas for a specific brand.

Brand context:
{brand_context}

Score each item for its content potential for THIS brand specifically.
For video items, the summary may contain the actual spoken transcript — use it to assess the real substance of the video, not just the title.

Respond ONLY with a valid JSON array — no markdown:
[{{"index": 1, "brand_relevance": 8, "engagement_potential": 7, "reason": "one line"}}, ...]

brand_relevance: alignment with this brand's audience and content pillars (1-10)
engagement_potential: how likely to drive engagement if turned into a post (1-10)
reason: one short sentence — reference the actual content, not just the title"""

    raw = chat_json(system, f"Score:\n\n{items_text}", max_tokens=2000)
    try:
        scores = json.loads(raw)
        for s in scores:
            idx = s["index"] - 1
            if 0 <= idx < len(items):
                items[idx]["score"]        = (s.get("brand_relevance", 5) + s.get("engagement_potential", 5)) / 2
                items[idx]["score_reason"] = s.get("reason", "")
    except (json.JSONDecodeError, KeyError):
        pass

    for item in items:
        if "score" not in item:
            item["score"]        = 5.0
            item["score_reason"] = ""

    return items


# ── public entry point ────────────────────────────────────────────────────────

def run_trend_research(save_to_db: bool = True) -> list[dict]:
    """
    Fetch YouTube + Google Trends, score with brand context, save to Supabase.
    Called as Phase 1b in the auto pipeline.
    """
    print("[trends] Reading brand context and generating queries...")
    brand_context = _get_brand_context()
    queries = get_research_queries()

    print("[trends] Fetching YouTube videos...")
    youtube_items = _fetch_youtube(brand_context, queries["youtube_queries"])

    print("[trends] Fetching Google Trends...")
    trend_items = _fetch_google_trends(queries["trend_keywords"])

    all_items = youtube_items + trend_items
    if not all_items:
        print("[trends] No items fetched — check API keys")
        return []

    print(f"[trends] Scoring {len(all_items)} items...")
    scored: list[dict] = []
    for i in range(0, len(all_items), 25):
        scored.extend(_score_items(all_items[i : i + 25], brand_context))

    scored.sort(key=lambda x: x.get("score", 0), reverse=True)

    before_count = len(scored)
    scored = [it for it in scored if it.get("score", 5.0) >= MIN_RESEARCH_SCORE]
    if len(scored) < before_count:
        print(f"  [trends] Dropped {before_count - len(scored)} low-relevance "
              f"item(s) below score {MIN_RESEARCH_SCORE}")

    if save_to_db:
        import time as _time
        from datetime import datetime, timezone, timedelta

        # Evict video/trend items older than 48 hours
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
        scope(_supabase.table("research_candidates").delete().in_(
            "source_category", ["video", "trend"]
        ).lt("created_at", cutoff)).execute()

        # Skip items already in the pool or already used in a draft
        existing_res = scope(_supabase.table("research_candidates").select("source_url").in_(
            "source_category", ["video", "trend"]
        )).execute()
        existing_urls = {r["source_url"] for r in (existing_res.data or []) if r.get("source_url")}

        used_res = scope(_supabase.table("generated_drafts").select("source_url").not_.is_(
            "source_url", "null"
        ).neq("source_url", "").neq("status", "rejected")).execute()
        used_urls = {r["source_url"] for r in (used_res.data or []) if r.get("source_url")}

        skip_urls = existing_urls | used_urls
        saved = 0
        for item in scored:
            url = item.get("url", "")
            if url and url in skip_urls:
                continue
            _supabase.table("research_candidates").insert(stamp({
                "title":           item["title"],
                "summary":         item.get("summary", ""),
                "source":          item["source"],
                "source_url":      url,
                "score":           round(item.get("score", 5.0), 2),
                "score_reason":    item.get("score_reason", ""),
                "selected":        False,
                "status":          "new",
                "source_category": item.get("source_category", "article"),
                "metadata":        item.get("metadata"),
            })).execute()
            saved += 1

        print(f"[trends] {saved} new video/trend items saved ({len(scored) - saved} skipped — already used or in pool)")

    return scored
