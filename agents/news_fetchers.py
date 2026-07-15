"""
agents/news_fetchers.py

Shared NewsAPI / Google News RSS fetchers, used by both research_agent.py
(brand-relevant trending topics) and competitor_agent.py (competitor-name
mentions). Extracted out of research_agent.py so competitor_agent.py doesn't
have to import another module's private helpers.
"""

import os
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import quote_plus

import requests

DEFAULT_TTL_HOURS = 48


def fetch_newsapi(queries: list[str], ttl_hours: int = DEFAULT_TTL_HOURS) -> list[dict]:
    api_key = os.getenv("NEWS_API_KEY")
    if not api_key:
        return []

    from_date = (datetime.now(timezone.utc) - timedelta(hours=ttl_hours)).strftime("%Y-%m-%d")
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
            print(f"  [news_fetchers] NewsAPI '{query}' failed: {e}")

    print(f"  {len(items)} articles from NewsAPI")
    return items


def fetch_google_news_rss(queries: list[str]) -> list[dict]:
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
            print(f"  [news_fetchers] Google News RSS '{query}' skipped: {e}")

    print(f"  {len(items)} articles from Google News RSS (fallback — add NEWS_API_KEY for better results)")
    return items


def fetch_reddit(subreddits: list[str]) -> list[dict]:
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
                print(f"  [news_fetchers] r/{name} skipped: {e}")
        return items
    except Exception as e:
        print(f"  [news_fetchers] Reddit skipped: {e}")
        return []


def fetch_news(queries: list[str], ttl_hours: int = DEFAULT_TTL_HOURS) -> list[dict]:
    """NewsAPI if configured, else Google News RSS fallback."""
    items = fetch_newsapi(queries, ttl_hours=ttl_hours)
    if not items:
        print("  [news_fetchers] NEWS_API_KEY not set — using Google News RSS fallback")
        items = fetch_google_news_rss(queries)
    return items
