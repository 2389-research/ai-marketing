"""
agents/website_agent.py

Scrapes the company website for new content (blog posts, changelog entries,
feature releases, news) and saves them to research_candidates with
source_category='company'.

Only runs if it's been 3+ days since the last scrape (tracked in brand_profile).
"""

import json
import os
import re
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client
from agents.brand_context import get_brand_context
from agents.project_context import scope, stamp
from agents.llm import chat_json

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

SCRAPE_INTERVAL_DAYS = 3
MIN_RESEARCH_SCORE = 4.0  # below this, the AI's own scoring reason says it doesn't fit the brand

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
        res = scope(_supabase.table("brand_profile").select(
            "last_website_scraped"
        )).limit(1).execute()
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
        res = scope(_supabase.table("brand_profile").select("website_url")).limit(1).execute()
        if res.data:
            return res.data[0].get("website_url")
    except Exception:
        pass
    return None


def _mark_scraped():
    try:
        res = scope(_supabase.table("brand_profile").select("id")).limit(1).execute()
        if res.data:
            _supabase.table("brand_profile").update({
                "last_website_scraped": datetime.now(timezone.utc).isoformat()
            }).eq("id", res.data[0]["id"]).execute()
    except Exception:
        pass


def _already_seen(url: str) -> bool:
    """Return True if this URL is already in the research pool OR already has a draft."""
    if not url:
        return False
    try:
        # Already in research pool
        in_pool = scope(_supabase.table("research_candidates").select("id").eq(
            "source_url", url
        )).limit(1).execute()
        if in_pool.data:
            return True
        # Already used in a non-rejected draft
        in_drafts = scope(_supabase.table("generated_drafts").select("id").eq(
            "source_url", url
        ).neq("status", "rejected")).limit(1).execute()
        return bool(in_drafts.data)
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
    ctx, _ = get_brand_context(mode="scoring")
    return ctx


COMPANY_SCORE_FLOOR = 7.5  # company content always ranks above average external items


def _extract_product_features_from_text(page_text: str, brand_context: str) -> list[dict]:
    """
    Fallback for sites with no article elements (single-page apps, docs sites, landing pages).
    Passes raw page text to GPT to extract product content angles directly.
    """
    system = f"""You are a product marketing strategist. You have been given the raw text
scraped from a company's website. The site has no blog or article structure — it may be
a single landing page, a documentation site, or a minimal product page.

Brand context:
{brand_context}

Your job: read the text and extract the most marketable product features, capabilities,
and value propositions. Then generate 5-8 specific content angles for social media posts
and articles.

Think like a marketer: for each feature, ask —
  - What can a user DO with this? (not what it "is" abstractly)
  - What problem does it solve and for whom?
  - What makes this genuinely different from competitors?
  - Which specific audience segment would care most?

Respond ONLY with a valid JSON array — no markdown, no preamble:
[
  {{
    "title": "Specific post angle (the content hook, not the feature name)",
    "summary": "2-3 sentences: what this post covers, who it's for, what they learn",
    "feature": "The specific product feature or capability this covers",
    "angle_type": "tutorial | use_case | product_demo | trend_hook | why_you_need_it | behind_the_scenes",
    "score_reason": "Why this will resonate with the audience right now"
  }}
]"""

    try:
        raw    = chat_json(system, f"Website content:\n{page_text}", max_tokens=2000)
        angles = json.loads(raw)
        result = []
        for a in angles:
            if not a.get("title"):
                continue
            result.append({
                "title":        a["title"],
                "summary":      a.get("summary", ""),
                "score":        COMPANY_SCORE_FLOOR + 1.0,
                "score_reason": a.get("score_reason", ""),
                "url":          "",
                "metadata": {
                    "feature":    a.get("feature", ""),
                    "angle_type": a.get("angle_type", ""),
                },
            })
        print(f"  [website] Generated {len(result)} product content angles from raw text")
        return result
    except Exception as e:
        print(f"  [website] Raw text extraction failed: {e}")
        return []


