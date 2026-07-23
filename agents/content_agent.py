# agents/content_agent.py
# Takes a topic + list of target channels.
# Returns a dict of {channel: draft_text} and saves to Supabase.

import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client
from dotenv import load_dotenv
from config.brand_voice import BRAND_VOICE, get_brand_voice_prompt
from agents.style_rules import banned_words_prompt_line
from agents.brand_context import get_brand_context
from agents.project_context import scope, stamp
from agents.llm import chat, SMART

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def _get_brand_system_prompt() -> str:
    """Build a system prompt using the shared brand context at full (generation) verbosity."""
    brand_ctx, _ = get_brand_context(mode="generation")

    # Extract company name for the opening line
    company = BRAND_VOICE["lab_name"]
    for line in brand_ctx.splitlines():
        if line.startswith("Company:"):
            company = line[len("Company:"):].strip()
            break

    return (
        f"You are a content writer for {company}.\n\n"
        f"Brand context — use this to guide voice, tone, and what to emphasise:\n{brand_ctx}\n\n"
        "Always write as a knowledgeable human on the team — not a marketing bot. "
        "Never use phrases like: game-changer, cutting-edge, revolutionary, "
        "we are excited to announce, leverage, synergy, unlock potential.\n\n"
        "## Writing rules — avoid AI patterns\n"
        "These make writing sound robotic. Violating them will get the draft rejected.\n\n"
        "BANNED WORDS: actually, additionally, align with, crucial, delve, emphasizing, "
        "enduring, enhance, fostering, garner, highlight (verb), interplay, intricate, "
        "key (adjective), landscape (abstract), pivotal, showcase, tapestry, testament, "
        "underscore (verb), valuable, vibrant, stands as, serves as, boasts, "
        f"{banned_words_prompt_line()}.\n\n"
        "QA runs a hard automated check for these words, for more than one em dash, "
        "and for the banned structures below — violations FAIL the draft, so treat "
        "every rule here as mechanical, not stylistic advice.\n\n"
        "BANNED STRUCTURES:\n"
        "- Puffed-up significance: 'marking a pivotal moment', 'setting the stage for', "
        "'reflects broader trends', 'indelible mark'\n"
        "- Fake depth with -ing: 'highlighting how...', 'showcasing the...', 'symbolizing...'\n"
        "- Vague authority: 'experts argue', 'industry reports suggest', 'observers note'\n"
        "- Formulaic sections: 'Challenges and Future Prospects', 'Despite X, Y continues to thrive'\n"
        "- Not only/but also, It's not just about... it's about...\n"
        "- Em dash overuse — do not use more than one per post\n"
        "- Rule of three lists: first, second, third / A, B, and C patterns everywhere\n"
        "- Throat-clearing openers: 'In today's world', 'In an era of', 'It goes without saying'\n\n"
        "WRITE LIKE A HUMAN: vary sentence length, use simple copulas (is/are not 'serves as'), "
        "have an opinion, be specific over vague, cite real things not 'sources say'."
    )


def _fallback_voice(company_name: str) -> str:
    tone   = "\n".join(f"- {t}" for t in BRAND_VOICE["tone_descriptors"])
    rules  = "\n".join(f"- {r}" for r in BRAND_VOICE["content_rules"])
    return f"\nTone:\n{tone}\n\nContent rules:\n{rules}"

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
- The first line must be a COMPLETE, standalone thought under ~140 characters — LinkedIn
  truncates and shows "see more" right around there. Never end the visible portion on a
  fragment; it must read as a finished idea even if nothing after it is seen.
