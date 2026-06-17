# agents/research_agent.py
# Fetches content from RSS feeds and Reddit, scores each item with GPT-4o,
# and saves the top-20 candidates to the research_candidates table in Supabase.
#
# Reddit is optional — works without it if REDDIT_CLIENT_ID is not set.

import os
import json
import feedparser
from openai import OpenAI
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

_openai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

RSS_FEEDS = [
    ("Hacker News",       "https://news.ycombinator.com/rss"),
    ("ArXiv AI",          "http://arxiv.org/rss/cs.AI"),
    ("ArXiv CV",          "http://arxiv.org/rss/cs.CV"),
    ("MIT Tech Review",   "https://www.technologyreview.com/feed/"),
    ("TechCrunch",        "https://techcrunch.com/feed/"),
    ("The Verge Tech",    "https://www.theverge.com/tech/rss/index.xml"),
    ("Wired",             "https://www.wired.com/feed/rss"),
]

REDDIT_SUBREDDITS = [
    "MachineLearning",
    "artificial",
    "programming",
    "datascience",
    "technology",
    "singularity",
]


def _fetch_rss() -> list[dict]:
    items = []
    for source_name, url in RSS_FEEDS:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:8]:
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
    return items


def _fetch_reddit() -> list[dict]:
    client_id = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    if not client_id or not client_secret:
        return []

    try:
        import praw
        reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent=os.getenv("REDDIT_USER_AGENT", "2389Research/1.0"),
        )
        items = []
        for name in REDDIT_SUBREDDITS:
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


def _score_batch(items: list[dict], offset: int = 0) -> list[dict]:
    """Score a batch of items using GPT-4o. Returns items with score field added."""
    items_text = "\n".join(
        f"{offset + i + 1}. [{item['source']}] {item['title']}"
        for i, item in enumerate(items)
    )

    system_prompt = """You are a content strategist for 2389 Research, a tech laboratory focused on AI and computer vision.

Score each item for its potential as social media content for the lab.

Respond ONLY with a valid JSON array — no markdown, no preamble. Format:
[{"index": 1, "brand_relevance": 8, "engagement_potential": 7, "reason": "one short line"}, ...]

brand_relevance: How relevant to an AI/CV research lab (1-10)
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
    Fetch from all sources, score, and return the top-20 candidates.
    Also saves them to the research_candidates table if save_to_db is True.
    """
    print("[research] Fetching RSS feeds...")
    items = _fetch_rss()
    print(f"  {len(items)} items from RSS")

    print("[research] Fetching Reddit...")
    reddit_items = _fetch_reddit()
    print(f"  {len(reddit_items)} items from Reddit")
    items += reddit_items

    if not items:
        raise RuntimeError("No items fetched — check your internet connection or RSS feed URLs.")

    print(f"[research] Scoring {len(items)} items...")
    scored = []
    batch_size = 25
    for i in range(0, len(items), batch_size):
        batch = items[i : i + batch_size]
        scored.extend(_score_batch(batch, offset=i))

    scored.sort(key=lambda x: x.get("score", 0), reverse=True)
    top_20 = scored[:20]

    if save_to_db:
        # Delete previous candidates before inserting new ones
        _supabase.table("research_candidates").delete().neq(
            "id", "00000000-0000-0000-0000-000000000000"
        ).execute()

        for item in top_20:
            _supabase.table("research_candidates").insert({
                "title": item["title"],
                "summary": item.get("summary", ""),
                "source": item["source"],
                "source_url": item.get("url", ""),
                "score": round(item.get("score", 5.0), 2),
                "score_reason": item.get("score_reason", ""),
                "selected": False,
            }).execute()

        print(f"[research] Top-20 candidates saved to Supabase")

    return top_20