def _extract_product_features(all_items: list[dict], brand_context: str) -> list[dict]:
    """
    Use GPT to extract product features from scraped pages and generate specific content angles.
    Returns additional research candidates — one per angle — with source_category='company'.
    """
    if not all_items:
        return []

    content_text = "\n".join(
        f"- {item['title']}: {item.get('summary', '')[:200]}"
        for item in all_items[:20]
    )

    system = f"""You are a product marketing strategist. Based on scraped content from a company's website,
identify the company's specific features, products, and capabilities — then generate concrete content angles
that SELL them.

Brand context:
{brand_context}

Think like a marketer: for each feature, ask —
  - What can a user DO with this? (not what it "is" abstractly)
  - What problem does it solve and for whom?
  - Is there a trending topic this feature connects to right now?
  - If no trend: generate a standalone angle — a tutorial, use case, demo, or "why you need this" post

Generate 5-8 specific content angles. Be concrete — not "we have AI features" but
"Our inbox scanner surfaces the 3 emails that need a response today — here's how it works".

Respond ONLY with a valid JSON array — no markdown, no preamble:
[
  {{
    "title": "Specific post angle (not the feature name — the content hook)",
    "summary": "2-3 sentences: what this post covers, who it's for, what they learn or do",
    "feature": "The specific product feature or capability this covers",
    "angle_type": "tutorial | use_case | product_demo | trend_hook | why_you_need_it | behind_the_scenes",
    "score_reason": "Why this will resonate with the audience right now"
  }}
]"""

    try:
        raw    = chat_json(system, f"Website content:\n{content_text}", max_tokens=2000)
        angles = json.loads(raw)
        result = []
        for a in angles:
            if not a.get("title"):
                continue
            result.append({
                "title":        a["title"],
                "summary":      a.get("summary", ""),
                "score":        COMPANY_SCORE_FLOOR + 1.0,  # product angles top the ranking
                "score_reason": a.get("score_reason", ""),
                "url":          "",
                "metadata": {
                    "feature":    a.get("feature", ""),
                    "angle_type": a.get("angle_type", ""),
                },
            })
        print(f"  [website] Generated {len(result)} product content angles")
        return result

    except Exception as e:
        print(f"  [website] Feature extraction failed: {e}")
        return []


def _score_items(items: list[dict], brand_context: str) -> list[dict]:
    if not items:
        return items

    items_text = "\n".join(
        f"{i+1}. {item['title']}\n   {item['summary'][:150]}"
        for i, item in enumerate(items)
    )

    system = f"""You are a content strategist scoring a company's OWN website content for marketing priority.

Brand context:
{brand_context}

These items come directly from the company's website — their own products, features, releases, and news.
This is the company's most authentic and valuable marketing material.

Score each item on how urgently the company should communicate it to their audience RIGHT NOW.

Respond ONLY with a valid JSON array — no markdown:
[{{"index": 1, "communication_priority": 9, "audience_value": 8, "reason": "one line"}}, ...]

communication_priority: how important it is for this company to post about this now (1-10).
  Score 9-10 for: new features, product launches, major updates, milestones
  Score 7-8 for: blog posts, case studies, team news, behind-the-scenes
  Score 5-6 for: older evergreen content, generic company info
audience_value: how much the audience will care / engage with this (1-10)
reason: one sentence — what makes this worth posting (or not)"""

    raw = chat_json(system, f"Score:\n\n{items_text}", max_tokens=1000)
    try:
        scores = json.loads(raw)
        for s in scores:
            idx = s["index"] - 1
            if 0 <= idx < len(items):
                raw_score = (s.get("communication_priority", 7) + s.get("audience_value", 7)) / 2
                # Apply score floor — company content always ranks above generic external items
                items[idx]["score"]        = max(raw_score, COMPANY_SCORE_FLOOR)
                items[idx]["score_reason"] = s.get("reason", "")
    except Exception:
        pass

    for item in items:
        if "score" not in item:
            item["score"]        = COMPANY_SCORE_FLOOR
            item["score_reason"] = "Company's own content — prioritised"

    return items


# ── public entry point ────────────────────────────────────────────────────────

def _discover_internal_links(soup: BeautifulSoup, base: str, limit: int = 20) -> list[str]:
    """
    Find all internal links on a page — used to discover docs, FAQ, feature pages
    that the hardcoded CANDIDATE_PATHS list would miss.
    """
    seen: set[str] = set()
    paths: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith("#") or href.startswith("mailto:"):
            continue
        full = urljoin(base, href)
        parsed = urlparse(full)
        # Only keep same-domain links
        if parsed.netloc and parsed.netloc != urlparse(base).netloc:
            continue
        path = parsed.path.rstrip("/") or "/"
        if path not in seen and path not in ("", "/"):
            seen.add(path)
            paths.append(full)
        if len(paths) >= limit:
            break
    return paths


