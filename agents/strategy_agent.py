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
    "thought-leadership",   # strong opinion / our perspective on a trend
    "educational",          # explain something technical clearly
    "trend-reaction",       # what this trend means for our field / audience
    "behind-the-scenes",    # how we work, our tools, our process
    "product-spotlight",    # a feature, capability, or result we can showcase
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

    candidates_text = "\n".join(
        f"{i+1}. [{c.get('source_category','article').upper()} · {c['source']}] {c['title']} (score: {c['score']:.1f})"
        + (f"\n   → {c['score_reason']}" if c.get("score_reason") else "")
        for i, c in enumerate(candidates)
    )

    used_text = "\n".join(f"- {t}" for t in used_topics) if used_topics else "None yet — fresh start."
    formats_text = ", ".join(CONTENT_FORMATS)

    system_prompt = f"""You are a senior content strategist building a Content Strategy Matrix.

Brand context:
{brand_context}

Your job: pick {num_topics} topic(s) from the research candidates and produce a complete strategy brief for each one.

Content format options: {formats_text}

Rules:
- Don't just repeat the headline — define a specific, ownable angle
- Choose the format that best fits the topic AND the brand's voice
- The hook must be a concrete opening line a writer can use as-is (not a description of a hook)
- key_points must be 3 specific things the post should communicate — facts, perspectives, or takeaways
- Avoid topics too similar to recently published ones
- Be specific enough that a writer can produce the post without any further research

Respond ONLY with a valid JSON array — no markdown, no preamble:
[
  {{
    "topic": "The specific content angle (not just the headline)",
    "channels": ["linkedin", "instagram"],
    "source_title": "the original headline or trend term you based it on",
    "format": "one of the format options above",
    "why_it_fits": "one sentence — why this topic aligns with this brand right now",
    "hook": "the exact opening line to start the post with",
    "key_points": [
      "specific point 1 the post must make",
      "specific point 2",
      "specific point 3"
    ]
  }}
]"""

    user_message = f"""Research candidates (ranked by score):
{candidates_text}

Recently published topics to avoid repeating:
{used_text}

Build the Content Strategy Matrix for {num_topics} topic(s)."""

    response = _openai.chat.completions.create(
        model="gpt-4o",
        max_tokens=2000,
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
