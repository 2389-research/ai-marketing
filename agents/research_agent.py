"""
agents/research_agent.py

Fetches news articles (NewsAPI or Google News RSS fallback) + Reddit,
deduplicates with OpenAI embeddings, scores with GPT-4o, and saves the
top-20 unique topics to research_candidates.

Trending content (article/reddit) expires after 48 hours.
"""

import math
import os
import json
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import quote_plus

import requests
from openai import OpenAI
from supabase import create_client
from dotenv import load_dotenv
from agents.brand_queries import get_research_queries
from agents.brand_context import get_brand_context

load_dotenv()

_openai   = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

TRENDING_TTL_HOURS = 48


# ── fetch ─────────────────────────────────────────────────────────────────────

def _fetch_newsapi(queries: list[str]) -> list[dict]:
    api_key = os.getenv("NEWS_API_KEY")
    if not api_key:
        return []

    from_date = (datetime.now(timezone.utc) - timedelta(hours=TRENDING_TTL_HOURS)).strftime("%Y-%m-%d")
    items: list[dict] = []
    seen_urls: set[str] = set()

    for query in queries:
        try:
            resp = requests.get(
                "https://newsapi.org/v2/everything",
                params={
                    "q":        query,
                    "from":     from_date,
                    "language": "en",
                    "sortBy":   "publishedAt",
                    "pageSize": 15,
                    "apiKey":   api_key,
                },
                timeout=10,
            )
            resp.raise_for_status()
            for article in resp.json().get("articles", []):
                url   = article.get("url", "")
                title = (article.get("title") or "").strip()
                if not title or url in seen_urls or "[Removed]" in title:
                    continue
                seen_urls.add(url)
                items.append({
                    "title":   title,
                    "summary": (article.get("description") or article.get("content") or "")[:400].strip(),
                    "source":  article.get("source", {}).get("name", "News"),
                    "url":     url,
                })
            time.sleep(0.4)
        except Exception as e:
            print(f"  [research] NewsAPI '{query}' failed: {e}")

    print(f"  {len(items)} articles from NewsAPI")
    return items


def _fetch_google_news_rss(queries: list[str]) -> list[dict]:
    """Fallback when NEWS_API_KEY is not set."""
    try:
        import feedparser
    except ImportError:
        return []

    items: list[dict] = []
    for query in queries:
        try:
            encoded = quote_plus(query)
            url  = f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en"
            feed = feedparser.parse(url)
            for entry in feed.entries[:8]:
                title = entry.get("title", "").strip()
                if not title:
                    continue
                items.append({
                    "title":   title,
                    "summary": entry.get("summary", "").strip()[:400],
                    "source":  "Google News",
                    "url":     entry.get("link", ""),
                })
        except Exception as e:
            print(f"  [research] Google News RSS '{query}' skipped: {e}")

    print(f"  {len(items)} articles from Google News RSS (fallback — add NEWS_API_KEY for better results)")
    return items


def _fetch_reddit(subreddits: list[str]) -> list[dict]:
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
        for name in subreddits:
            try:
                for post in reddit.subreddit(name).hot(limit=10):
                    if post.score < 100:
                        continue
                    items.append({
                        "title":   post.title,
                        "summary": (post.selftext or "")[:400],
                        "source":  f"r/{name}",
                        "url":     f"https://reddit.com{post.permalink}",
                    })
            except Exception as e:
                print(f"  [research] r/{name} skipped: {e}")
        return items
    except Exception as e:
        print(f"  [research] Reddit skipped: {e}")
        return []


# ── clustering ────────────────────────────────────────────────────────────────

def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na  = math.sqrt(sum(x * x for x in a))
    nb  = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def _cluster_and_pick_best(items: list[dict], threshold: float = 0.82) -> list[dict]:
    """
    Group articles into topic clusters using embeddings.
    Within each cluster, keeps the article with the most detailed summary
    rather than whichever happened to arrive first.
    """
    if len(items) <= 1:
        return items

    texts = [
        (item["title"] + ". " + item.get("summary", "")[:100]).strip()
        for item in items
    ]
    try:
        resp       = _openai.embeddings.create(model="text-embedding-3-small", input=texts)
        embeddings = [e.embedding for e in resp.data]
    except Exception as e:
        print(f"  [research] Embedding clustering failed ({e}) — skipping")
        return items

    n        = len(items)
    assigned = [-1] * n
    clusters: list[list[int]] = []

    for i in range(n):
        if assigned[i] != -1:
            continue
        cluster_id = len(clusters)
        clusters.append([i])
        assigned[i] = cluster_id
        for j in range(i + 1, n):
            if assigned[j] != -1:
                continue
            if _cosine(embeddings[i], embeddings[j]) >= threshold:
                clusters[cluster_id].append(j)
                assigned[j] = cluster_id

    # From each cluster, pick the article with the longest (most detailed) summary
    result = []
    for cluster in clusters:
        best = max(cluster, key=lambda idx: len(items[idx].get("summary", "")))
        result.append(items[best])

    removed = n - len(result)
    if removed > 0:
        print(f"  [research] Clustering: {n} articles → {len(result)} unique topics ({removed} merged)")
    return result


