# agents/research_agent.py
# Fetches content from RSS feeds and Reddit, scores each item with GPT-4o,
# and saves the top-20 candidates to the research_candidates table in Supabase.
#
# Reddit is optional — works without it if REDDIT_CLIENT_ID is not set.

import os
import json
from urllib.parse import quote_plus
import feedparser
from openai import OpenAI
from supabase import create_client
from dotenv import load_dotenv
from agents.brand_queries import get_research_queries
from agents.brand_context import get_brand_context

load_dotenv()

_openai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# General high-quality feeds kept as a baseline — always relevant regardless of brand
_BASE_RSS_FEEDS = [
    ("Hacker News",  "https://news.ycombinator.com/rss"),
    ("TechCrunch",   "https://techcrunch.com/feed/"),
    ("The Verge",    "https://www.theverge.com/tech/rss/index.xml"),
    ("Wired",        "https://www.wired.com/feed/rss"),
]


def _fetch_rss(news_queries: list[str]) -> list[dict]:
    items = []

    # Base feeds
    for source_name, url in _BASE_RSS_FEEDS:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:6]:
                title = entry.get("title", "").strip()
                summary = entry.get("summary", "").strip()[:400]
                if not title:
                    continue
                items.append({
                    "title": title,
                    "summary": summary,
                    "source": source_name,
                    "url": entry.get("link", ""),
                })
        except Exception as e:
            print(f"  [research] RSS {source_name} skipped: {e}")

    # Brand-specific Google News RSS feeds
    for query in news_queries:
        try:
            encoded = quote_plus(query)
            url = f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en"
            feed = feedparser.parse(url)
            for entry in feed.entries[:5]:
                title = entry.get("title", "").strip()
                summary = entry.get("summary", "").strip()[:400]
                if not title:
                    continue
                items.append({
                    "title": title,
                    "summary": summary,
                    "source": f"Google News · {query}",
                    "url": entry.get("link", ""),
                })
        except Exception as e:
            print(f"  [research] Google News '{query}' skipped: {e}")

    return items


def _fetch_reddit(subreddits: list[str]) -> list[dict]:
    client_id = os.getenv("REDDIT_CLIENT_ID")
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
        for name in subreddits:
            try:
                for post in reddit.subreddit(name).hot(limit=10):
                    if post.score < 100:
                        continue
                    items.append({
                        "title": post.title,
                        "summary": (post.selftext or "")[:400],
                        "source": f"r/{name}",
                        "url": f"https://reddit.com{post.permalink}",
                    })
            except Exception as e:
                print(f"  [research] r/{name} skipped: {e}")
        return items
    except Exception as e:
        print(f"  [research] Reddit skipped: {e}")
        return []


def _get_brand_context() -> str:
    ctx, _ = get_brand_context(mode="scoring")
    return ctx


def _score_batch(items: list[dict], offset: int = 0, brand_context: str = "") -> list[dict]:
    """Score a batch of items using GPT-4o. Returns items with score field added."""
    items_text = "\n".join(
        f"{offset + i + 1}. [{item['source']}] {item['title']}"
        for i, item in enumerate(items)
    )

    context_block = f"\nBrand context:\n{brand_context}\n" if brand_context else \
        "\nBrand context:\nTech research laboratory focused on AI and computer vision.\n"

    system_prompt = f"""You are a content strategist scoring articles for social media potential.
{context_block}
Score each item for its potential as social media content for this brand.

Respond ONLY with a valid JSON array — no markdown, no preamble. Format:
[{{"index": 1, "brand_relevance": 8, "engagement_potential": 7, "reason": "one short line"}}, ...]

brand_relevance: How relevant to this brand's audience and content pillars (1-10)
engagement_potential: How likely to make a great LinkedIn or Instagram post (1-10)
reason: One line explaining the score"""

    response = _openai.chat.completions.create(
        model="gpt-4o",
        max_tokens=2000,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Score these items:\n\n{items_text}"},
        ],
    )

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        scores = json.loads(raw)
        for s in scores:
            idx = s["index"] - offset - 1
            if 0 <= idx < len(items):
                items[idx]["score"] = (s.get("brand_relevance", 5) + s.get("engagement_potential", 5)) / 2
                items[idx]["score_reason"] = s.get("reason", "")
    except (json.JSONDecodeError, KeyError):
        pass

    for item in items:
        if "score" not in item:
            item["score"] = 5.0
            item["score_reason"] = ""

    return items


def run_research(save_to_db: bool = True) -> list[dict]:
    """
    Fetch from RSS + Reddit, score with brand context, save top-20 to Supabase.
    Clears previous article/reddit candidates before inserting (trend items kept separately).
    """
    print("[research] Reading brand context and generating queries...")
    brand_context = _get_brand_context()
    queries = get_research_queries()

    print("[research] Fetching RSS + Google News feeds...")
    items = _fetch_rss(queries["news_queries"])
    print(f"  {len(items)} items from RSS/News")

    print("[research] Fetching Reddit...")
    reddit_items = _fetch_reddit(queries["reddit_subreddits"])
    print(f"  {len(reddit_items)} items from Reddit")
    items += reddit_items

    if not items:
        raise RuntimeError("No items fetched — check your internet connection or RSS feed URLs.")

    print(f"[research] Scoring {len(items)} items with brand context...")
    scored = []
    batch_size = 25
    for i in range(0, len(items), batch_size):
        batch = items[i : i + batch_size]
        scored.extend(_score_batch(batch, offset=i, brand_context=brand_context))

    scored.sort(key=lambda x: x.get("score", 0), reverse=True)
    top_20 = scored[:20]

    if save_to_db:
        from datetime import datetime, timezone, timedelta

        # Sliding window: delete article/reddit candidates older than 7 days
        # (keeps recent material available, removes stale content)
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        _supabase.table("research_candidates").delete().in_(
            "source_category", ["article", "reddit"]
        ).lt("created_at", cutoff).execute()
        _supabase.table("research_candidates").delete().is_(
            "source_category", "null"
        ).lt("created_at", cutoff).execute()

        # Get URLs already in the pool or already used in drafts — skip both
        existing_res = _supabase.table("research_candidates").select("source_url").in_(
            "source_category", ["article", "reddit"]
        ).execute()
        existing_urls = {r["source_url"] for r in (existing_res.data or []) if r.get("source_url")}

        used_res = _supabase.table("generated_drafts").select("source_url").not_.is_(
            "source_url", "null"
        ).neq("source_url", "").neq("status", "rejected").execute()
        used_urls = {r["source_url"] for r in (used_res.data or []) if r.get("source_url")}

        skip_urls = existing_urls | used_urls
        saved = 0
        for item in top_20:
            url = item.get("url", "")
            if url and url in skip_urls:
                continue  # already in pool or already has a draft
            _supabase.table("research_candidates").insert({
                "title":           item["title"],
                "summary":         item.get("summary", ""),
                "source":          item["source"],
                "source_url":      url,
                "score":           round(item.get("score", 5.0), 2),
                "score_reason":    item.get("score_reason", ""),
                "selected":        False,
                "source_category": "reddit" if item["source"].startswith("r/") else "article",
            }).execute()
            saved += 1

        print(f"[research] {saved} new article/reddit candidates saved ({len(top_20) - saved} skipped — already used or in pool)")

    return top_20
