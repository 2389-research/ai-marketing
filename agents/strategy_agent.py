# agents/strategy_agent.py
# Reads the top research candidates from Supabase, checks for duplicate topics
# against recent published/approved posts, and uses GPT-4o to select the best
# 1-3 content angles for this week.

import os
import json
from openai import OpenAI
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

_openai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


CONTENT_FORMATS = [
    "thought-leadership",   # strong opinion / perspective on a trend
    "educational",          # explain something technical clearly
    "trend-reaction",       # what a trend means for this company's audience
    "behind-the-scenes",    # how they work, their tools, their process
    "product-spotlight",    # a feature, capability, or result to showcase
    "product-launch",       # announcing a new feature or release
    "reel",                 # short punchy video script (hook/body/cta)
    "carousel",             # slide-by-slide content (for Instagram/LinkedIn)
    "podcast-clip",         # conversational talking points for audio/video
]


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
                parts.append(f"Strategy:\n{p['strategy'][:1500]}")
            if parts:
                return "\n".join(parts)
    except Exception:
        pass
    return "Tech research laboratory focused on AI, machine learning, and computer vision."


def run_strategy(num_topics: int = 1) -> list[dict]:
    """
    Select the best topics from research candidates and build a Content Strategy Matrix.

    Returns a list of dicts:
      [{
        "topic": str,
        "channels": list[str],
        "source_title": str,
        "format": str,
        "why_it_fits": str,
        "hook": str,
        "key_points": list[str],
      }, ...]
    """
    # Load top candidates (mix of articles, videos, trends)
    result = _supabase.table("research_candidates").select("*").order("score", desc=True).limit(20).execute()
    candidates = result.data

    if not candidates:
        raise ValueError("No research candidates in Supabase. Run the Research Agent first.")

    # Load recently used topics to avoid repeating them
    recent_drafts = _supabase.table("generated_drafts").select("topic").in_(
        "status", ["approved", "pending"]
    ).order("created_at", desc=True).limit(30).execute()

    recent_posts = _supabase.table("published_posts").select("topic").order(
        "published_at", desc=True
    ).limit(30).execute()

    used_topics = list({
        r["topic"] for r in (recent_drafts.data or []) + (recent_posts.data or [])
        if r.get("topic")
    })

    brand_context = _get_brand_context()

    # Separate company content from external research so the AI can reason about mix
    company_items  = [c for c in candidates if c.get("source_category") == "company"]
    external_items = [c for c in candidates if c.get("source_category") != "company"]

    def fmt_candidate(i: int, c: dict) -> str:
        cat   = c.get("source_category", "article").upper()
        line  = f"{i+1}. [{cat} · {c['source']}] {c['title']} (score: {c['score']:.1f})"
        if c.get("score_reason"):
            line += f"\n   → {c['score_reason']}"
        return line

    company_text  = "\n".join(fmt_candidate(i, c) for i, c in enumerate(company_items))  or "None found."
    external_text = "\n".join(fmt_candidate(i, c) for i, c in enumerate(external_items)) or "None found."
    used_text     = "\n".join(f"- {t}" for t in used_topics) if used_topics else "None yet — fresh start."
    formats_text  = ", ".join(CONTENT_FORMATS)

    system_prompt = f"""You are a senior content strategist building a Content Strategy Matrix for a specific company.

Brand context:
{brand_context}

Your job: pick {num_topics} topic(s) and produce a complete content strategy brief for each.

You have two pools of content to choose from:

1. COMPANY CONTENT — scraped from the company's own website (features, releases, blog posts, news).
   ALWAYS prioritise these. A company posting about their own product beats posting about someone else's news.
   Company content builds brand identity, drives product discovery, and shows the world what they actually do.
   Only skip a company item if it is clearly outdated or irrelevant to the audience.

2. EXTERNAL TRENDS — YouTube videos, Google Trends, RSS articles, Reddit.
   Use these to fill remaining slots after company content is covered, or when there is no company content.
   They keep the brand relevant and part of industry conversations — but they should never crowd out the company's own story.

Rule: if company content exists, at least half the selected topics must come from it.

Content format options: {formats_text}

Format selection rules — decide based on the brand's personality from the strategy above:
- If the brand is casual/creative/consumer-facing: lean toward reel, carousel, podcast-clip
- If the brand is technical/professional/B2B: lean toward thought-leadership, educational, product-launch
- For company news/releases: product-launch or product-spotlight
- For trending topics: trend-reaction, reel, or educational depending on brand tone
- Never pick a format that contradicts the brand's voice

VALID CHANNELS (only use these exact strings): linkedin, instagram, email, tiktok, youtube

Rules:
- Don't just repeat the headline — define a specific, ownable angle for this brand
- The hook must be a concrete opening line a writer can use directly
- key_points must be 3 specific things the content should communicate
- Avoid topics too similar to recently published ones
- Be specific enough that a writer can produce the content without further research

Respond ONLY with a valid JSON array — no markdown, no preamble:
[
  {{
    "topic": "The specific content angle for this brand",
    "channels": ["linkedin", "instagram"],
    "source_title": "the original headline or item you based it on",
    "source_category": "company or external",
    "format": "one of the format options above",
    "why_it_fits": "one sentence — why this topic + format fits this brand right now",
    "hook": "the exact opening line to start the content with",
    "key_points": [
      "specific point 1",
      "specific point 2",
      "specific point 3"
    ]
  }}
]"""

    user_message = f"""COMPANY CONTENT (from their own website):
{company_text}

EXTERNAL TRENDS (YouTube, Google Trends, RSS, Reddit):
{external_text}

Recently published topics to avoid:
{used_text}

Build the Content Strategy Matrix for {num_topics} topic(s). Prioritise company content when relevant."""

    response = _openai.chat.completions.create(
        model="gpt-4o",
        max_tokens=4000,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    selected = json.loads(raw)

    # Mark selected candidates in Supabase
    for item in selected:
        source_title = item.get("source_title", "")
        if source_title:
            _supabase.table("research_candidates").update({"selected": True}).eq(
                "title", source_title
            ).execute()

    return selected