# ── scoring ───────────────────────────────────────────────────────────────────

def _get_brand_context() -> str:
    ctx, _ = get_brand_context(mode="scoring")
    return ctx


def _score_batch(items: list[dict], offset: int = 0, brand_context: str = "") -> list[dict]:
    items_text = "\n".join(
        f"{offset + i + 1}. [{item['source']}] {item['title']}"
        for i, item in enumerate(items)
    )

    context_block = (
        f"\nBrand context:\n{brand_context}\n" if brand_context
        else "\nBrand context:\nGeneral brand producing relevant social content.\n"
    )

    system = f"""You are a content strategist scoring articles for social media potential.
{context_block}
Score each item for its potential as social media content for this brand.

Respond ONLY with a valid JSON array — no markdown, no preamble:
[{{"index": 1, "brand_relevance": 8, "engagement_potential": 7, "reason": "one short line"}}, ...]

brand_relevance: relevance to this brand's audience and content pillars (1-10)
engagement_potential: how likely to make a great LinkedIn or Instagram post (1-10)
reason: one line explaining the score"""

    resp = _openai.chat.completions.create(
        model="gpt-4o",
        max_tokens=2000,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": f"Score these items:\n\n{items_text}"},
        ],
    )

    raw = resp.choices[0].message.content.strip()
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

def run_research(save_to_db: bool = True) -> list[dict]:
    """
    Fetch news + Reddit, deduplicate by topic, score with brand context,
    save top-20 to Supabase. Trending items expire after 48h.
    """
    print("[research] Reading brand context and generating queries...")
    brand_context = _get_brand_context()
    queries       = get_research_queries()

    print("[research] Fetching news articles...")
    news_items = _fetch_newsapi(queries["news_queries"])
    if not news_items:
        print("  [research] NEWS_API_KEY not set — using Google News RSS fallback")
        news_items = _fetch_google_news_rss(queries["news_queries"])

    print("[research] Fetching Reddit...")
    reddit_items = _fetch_reddit(queries["reddit_subreddits"])
    print(f"  {len(reddit_items)} items from Reddit")

    all_items = news_items + reddit_items
    if not all_items:
        raise RuntimeError("No items fetched — check NEWS_API_KEY or internet connection.")

    print(f"[research] Clustering {len(all_items)} raw items into unique topics...")
    unique_items = _cluster_and_pick_best(all_items)

    print(f"[research] Scoring {len(unique_items)} unique topics...")
    scored: list[dict] = []
    for i in range(0, len(unique_items), 25):
        scored.extend(_score_batch(unique_items[i : i + 25], offset=i, brand_context=brand_context))

    scored.sort(key=lambda x: x.get("score", 0), reverse=True)
    top = scored[:20]

    if save_to_db:
        # Evict trending content older than 48 hours
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=TRENDING_TTL_HOURS)).isoformat()
        _supabase.table("research_candidates").delete().in_(
            "source_category", ["article", "reddit"]
        ).lt("created_at", cutoff).execute()
        _supabase.table("research_candidates").delete().is_(
            "source_category", "null"
        ).lt("created_at", cutoff).execute()

        existing_res  = _supabase.table("research_candidates").select("source_url").in_(
            "source_category", ["article", "reddit"]
        ).execute()
        existing_urls = {r["source_url"] for r in (existing_res.data or []) if r.get("source_url")}

        used_res  = _supabase.table("generated_drafts").select("source_url").not_.is_(
            "source_url", "null"
        ).neq("source_url", "").neq("status", "rejected").execute()
        used_urls = {r["source_url"] for r in (used_res.data or []) if r.get("source_url")}

        skip_urls = existing_urls | used_urls
        saved = 0
        for item in top:
            url = item.get("url", "")
            if url and url in skip_urls:
                continue
            _supabase.table("research_candidates").insert({
                "title":           item["title"],
                "summary":         item.get("summary", ""),
                "source":          item["source"],
                "source_url":      url,
                "score":           round(item.get("score", 5.0), 2),
                "score_reason":    item.get("score_reason", ""),
                "selected":        False,
                "status":          "new",
                "source_category": "reddit" if item["source"].startswith("r/") else "article",
            }).execute()
            saved += 1

        print(f"[research] {saved} new candidates saved ({len(top) - saved} skipped — duplicate or already used)")

    return top
