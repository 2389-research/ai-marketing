"""
agents/website_agent.py

Scrapes the company website for new content (blog posts, changelog entries,
feature releases, news) and saves them to research_candidates with
source_category='company'.

Only runs if it's been 3+ days since the last scrape (tracked in brand_profile).
"""

import os
import re
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client

load_dotenv()

_openai   = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

SCRAPE_INTERVAL_DAYS = 3

CANDIDATE_PATHS = [
    "", "/blog", "/news", "/updates", "/changelog",
    "/features", "/releases", "/articles", "/insights",
    "/press", "/announcements", "/product",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; MarketingBot/1.0)",
    "Accept": "text/html,application/xhtml+xml",
}


# ── helpers ───────────────────────────────────────────────────────────────────

def _should_scrape() -> bool:
    """Return True if 3+ days have passed since last website scrape."""
    try:
        res = _supabase.table("brand_profile").select(
            "last_website_scraped"
        ).limit(1).execute()
        if not res.data:
            return True
        last = res.data[0].get("last_website_scraped")
        if not last:
            return True
        last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
        return datetime.now(timezone.utc) - last_dt >= timedelta(days=SCRAPE_INTERVAL_DAYS)
    except Exception:
        return True


def _get_website_url() -> str | None:
    try:
        res = _supabase.table("brand_profile").select("website_url").limit(1).execute()
        if res.data:
            return res.data[0].get("website_url")
    except Exception:
        pass
    return None


def _mark_scraped():
    try:
        res = _supabase.table("brand_profile").select("id").limit(1).execute()
        if res.data:
            _supabase.table("brand_profile").update({
                "last_website_scraped": datetime.now(timezone.utc).isoformat()
            }).eq("id", res.data[0]["id"]).execute()
    except Exception:
        pass


def _already_seen(url: str) -> bool:
    """Check if this URL is already in research_candidates."""
    try:
        res = _supabase.table("research_candidates").select("id").eq(
            "source_url", url
        ).limit(1).execute()
        return bool(res.data)
    except Exception:
        return False


def _fetch_page(url: str) -> BeautifulSoup | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code == 200:
            return BeautifulSoup(r.text, "lxml")
    except Exception:
        pass
    return None


def _extract_articles(soup: BeautifulSoup, base_url: str) -> list[dict]:
    """Extract article-like items from a page."""
    items = []
    seen_links: set[str] = set()

    # Try structured article/post elements first
    for tag in soup.find_all(["article", "section"], limit=30):
        a = tag.find("a", href=True)
        heading = tag.find(["h1", "h2", "h3", "h4"])
        if not a or not heading:
            continue

        title = heading.get_text(strip=True)
        href  = urljoin(base_url, a["href"])
        if not title or href in seen_links or _already_seen(href):
            continue

        # Try to get a summary
        p = tag.find("p")
        summary = p.get_text(strip=True)[:300] if p else ""

        seen_links.add(href)
        items.append({"title": title, "summary": summary, "url": href})

    # Fallback: look for headings with nearby links
    if not items:
        for heading in soup.find_all(["h2", "h3"], limit=20):
            title = heading.get_text(strip=True)
            if len(title) < 10:
                continue
            a = heading.find("a", href=True) or heading.find_next_sibling("a")
            if not a:
                parent_a = heading.find_parent("a")
                href = urljoin(base_url, parent_a["href"]) if parent_a else base_url
            else:
                href = urljoin(base_url, a["href"])

            if href in seen_links or _already_seen(href):
                continue

            p = heading.find_next_sibling("p")
            summary = p.get_text(strip=True)[:300] if p else ""

            seen_links.add(href)
            items.append({"title": title, "summary": summary, "url": href})

    return items[:15]


def _get_brand_context() -> str:
    try:
        res = _supabase.table("brand_profile").select(
            "company_name, manual_notes, strategy"
        ).limit(1).execute()
        if res.data:
            p = res.data[0]
            parts = []
            if p.get("company_name"):
                parts.append(f"Company: {p['company_name']}")
            if p.get("manual_notes"):
                parts.append(f"Notes: {p['manual_notes'][:400]}")
            if p.get("strategy"):
                parts.append(f"Strategy:\n{p['strategy'][:1000]}")
            if parts:
                return "\n".join(parts)
    except Exception:
        pass
    return ""


def _score_items(items: list[dict], brand_context: str) -> list[dict]:
    if not items:
        return items

    items_text = "\n".join(
        f"{i+1}. {item['title']}\n   {item['summary'][:150]}"
        for i, item in enumerate(items)
    )

    system = f"""You are a content strategist scoring company website content for social media potential.

Brand context:
{brand_context}

These items were scraped from the company's own website — they are about the company's own products, features, and news.

Score each item for marketing potential.

Respond ONLY with a valid JSON array — no markdown:
[{{"index": 1, "brand_relevance": 9, "engagement_potential": 7, "reason": "one line"}}, ...]

brand_relevance: how important this is for the brand to communicate right now (1-10)
engagement_potential: how likely it is to drive engagement as a social post (1-10)
reason: one sentence explaining the score"""

    resp = _openai.chat.completions.create(
        model="gpt-4o",
        max_tokens=1000,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": f"Score:\n\n{items_text}"},
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
            idx = s["index"] - 1
            if 0 <= idx < len(items):
                items[idx]["score"]        = (s.get("brand_relevance", 5) + s.get("engagement_potential", 5)) / 2
                items[idx]["score_reason"] = s.get("reason", "")
    except Exception:
        pass

    for item in items:
        if "score" not in item:
            item["score"]        = 6.0
            item["score_reason"] = "Company's own content"

    return items


# ── public entry point ────────────────────────────────────────────────────────

def run_website_research(save_to_db: bool = True, force: bool = False) -> list[dict]:
    """
    Scrape company website for new content. Skips if scraped within last 3 days
    (unless force=True). Returns list of new items found.
    """
    import json

    if not force and not _should_scrape():
        print("  [website] Last scraped < 3 days ago — skipping")
        return []

    website_url = _get_website_url()
    if not website_url:
        print("  [website] No website URL in brand profile — skipping")
        return []

    base = f"{urlparse(website_url).scheme}://{urlparse(website_url).netloc}"
    brand_context = _get_brand_context()

    print(f"  [website] Scraping {base}...")
    all_items: list[dict] = []
    seen_titles: set[str] = set()

    for path in CANDIDATE_PATHS:
        url = base + path
        soup = _fetch_page(url)
        if not soup:
            continue

        items = _extract_articles(soup, base)
        for item in items:
            if item["title"] not in seen_titles:
                seen_titles.add(item["title"])
                all_items.append(item)

        time.sleep(0.5)

    print(f"  [website] Found {len(all_items)} new items")

    if not all_items:
        _mark_scraped()
        return []

    scored = _score_items(all_items, brand_context)
    scored.sort(key=lambda x: x.get("score", 0), reverse=True)
    top = scored[:15]

    if save_to_db:
        # Remove old company items before inserting fresh ones
        _supabase.table("research_candidates").delete().eq(
            "source_category", "company"
        ).execute()

        for item in top:
            _supabase.table("research_candidates").insert({
                "title":           item["title"],
                "summary":         item.get("summary", ""),
                "source":          urlparse(website_url).netloc,
                "source_url":      item["url"],
                "score":           round(item.get("score", 6.0), 2),
                "score_reason":    item.get("score_reason", ""),
                "selected":        False,
                "source_category": "company",
                "metadata":        {"scraped_from": item["url"]},
            }).execute()

        _mark_scraped()
        print(f"  [website] {len(top)} items saved to Supabase")

    return top
