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


def run_strategy(num_topics: int = 1) -> list[dict]:
    """
    Select the best topics from research candidates, avoiding recent duplicates.

    Returns a list of dicts:
      [{"topic": str, "channels": list[str], "source_title": str}, ...]
    """
    # Load top candidates
    result = _supabase.table("research_candidates").select("*").order("score", desc=True).limit(15).execute()
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

    candidates_text = "\n".join(
        f"{i+1}. [{c['source']}] {c['title']} (score: {c['score']:.1f})"
        + (f"\n   → {c['score_reason']}" if c.get("score_reason") else "")
        for i, c in enumerate(candidates)
    )

    used_text = "\n".join(f"- {t}" for t in used_topics) if used_topics else "None yet — fresh start."

    system_prompt = f"""You are a content strategist for 2389 Research, a tech laboratory focused on AI and computer vision.

Your job: pick {num_topics} topic(s) from the research candidates and turn each into a specific, ownable content angle for the lab.

Rules:
- Don't just repeat the headline — define the angle (e.g. "What [trend] means for our CV pipeline" not just "[trend] is happening")
- Avoid topics too similar to what was recently published
- Each topic must work for both LinkedIn and Instagram
- Be specific enough that the Content Agent can write a real post, not a generic one

Respond ONLY with a valid JSON array — no markdown, no preamble:
[
  {{
    "topic": "The specific angle/hook for the post",
    "channels": ["linkedin", "instagram"],
    "source_title": "the original headline you based it on"
  }}
]"""

    user_message = f"""Research candidates (ranked by score):
{candidates_text}

Recently published topics to avoid repeating:
{used_text}

Select {num_topics} topic(s)."""

    response = _openai.chat.completions.create(
        model="gpt-4o",
        max_tokens=1000,
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
