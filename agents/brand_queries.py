"""
agents/brand_queries.py

Reads the brand profile and generates brand-specific research queries using GPT-4o.
Called once per pipeline run; result is cached in-process so multiple agents share it.
"""

import json
import os
from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client

load_dotenv()

_openai   = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

_cache: dict | None = None


def _fallback() -> dict:
    return {
        "youtube_queries":   ["artificial intelligence research 2026", "machine learning breakthroughs", "AI tools technology trends"],
        "trend_keywords":    ["AI research", "machine learning", "LLM", "computer vision"],
        "reddit_subreddits": ["MachineLearning", "artificial", "technology", "datascience"],
        "news_queries":      ["artificial intelligence", "machine learning trends"],
    }


def get_research_queries(force: bool = False) -> dict:
    """
    Return brand-specific research queries.
    Result is cached for the lifetime of the process.

    Returns:
      {
        "youtube_queries":   list[str],   # 5-7 YouTube search terms
        "trend_keywords":    list[str],   # 4-5 Google Trends keywords
        "reddit_subreddits": list[str],   # 5-7 subreddit names (no r/ prefix)
        "news_queries":      list[str],   # 3-5 Google News search terms
      }
    """
    global _cache
    if _cache is not None and not force:
        return _cache

    # Load brand profile
    try:
        res = _supabase.table("brand_profile").select(
            "company_name, manual_notes, strategy"
        ).limit(1).execute()
        p = res.data[0] if res.data else {}
    except Exception:
        p = {}

    company  = (p.get("company_name") or "").strip()
    notes    = (p.get("manual_notes")  or "")[:500]
    strategy = (p.get("strategy")      or "")[:2000]

    if not company and not notes and not strategy:
        print("  [queries] No brand profile — using default queries")
        _cache = _fallback()
        return _cache

    context_parts = []
    if company:
        context_parts.append(f"Company: {company}")
    if notes:
        context_parts.append(f"About: {notes}")
    if strategy:
        context_parts.append(f"Marketing strategy (excerpt):\n{strategy}")
    context = "\n\n".join(context_parts)

    prompt = f"""You are a research strategist. Based on this company's profile, generate targeted research query lists so the content team can find relevant industry news, trends, and conversations.

{context}

Generate queries that will surface:
- News and trends in this company's specific industry
- Topics the target audience actively searches for and discusses
- Conversations the brand could credibly join or react to
- Content opportunities (launches, controversies, breakthroughs) in their space

Respond ONLY with valid JSON — no markdown, no explanation:
{{
  "youtube_queries": [
    "5 to 7 specific YouTube search queries",
    "mix: industry trends, product category searches, how-to topics the audience would watch",
    "be specific to this brand's actual domain — not generic tech"
  ],
  "trend_keywords": [
    "4 to 5 short Google Trends keywords",
    "1-3 words each, directly tied to this brand's industry"
  ],
  "reddit_subreddits": [
    "5 to 7 subreddit names WITHOUT the r/ prefix",
    "ONLY use subreddits that definitely exist — if unsure, use known ones like technology, entrepreneur, marketing, startups"
  ],
  "news_queries": [
    "3 to 5 Google News search terms",
    "used to fetch recent news articles about this brand's space"
  ]
}}"""

    try:
        resp = _openai.chat.completions.create(
            model="gpt-4o",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        parsed = json.loads(raw)
        result = {
            "youtube_queries":   [q for q in parsed.get("youtube_queries",   []) if isinstance(q, str)][:7],
            "trend_keywords":    [k for k in parsed.get("trend_keywords",    []) if isinstance(k, str)][:5],
            "reddit_subreddits": [s for s in parsed.get("reddit_subreddits", []) if isinstance(s, str)][:7],
            "news_queries":      [q for q in parsed.get("news_queries",      []) if isinstance(q, str)][:5],
        }

        # Patch any empty lists with fallback values
        fb = _fallback()
        for key in fb:
            if not result.get(key):
                result[key] = fb[key]

        print(f"  [queries] Generated for {company or 'brand'}:")
        print(f"    YouTube: {result['youtube_queries']}")
        print(f"    Trends:  {result['trend_keywords']}")
        print(f"    Reddit:  {result['reddit_subreddits']}")
        print(f"    News:    {result['news_queries']}")

        _cache = result
        return _cache

    except Exception as e:
        print(f"  [queries] Generation failed ({e}) — using defaults")
        _cache = _fallback()
        return _cache