def _page_raw_text(soup: BeautifulSoup) -> str:
    """Return cleaned plain text from a page — used when no article elements exist."""
    for tag in soup(["script", "style", "nav", "footer", "head"]):
        tag.decompose()
    return " ".join(soup.get_text(separator=" ").split())[:4000]


def run_website_research(save_to_db: bool = True, force: bool = False) -> list[dict]:
    """
    Scrape company website for new content. Skips if scraped within last 3 days
    (unless force=True). Returns list of new items found.

    Strategy:
    1. Fetch homepage + standard paths (blog, changelog, docs, etc.)
    2. Auto-discover internal links from the homepage and follow them
    3. If no article elements found anywhere, fall back to raw page text →
       GPT extracts product content angles from whatever text is there
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
    raw_texts: list[str] = []  # fallback: raw page text for GPT extraction

    # ── Step 1: fetch homepage + standard paths ───────────────────────────────
    urls_to_scrape: list[str] = [base + p for p in CANDIDATE_PATHS]
    homepage_soup: BeautifulSoup | None = None

    for url in urls_to_scrape:
        soup = _fetch_page(url)
        if not soup:
            continue
        if url == base or url == base + "":
            homepage_soup = soup

        items = _extract_articles(soup, base)
        for item in items:
            if item["title"] not in seen_titles:
                seen_titles.add(item["title"])
                all_items.append(item)

        # Collect raw text as fallback regardless of whether articles were found
        raw_texts.append(_page_raw_text(soup))
        time.sleep(0.3)

    # ── Step 2: auto-discover internal links from homepage ────────────────────
    if homepage_soup:
        discovered = _discover_internal_links(homepage_soup, base, limit=25)
        already_queued = {url.rstrip("/") for url in urls_to_scrape}
        new_pages = [u for u in discovered if u.rstrip("/") not in already_queued]
        print(f"  [website] Discovered {len(new_pages)} internal page(s) to check")

        for url in new_pages[:15]:
            soup = _fetch_page(url)
            if not soup:
                continue

            items = _extract_articles(soup, base)
            for item in items:
                if item["title"] not in seen_titles:
                    seen_titles.add(item["title"])
                    all_items.append(item)

            raw_texts.append(_page_raw_text(soup))
            time.sleep(0.3)

    print(f"  [website] Found {len(all_items)} structured article item(s)")

    # ── Step 3: generate product content angles ───────────────────────────────
    print("  [website] Extracting product features and content angles...")
    if all_items:
        product_angles = _extract_product_features(all_items, brand_context)
    else:
        # No article elements found (common for single-page / docs sites).
        # Fall back: pass raw page text directly to GPT so it can still extract
        # product content angles from whatever text is there.
        print("  [website] No article elements found — falling back to raw text extraction")
        combined_text = "\n\n---\n\n".join(raw_texts[:6])
        if combined_text.strip():
            product_angles = _extract_product_features_from_text(combined_text, brand_context)
        else:
            product_angles = []

    if not all_items and not product_angles:
        print("  [website] Nothing extracted from website — check the URL or page structure")
        _mark_scraped()
        return []

    scored = _score_items(all_items, brand_context) if all_items else []

    # Combine: scraped page items + GPT-generated product angles
    all_scored = scored + product_angles
    all_scored.sort(key=lambda x: x.get("score", 0), reverse=True)

    before_count = len(all_scored)
    all_scored = [it for it in all_scored if it.get("score", 5.0) >= MIN_RESEARCH_SCORE]
    if len(all_scored) < before_count:
        print(f"  [website] Dropped {before_count - len(all_scored)} low-relevance "
              f"item(s) below score {MIN_RESEARCH_SCORE}")

    top = all_scored[:20]

    if save_to_db:
        from datetime import datetime, timezone, timedelta

        # Company/evergreen content lives longer — evict after 14 days
        cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
        scope(_supabase.table("research_candidates").delete().eq(
            "source_category", "company"
        ).lt("created_at", cutoff)).execute()

        domain = urlparse(website_url).netloc
        for item in top:
            _supabase.table("research_candidates").insert(stamp({
                "title":           item["title"],
                "summary":         item.get("summary", ""),
                "source":          domain,
                "source_url":      item.get("url", ""),
                "score":           round(item.get("score", 6.0), 2),
                "score_reason":    item.get("score_reason", ""),
                "selected":        False,
                "status":          "new",
                "source_category": "company",
                "metadata":        item.get("metadata", {"scraped_from": item.get("url", "")}),
            })).execute()

        _mark_scraped()
        print(f"  [website] {len(top)} company item(s) saved ({len(product_angles)} product angles)")

    return top