- Can include 1-2 short paragraphs and 3-5 bullet points if it helps readability
- End with a question or clear observation, not a CTA button phrase
- No hashtags (LinkedIn reach doesn't depend on them for technical audiences)
""",
    "instagram": """
Write an Instagram caption.
- For a Reel: 40 words MAX. The video carries the message — the caption is a supplement,
  not a script. Just the hook + one line of context.
- For a static post or carousel: 60-120 words. First line must work as a standalone hook
  (it's all that shows before "more"). Conversational, visual, specific.
- End with 3-5 relevant hashtags on a new line
""",
    "instagram_stories": """
Write an Instagram Stories frame-by-frame plan (NOT a single caption).
- One idea per frame, 3-7 frames total — more than that and people drop off
- Every story frame plan must call out at least one interactive element:
  a poll, question sticker, quiz, or slider — Stories that are static graphics with no
  interaction underperform badly
- Format: [FRAME 1] one line of text/visual direction + interactive element if any
  [FRAME 2] ... etc.
- Feels more spontaneous and behind-the-scenes than a polished feed post
- If this frame references something off-app, note where a link sticker goes
""",
    "email": """
Write a marketing email.
- Subject line (under 50 chars, no clickbait)
- Preview text (under 90 chars) — it must add NEW information the subject line doesn't
  already give away. If the subject poses a question, the preview should not answer it;
  if the subject states the topic, the preview should add the hook or stakes.
- Body: 100-180 words
- One clear CTA at the end (text only, no button markup)
- Format: Subject: ...\nPreview: ...\n\n[body]
""",
    "tiktok": """
Write a TikTok video script (voiceover).
- Length: 100-150 words max (approx 30-45 second video)
- The hook must land in the first 1-2 SECONDS of spoken audio, not just "the first
  sentence" — write the first 5-8 words to be sayable in under 2 seconds, before any
  setup or context. No slow intros.
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
- After the script, add a CHAPTERS block with suggested timestamp labels (e.g.
  "0:00 Hook, 0:15 Context, ...") so the poster can paste them straight into the
  video description
""",
    "youtube_shorts": """
Write a YouTube Shorts script (voiceover) — under 60 seconds, vertical format.
- Length: 80-130 words
- Hook text + spoken hook must both land in the first 3 seconds
- Unlike TikTok, give this a search-friendly angle: state the specific thing being taught
  or shown early enough that it could double as the video's title
- Prefer content that loops or has a clear payoff by the end — Shorts auto-replay
- Label sections: [HOOK] [BODY] [CTA]
""",
    "x": """
Write an X (Twitter) post.
- Length: 240 characters max (leave room for any link)
- First line is everything — make it punchy and specific
- No filler words, no padding, no "excited to share"
- NO hashtags — on X specifically (unlike Instagram) hashtags read as spam and hurt
  reach, they don't help discovery
- End with a specific, answerable question or a deliberately incomplete thought that
  invites a reply — not a generic CTA phrase
- For complex topics, write a thread: label each tweet [1/N], [2/N] etc., each under 240 chars
""",
    "threads": """
Write a Threads post.
- Conversational, first-person, more casual than LinkedIn — Threads' audience is
  Instagram's audience, in a browsing not working mindset
- 2-4 lines max for a single post
- No hashtags — Threads has no real hashtag culture yet
- For a thread: each post is one idea, under 3 lines each
- Genuine humor is fine here; corporate tone reads badly on this platform
""",
    "pinterest": """
Write a Pinterest pin.
- This is a search engine, not a social feed — write for someone in planning/discovery
  mode searching a specific term, not scrolling for entertainment
- Pin title: 60-100 characters, include the primary keyword naturally
- Pin description: 100-300 characters, keyword-rich, states what this is and who it's for
- Format: Title: ...\nDescription: ...
- No hashtags, no casual tone — this is closer to SEO copy than social copy
""",
    "reddit": """
Write a Reddit post — a value-first community contribution, NOT a promotional post.
- Write like a practitioner who happens to work at this company, not a marketer who
  works for it. Reddit has near-zero tolerance for anything that reads as marketing copy.
- Never pitch the product directly or open with the brand name. Share a genuinely useful
  finding, honest question, or specific how-to — the kind of post that would get upvoted
  even from someone with no connection to the company.
- No hashtags, no CTA, no "check out our website" — if the brand is mentioned at all, it's
  one factual clause, not the point of the post.
- Format: Title: ...\nBody: [100-300 words, plain and direct, first-person]
""",
}


_CHANNEL_EARLY_THRESHOLD = 10  # matches strategy_agent.py's project-level phase threshold


def _channel_history_count(channel: str) -> int:
    """Posts + pending/approved drafts on this ONE channel — independent of
    how established the project is elsewhere. A project can be "established"
    overall (e.g. 30 LinkedIn posts) while a channel it just turned on
    (e.g. YouTube) still has zero — that channel's own audience has never
    seen anything from this brand, regardless of the project's global phase.
    Fails open to a large number (treated as "established") so a lookup
    hiccup never forces an unwanted intro note."""
    try:
        published = scope(_supabase.table("published_posts").select("id", count="exact")).eq("channel", channel).execute()
        drafted = scope(
            _supabase.table("generated_drafts").select("id", count="exact")
        ).eq("channel", channel).in_("status", ["approved", "pending"]).execute()
        return (published.count or 0) + (drafted.count or 0)
    except Exception:
        return 999


def _channel_phase_note(channel: str) -> str:
    count = _channel_history_count(channel)
    if count == 0:
        return (
            f"This is the very first post ever published on {channel} for this brand. Even if "
            f"the brand is well-established on other channels, {channel}'s own audience has never "
            f"seen anything from it yet — introduce the brand/product natively for {channel} "
            f"rather than assuming existing familiarity on this specific platform."
        )
    if count < _CHANNEL_EARLY_THRESHOLD:
        return (
            f"This brand is still early on {channel} specifically ({count} piece(s) posted here "
            f"so far) — keep building foundational context on this platform rather than assuming "
            f"deep familiarity yet."
        )
    return ""


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

    brand_voice_prompt = _get_brand_system_prompt()
    drafts = {}

    # Channels the strategy specifically targeted (inform format, not which channels get content)
    strategy_channels = set((strategy or {}).get("channels") or [])

    # Research block is shared across all channels — same facts, adapted format
    research_block = ""
    if strategy:
        summary = (strategy.get("source_summary") or "").strip()
        url     = (strategy.get("source_url") or "").strip()
        if summary:
            research_block = f"Source material (use these facts — do not invent your own):\n{summary}"
            if url:
                research_block += f"\nSource URL: {url}"

    for channel in channels:
        # Format instructions only apply to the channel(s) the strategy explicitly targeted.
        # Other channels use their own CHANNEL_INSTRUCTIONS without a conflicting format override.
        is_primary = not strategy_channels or channel in strategy_channels
        fmt = (strategy or {}).get("format", "") if is_primary else ""

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
        channel_instruction = CHANNEL_INSTRUCTIONS[channel]
        channel_voice = BRAND_VOICE["channel_voice"].get(channel, "")

        # Content maturity: project-level phase (computed by strategy_agent.py,
        # previously computed but never actually threaded through to here) plus
        # this specific channel's own history — a channel just turned on needs
        # its own debut treatment even inside an otherwise-established project.
        phase_notes = [
            n for n in [(strategy or {}).get("content_phase_context", ""), _channel_phase_note(channel)] if n
        ]
        phase_block = "Content maturity context:\n" + "\n".join(phase_notes) if phase_notes else ""

        # Sibling-channel awareness: without this, every channel gets told to
        # "use the suggested opening line" verbatim, so multi-channel drafts
        # of the same topic end up as the same post reformatted. The first
        # channel still gets the suggested hook; later channels see what was
        # already written and are told to diverge from it.
        if drafts:
            prior_hooks = "\n".join(
                f'- {ch.upper()}: "{info["draft_text"][:150]}..."'
                for ch, info in drafts.items()
            )
            opening_instruction = (
                f"Already written for this same topic on other channels:\n{prior_hooks}\n\n"
                "Make this take clearly different — a different hook, angle, or emphasis than "
                "the above. Keep the same underlying facts, but don't just reformat the same opening."
            )
        else:
            opening_instruction = (
                "Use the suggested opening line as your first line (adapt for channel tone if needed)."
            )

        user_message = f"""
Topic: {topic}

{strategy_block}

{phase_block}

{research_block}

{f"Additional context: {extra_context}" if extra_context else ""}

Channel voice for {channel.upper()}:
{channel_voice}

{channel_instruction}

{opening_instruction}
Ground every claim in the source material above — if the source doesn't mention it, don't include it.
Write the {channel} content now. Output only the post/script — no preamble.
""".strip()

        draft_text = chat(brand_voice_prompt, user_message, model=SMART, max_tokens=1000)
        draft_id = None

        if save_to_db:
            result = _supabase.table("generated_drafts").insert(stamp({
                "topic":      topic,
                "channel":    channel,
                "draft_text": draft_text,
                "qa_passed":  None,
                "status":     "pending",
                "source_url": (strategy or {}).get("source_url", "") or "",
                # The topic's content format applies to every channel it's
                # written for, even channels where `fmt` above was withheld
                # from the prompt because the strategy didn't target them.
                "format":       (strategy or {}).get("format") or None,
                "pillar_id":    (strategy or {}).get("pillar_id") or None,
                "visual_brief": (strategy or {}).get("visual_brief") or None,
            })).execute()
            if result.data:
                draft_id = result.data[0]["id"]

        drafts[channel] = {"draft_text": draft_text, "draft_id": draft_id}

    return drafts
