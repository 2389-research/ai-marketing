# agents/strategy_agent.py
# Reads the top research candidates from Supabase, checks for duplicate topics
# against recent published/approved posts, and uses GPT-4o to select the best
# 1-3 content angles for this week.

import os
import json
from openai import OpenAI
from supabase import create_client
from dotenv import load_dotenv
from agents.brand_context import get_brand_context

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


def _get_brand_context() -> tuple[str, list[str]]:
    return get_brand_context(mode="strategy")


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

    # Load ALL previously approved/published topics — no limit.
    # published_posts is the permanent memory (written on every approval).
    # generated_drafts catches pending topics not yet approved.
    recent_drafts = _supabase.table("generated_drafts").select("topic").in_(
        "status", ["approved", "pending"]
    ).order("created_at", desc=True).execute()

    all_posts = _supabase.table("published_posts").select("topic").order(
        "published_at", desc=True
    ).execute()

    used_topics = list({
        r["topic"] for r in (recent_drafts.data or []) + (all_posts.data or [])
        if r.get("topic")
    })

    brand_context, preferred_channels = _get_brand_context()

    # Build channel constraint for prompt
    FALLBACK_CHANNELS = ["linkedin", "instagram", "email", "tiktok", "youtube", "x"]
    active_channels = preferred_channels if preferred_channels else FALLBACK_CHANNELS
    channels_line = ", ".join(active_channels)

    # Separate company content from external research.
    # Use (... or "") to handle null source_category safely.
    def _is_company(c: dict) -> bool:
        return (c.get("source_category") or "").lower() == "company"

    company_items  = [c for c in candidates if _is_company(c)]
    external_items = [c for c in candidates if not _is_company(c)]

    if not company_items:
        print("  [strategy] No company items found — website scrape may not have run yet, "
              "or source_category column is missing from research_candidates table.")

    def fmt_candidate(i: int, c: dict) -> str:
        cat  = (c.get("source_category") or "article").upper()
        line = f"{i+1}. [{cat} · {c['source']}] {c['title']} (score: {c['score']:.1f})"
        if c.get("score_reason"):
            line += f"\n   → {c['score_reason']}"
        if c.get("summary"):
            snippet = c["summary"][:150].replace("\n", " ")
            line += f"\n   Preview: {snippet}"
        return line

    company_text  = "\n".join(fmt_candidate(i, c) for i, c in enumerate(company_items))  or "None found."
    external_text = "\n".join(fmt_candidate(i, c) for i, c in enumerate(external_items)) or "None found."
    used_count = len(used_topics)
    if used_topics:
        used_text = f"({used_count} topics already covered — do not repeat any of these):\n" + "\n".join(f"- {t}" for t in used_topics)
    else:
        used_text = "None yet — this is a fresh start."
    formats_text  = ", ".join(CONTENT_FORMATS)

    system_prompt = f"""You are a senior content strategist building a Content Strategy Matrix for a specific company.

Brand context:
{brand_context}

Your job: pick {num_topics} topic(s) and produce a complete content strategy brief for each.

─── CONTENT SOURCE PRIORITY ─────────────────────────────────────────────────

1. COMPANY CONTENT — scraped from the company's own website (features, releases, blog posts, news).
   ALWAYS prioritise these. A company posting about their own product beats posting about someone else's news.
   Company content builds brand identity, drives product discovery, and shows the world what they actually do.
   When company content exists, at least half the selected topics MUST come from it.

2. PRODUCT + TREND BRIDGE — take an external trend and use it as the entry point to explain a company feature.
   Pattern: "[Trending thing] is happening → here's why it matters → here's how [our feature] is the answer."
   This combines the reach of a trending topic with the conversion value of a product explanation.
   Use this when external research is strong but company content is weak.

3. EXTERNAL TRENDS — YouTube videos, Google Trends, RSS articles, Reddit.
   Only use pure external trends when no company angle exists. Never let them crowd out the company's story.

─── CHANNEL ASSIGNMENT RULES ────────────────────────────────────────────────

ACTIVE CHANNELS for this brand (only assign channels from this list): {channels_line}

Each channel has a different job — assign channels by matching the content to where it will land:

- linkedin: Written insights, thought-leadership, product announcements, "how we built X", B2B audience.
  Best for: educational, thought-leadership, product-launch, product-spotlight
  Avoid: short entertainment, pure visual content

- instagram: Visual, aspirational, short captions with strong first line. Consumer or brand-building.
  Best for: carousel (swipe-through tips), reel (visual script), behind-the-scenes
  Avoid: long-form text, technical deep-dives

- tiktok: Fast, entertaining, punchy hooks. Explain one thing in 30-45 seconds.
  Best for: reel (spoken voiceover), educational (simplified), trend-reaction
  Avoid: formal announcements, complex B2B content

- youtube: Long-form. Justifies a 2-3 minute video with strong narrative arc.
  Best for: podcast-clip, educational (deep), product-spotlight (demo), behind-the-scenes
  Avoid: one-liners, content that doesn't benefit from visual format

- email: Newsletter-style. Valuable to a subscriber who opted in. Can be longer.
  Best for: educational, product-spotlight, thought-leadership with deeper context
  Avoid: viral hooks, entertainment-first content

- x: Short, punchy, designed to spark a reaction or retweet. Under 240 chars or a thread.
  Best for: trend-reaction, thought-leadership (short take), behind-the-scenes (interesting fact)
  Avoid: long announcements, visual-first content

CHANNEL ASSIGNMENT RULES (STRICT):
1. Each topic gets 1–2 channels maximum. Never assign more than 2.
2. A video/reel topic (source from YouTube, trending audio, short demo) → MUST go to tiktok or instagram or youtube. NOT linkedin. NOT email.
3. A written analysis, industry report, product announcement → MUST go to linkedin or email. NOT tiktok.
4. Across the full batch of {num_topics} topics, every active channel must appear at least once (if the batch has 6+ topics).
5. No channel may receive more than half the topics in a batch. If LinkedIn tempts you for >50% of topics, reassign the extras.
6. Match FORMAT to CHANNEL: reels → tiktok/instagram. Carousels → instagram/linkedin. Podcasts → youtube. Threads → x.

─── FORMAT OPTIONS ──────────────────────────────────────────────────────────

{formats_text}

Format selection: match the format to the channel. Reels go on TikTok/Instagram. Carousels go on Instagram/LinkedIn.
Podcasts go on YouTube. Educational deep-dives go on YouTube/Email/LinkedIn.

─── GENERAL RULES ───────────────────────────────────────────────────────────

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
    "source_title": "copy the EXACT title from the candidate list above, character for character",
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

    user_message = f"""COMPANY CONTENT (from their own website — features, product angles, releases):
{company_text}

