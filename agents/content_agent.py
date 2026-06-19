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

FORMAT_INSTRUCTIONS: dict[str, str] = {
    "thought-leadership": (
        "Write as a strong, direct opinion piece. Take a clear position. "
        "Back it up with one or two specific observations. End with an insight, not a question."
    ),
    "educational": (
        "Teach one thing clearly. Use a simple structure: what it is, why it matters, "
        "one concrete example. Write for someone smart but unfamiliar with the topic."
    ),
    "trend-reaction": (
        "React to a real trend happening right now. Share what this trend means specifically "
        "for this company's audience or industry. Give a take, not just a summary."
    ),
    "behind-the-scenes": (
        "Be specific and concrete — share a real process, decision, or detail from how the company works. "
        "No vague 'we work hard' content. Show something the audience doesn't usually see."
    ),
    "product-spotlight": (
        "Focus on ONE specific feature, result, or capability. Show it in action with a concrete "
        "use case or outcome. Make it about what the user can do, not what the product is."
    ),
    "product-launch": (
        "Announce clearly in the first line. Then explain what it does and why it matters to the user. "
        "One concrete example of it in use. End with where to find/try it."
    ),
    "reel": (
        "Write a short video script for spoken delivery. Structure:\n"
        "[HOOK] — first 3 seconds, one surprising or bold statement\n"
        "[BODY] — the key point in 3-5 punchy sentences\n"
        "[CTA] — one action to take\n"
        "Total: 80-120 words. Write how people talk, not how they write."
    ),
    "carousel": (
        "Write slide-by-slide content. Structure:\n"
        "Slide 1 — Bold headline (5 words max)\n"
        "Slide 2-5 — One point per slide: short header + 1-2 sentences\n"
        "Slide 6 — Takeaway or CTA\n"
        "Keep each slide readable in 5 seconds. No walls of text."
    ),
    "podcast-clip": (
        "Write conversational talking points for a 60-90 second audio or video clip. "
        "Label: [INTRO] [MAIN POINT] [EXAMPLE] [CLOSE]. "
        "Write how someone would actually speak in a podcast — natural, direct, no jargon walls."
    ),
}

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
    "youtube": """
Write a YouTube video script (voiceover).
- Length: 250-400 words (approx 2-3 minute video)
- Start with a strong hook in the first 15 seconds — state the payoff upfront
- Structure: Hook → Problem/Context → Main insight → Evidence/Examples → Takeaway
- Write for spoken delivery — natural sentences, no jargon walls
- Include a mid-video engagement prompt ("drop a comment if you've seen this too")
- End with a clear next step (subscribe, watch next video, or try something)
- Label sections: [HOOK] [CONTEXT] [INSIGHT] [EXAMPLES] [TAKEAWAY] [CTA]
""",
}


def generate_drafts(
    topic: str,
    channels: list[str],
    extra_context: str = "",
    save_to_db: bool = True,
    strategy: dict | None = None,
) -> dict[str, dict]:
    """
    Generate platform-adapted drafts for a given topic.

    Args:
        topic: The content angle from the strategy matrix
        channels: List of channels to generate for
        extra_context: Optional extra info (event details, stats, links)
        save_to_db: Whether to save drafts to Supabase
        strategy: Optional Content Strategy Matrix dict with format, hook, key_points, why_it_fits

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

    # Build strategy brief block from matrix if provided
    fmt = (strategy or {}).get("format", "")
    strategy_block = ""
    if strategy:
        lines = []
        if fmt:
            lines.append(f"Content format: {fmt}")
            fmt_instruction = FORMAT_INSTRUCTIONS.get(fmt)
            if fmt_instruction:
                lines.append(f"Format guidance: {fmt_instruction}")
        if strategy.get("why_it_fits"):
            lines.append(f"Why this topic: {strategy['why_it_fits']}")
        if strategy.get("hook"):
            lines.append(f"Suggested opening line: {strategy['hook']}")
        if strategy.get("key_points"):
            points = "\n".join(f"  - {p}" for p in strategy["key_points"])
            lines.append(f"Key points to cover:\n{points}")
        if lines:
            strategy_block = "Strategy brief:\n" + "\n".join(lines)

    for channel in channels:
        channel_instruction = CHANNEL_INSTRUCTIONS[channel]
        channel_voice = BRAND_VOICE["channel_voice"].get(channel, "")

        user_message = f"""
Topic: {topic}

{strategy_block}

{f"Additional context: {extra_context}" if extra_context else ""}

Channel voice for {channel.upper()}:
{channel_voice}

{channel_instruction}

Important: use the suggested opening line as your actual first line (adapt it for the channel's tone if needed). Cover the key points listed above. Do not invent facts beyond what's provided.

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
