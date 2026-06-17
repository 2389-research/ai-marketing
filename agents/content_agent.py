# agents/content_agent.py
# Takes a topic + list of target channels.
# Returns a dict of {channel: draft_text} and saves to Supabase.

import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import openai 
from supabase import create_client
from dotenv import load_dotenv
from config.brand_voice import BRAND_VOICE, get_brand_voice_prompt

load_dotenv()

_openai = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

CHANNEL_INSTRUCTIONS = {
    "linkedin": """
Write a LinkedIn post.
- Length: 150-250 words
- Open with a strong first line (no "I'm excited to share" openers)
- Can include 1-2 short paragraphs and 3-5 bullet points if it helps readability
- End with a question or clear observation, not a CTA button phrase
- No hashtags (LinkedIn reach doesn't depend on them for technical audiences)
""",
    "instagram": """
Write an Instagram caption.
- Length: 60-120 words max
- First line must work as a standalone hook (it's all that shows before "more")
- Conversational, visual, specific
- End with 3-5 relevant hashtags on a new line
""",
    "email": """
Write a marketing email.
- Subject line (under 50 chars, no clickbait)
- Preview text (under 90 chars)
- Body: 100-180 words
- One clear CTA at the end (text only, no button markup)
- Format: Subject: ...\nPreview: ...\n\n[body]
""",
    "tiktok": """
Write a TikTok video script (voiceover).
- Length: 100-150 words max (approx 30-45 second video)
- Hook in the first sentence — something surprising or counterintuitive
- Write for spoken delivery, not reading
- End with a reason to comment or follow
- Label sections: [HOOK] [BODY] [CTA]
""",
}


def generate_drafts(
    topic: str,
    channels: list[str],
    extra_context: str = "",
    save_to_db: bool = True,
) -> dict[str, dict]:
    """
    Generate platform-adapted drafts for a given topic.

    Args:
        topic: The content topic, e.g. "We just open-sourced our anomaly detection library"
        channels: List of channels to generate for, e.g. ["linkedin", "instagram"]
        extra_context: Optional extra info to include (event details, stats, links)
        save_to_db: Whether to save drafts to Supabase (set False for quick testing)

    Returns:
        Dict mapping channel -> {"draft_text": str, "draft_id": str | None}
    """
    if not channels:
        raise ValueError("Provide at least one channel.")

    unknown = [c for c in channels if c not in CHANNEL_INSTRUCTIONS]
    if unknown:
        raise ValueError(f"Unknown channels: {unknown}. Supported: {list(CHANNEL_INSTRUCTIONS.keys())}")

    brand_voice_prompt = get_brand_voice_prompt()
    drafts = {}

    for channel in channels:
        channel_instruction = CHANNEL_INSTRUCTIONS[channel]
        channel_voice = BRAND_VOICE["channel_voice"].get(channel, "")

        user_message = f"""
Topic: {topic}

{f"Additional context: {extra_context}" if extra_context else ""}

Channel voice for {channel.upper()}:
{channel_voice}

{channel_instruction}

Write the {channel} content now. Output only the post/script — no preamble, no "here's your post:" intro.
""".strip()

        response = _openai.chat.completions.create(
            model="gpt-4o",
            max_tokens=1000,
            messages=[
                {"role": "system", "content": brand_voice_prompt},
                {"role": "user", "content": user_message},
            ],
        )

        draft_text = response.choices[0].message.content.strip()
        draft_id = None

        if save_to_db:
            result = _supabase.table("generated_drafts").insert({
                "topic": topic,
                "channel": channel,
                "draft_text": draft_text,
                "qa_passed": None,
                "status": "pending",
            }).execute()
            if result.data:
                draft_id = result.data[0]["id"]

        drafts[channel] = {"draft_text": draft_text, "draft_id": draft_id}

    return drafts