EXTERNAL TRENDS (YouTube, Google Trends, RSS, Reddit):
{external_text}

Recently published topics to avoid:
{used_text}

Build the Content Strategy Matrix for {num_topics} topic(s).

Priority order:
1. Company content items — post about their own features, products, how-tos, demos
2. Bridge: take an external trend and connect it to a company feature ("X is trending → here's how our product handles X")
3. Pure external trends — only if no company angle is available

For each topic: the channel assignment must match the content type (see rules above).
Do NOT assign linkedin to every topic. The channels in this batch must be spread across at least 3 different platforms."""

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

    # Build a lookup from title → full candidate row so we can attach research data.
    # Three-tier matching: exact → case-insensitive → longest-substring fallback.
    candidate_by_title       = {c["title"]: c for c in candidates if c.get("title")}
    candidate_by_title_lower = {c["title"].lower().strip(): c for c in candidates if c.get("title")}

    def _find_candidate(source_title: str):
        if not source_title:
            return None
        # 1. Exact match
        m = candidate_by_title.get(source_title)
        if m:
            return m
        # 2. Case-insensitive
        m = candidate_by_title_lower.get(source_title.lower().strip())
        if m:
            return m
        # 3. Substring — find the candidate whose title has the most overlap
        needle = source_title.lower()
        best, best_score = None, 0
        for title, cand in candidate_by_title.items():
            t = title.lower()
            if needle in t or t in needle:
                score = len(set(needle.split()) & set(t.split()))
                if score > best_score:
                    best, best_score = cand, score
        return best if best_score >= 3 else None

    for item in selected:
        source_title = item.get("source_title", "")
        match = _find_candidate(source_title)
        if match:
            # Attach source material so content_agent can write from real facts
            item["source_summary"] = match.get("summary") or ""
            item["source_url"]     = match.get("source_url") or ""
            item["source_meta"]    = match.get("metadata") or {}

            # Mark as selected in Supabase (match by ID when possible, title as fallback)
            cid = match.get("id")
            if cid:
                _supabase.table("research_candidates").update({"selected": True}).eq("id", cid).execute()
            else:
                _supabase.table("research_candidates").update({"selected": True}).eq("title", source_title).execute()
        else:
            item.setdefault("source_summary", "")
            item.setdefault("source_url", "")
            item.setdefault("source_meta", {})

    return selected
