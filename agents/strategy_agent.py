# agents/strategy_agent.py
# Reads the top research candidates from Supabase, checks for duplicate topics
# against recent published/approved posts, and uses GPT-4o to select the best
# 1-3 content angles for this week.

import os
import json
from supabase import create_client
from dotenv import load_dotenv
from agents.brand_context import get_brand_context
from agents.project_context import scope, stamp, get_project_id, get_channel_group_ids, get_project_name
from agents.llm import chat_json, SMART, FAST

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


VISUAL_CHANNELS = {"instagram", "instagram_stories", "pinterest"}

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


def _filter_semantic_duplicates(selected: list[dict], used_topics: list[str]) -> list[dict]:
    """Belt-and-suspenders check beyond the exact-string dedup already applied
    via used_topics in the prompt: catch topics that reword an already-covered
    idea (e.g. "AI governance risks" vs "data governance breaking under AI
    pressure"). One cheap batched Haiku call, never blocks generation on
    failure — this is a quality filter, not a gate."""
    if not selected or not used_topics:
        return selected

    listing      = "\n".join(f"[{i}] {s['topic']}" for i, s in enumerate(selected))
    used_listing = "\n".join(f"- {t}" for t in used_topics)
    prompt = f"""New candidate topics:
{listing}

Already-covered topics (any phrasing/angle):
{used_listing}

Which candidate indices cover substantially the SAME underlying idea as an
already-covered topic, even if worded differently? Return ONLY a JSON array
of the duplicate indices, e.g. [0,2]. Empty array if none."""

    try:
        raw   = chat_json("You detect duplicate content ideas.", prompt, model=FAST, max_tokens=200)
        dupes = set(int(i) for i in json.loads(raw))
    except Exception as e:
        print(f"  [strategy] Semantic dedup check failed ({e}) — skipping this pass")
        return selected

    if dupes:
        print(f"  [strategy] Filtered {len(dupes)} semantic duplicate(s): "
              f"{[selected[i]['topic'][:50] for i in dupes if i < len(selected)]}")
    return [s for i, s in enumerate(selected) if i not in dupes]


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
    result = scope(_supabase.table("research_candidates").select("*")).order("score", desc=True).limit(20).execute()
    candidates = result.data

    if not candidates:
        raise ValueError("No research candidates in Supabase. Run the Research Agent first.")

    # Load ALL previously approved/published topics — no limit.
    # published_posts is the permanent memory (written on every approval).
    # generated_drafts catches pending topics not yet approved.
    recent_drafts = scope(_supabase.table("generated_drafts").select("topic").in_(
        "status", ["approved", "pending"]
    )).order("created_at", desc=True).execute()

    all_posts = scope(_supabase.table("published_posts").select("topic")).order(
        "published_at", desc=True
    ).execute()

    used_topics = list({
        r["topic"] for r in (recent_drafts.data or []) + (all_posts.data or [])
        if r.get("topic")
    })

    # ── Linked-project awareness ──────────────────────────────────────────────
    # If this project shares real social channels with another one (see
    # get_channel_group_ids), pull that project's own topics so this project's
    # agent doesn't treat the linked project's product/news as fresh — and
    # compute a content-pillar cap so this project doesn't over-focus on it.
    own_pid = get_project_id()
    linked_ids = [pid for pid in (get_channel_group_ids(own_pid) if own_pid else []) if pid != own_pid]

    linked_topics: list[str] = []
    linked_project_name = ""
    linked_context_block = ""
    linked_cap_note = ""

    if linked_ids:
        try:
            linked_project_name = get_project_name(linked_ids[0])
            linked_posts = _supabase.table("published_posts").select("topic").in_("project_id", linked_ids).execute()
            linked_drafts = _supabase.table("generated_drafts").select("topic").in_(
                "project_id", linked_ids
            ).in_("status", ["approved", "pending"]).execute()
            linked_topics = list({
                r["topic"] for r in (linked_posts.data or []) + (linked_drafts.data or [])
                if r.get("topic")
            })
        except Exception as e:
            print(f"  [strategy] Linked-project topic lookup failed ({e}) — skipping")

        if linked_topics:
            linked_list = "\n".join(f"- {t}" for t in linked_topics[:20])
            linked_context_block = f"""
─── ALREADY COVERED BY {linked_project_name or 'a linked project'} (shares your real social channels) ─

{linked_project_name or 'That project'} runs its OWN dedicated, ongoing campaign and has
already covered:
{linked_list}

Do NOT introduce any of these as fresh news. If one of these topics/products comes
up, treat it as already established — keep it a brief supporting mention, not the
main subject of a new post.
"""

        # Content-pillar cap: how much of THIS project's own recent output has
        # already centered on the linked project's product — steer away once
        # over the configured ratio (default 0.25), a real computed signal
        # rather than a static instruction.
        if linked_project_name:
            try:
                bp = scope(_supabase.table("brand_profile").select("linked_topic_cap_ratio")).limit(1).execute()
                cap_ratio = (bp.data[0].get("linked_topic_cap_ratio") if bp.data else None) or 0.25
                recent_own = [r["topic"] for r in (all_posts.data or [])[:10] if r.get("topic")]
                # Match on the first word of the project's name, not the full
                # string — project names are admin labels and often carry
                # extra words (e.g. "JEFF CEO"), which would never appear
                # verbatim in a real post topic that just says "Jeff".
                match_term = linked_project_name.split()[0] if linked_project_name.split() else linked_project_name
                if recent_own:
                    mentions = sum(1 for t in recent_own if match_term.lower() in t.lower())
                    ratio = mentions / len(recent_own)
                    if ratio >= cap_ratio:
                        linked_cap_note = (
                            f"\nNote: {mentions} of your last {len(recent_own)} posts already centered on "
                            f"{linked_project_name} ({ratio:.0%}) — steer away from a {linked_project_name}-"
                            f"centered topic this round; favor your other content pillars instead.\n"
                        )
            except Exception as e:
                print(f"  [strategy] Linked-topic cap check failed ({e}) — skipping")

    # ── Content pillars (approved via narrative brief) ───────────────────────
    # Same idea as the linked-project cap above — steer away once a pillar is
    # over its target share of recent output — but exact rather than fuzzy:
    # pillar_id is tagged explicitly on each topic below (and persisted by
    # content_agent.py), so compute_pillar_actuals() counts real tags instead
    # of a name-substring guess. See agents/pillar_agent.py.
    from agents.pillar_agent import get_active_pillars, compute_pillar_actuals
    active_pillars = get_active_pillars(own_pid)
    pillar_context_block = ""
    pillar_lookup_by_name: dict[str, str] = {}

    if active_pillars:
        pillar_actuals = compute_pillar_actuals(own_pid)
        pillar_lines = []
        cap_notes = []
        for p in active_pillars:
            pillar_lookup_by_name[p["name"].strip().lower()] = p["id"]
            examples = ", ".join(p.get("example_topics") or [])
            line = f"- {p['name']} ({p.get('pillar_type', 'theme')}): {p.get('description', '')}"
            if examples:
                line += f"\n  Example angles: {examples}"
            pillar_lines.append(line)

            actual = pillar_actuals.get(p["id"], 0.0)
            target = p.get("target_ratio") or 0.25
            if actual >= target:
                cap_notes.append(
                    f"- '{p['name']}' is at {actual:.0%} of your recent posts (target {target:.0%}) — "
                    f"steer toward your other pillars this round unless the research strongly favors it."
                )

        nl = chr(10)
        cap_notes_block = f"Pillar cap notes:{nl}{nl.join(cap_notes)}" if cap_notes else ""
        pillar_context_block = f"""
─── ACTIVE CONTENT PILLARS (approved via narrative brief) ───────────────────

These are a FILTER, not a source of topics — same rule as the freeform
Content Pillars in the brand strategy doc below, but these are the
operative signal and take priority if the two ever conflict.

{nl.join(pillar_lines)}
{cap_notes_block}

For each selected topic, set "pillar" to the exact name of the pillar it
serves (copy it character for character from the list above), or "" if the
topic doesn't clearly serve any of them.
"""

    # ── Content maturity phase ────────────────────────────────────────────────
    # Count all-time activity across both tables so we know where in the
    # content journey this brand is and can pick appropriate topics.
    total_published = len(all_posts.data or [])
    total_drafted   = len(recent_drafts.data or [])
    total_pieces    = total_published + total_drafted

    if total_pieces == 0:
        content_phase = "new"
        phase_note = f"""
─── CONTENT PHASE: BRAND NEW ────────────────────────────────────────────────

This brand has ZERO posts published and ZERO drafts created. It is starting
from scratch. The audience knows nothing about who this brand is.

REQUIRED for Phase 0 — the first post must establish identity, not comment on trends:
  1. Brand introduction — who this company is, what it does, why it exists.
     Human, warm, specific. Not a press release — a first handshake.
  2. Founder/origin story — why was this built? What problem did it solve
     for the founder before solving it for others?
  3. Core value proposition — what does the product actually DO, in plain language.

You MAY use one trending topic as a HOOK for the introduction
(e.g. "Everyone is talking about X → that is exactly why we built [product]")
but the body must introduce the brand, not analyze the trend.

NEVER pick a pure news analysis or external trend commentary as the first post.
No one knows who this brand is yet — lead with identity, not commentary.
"""
    elif total_pieces < 10:
        covered = "\n".join(f"  - {t}" for t in used_topics[:10])
        content_phase = "early"
        phase_note = f"""
─── CONTENT PHASE: EARLY STAGE ({total_pieces} piece(s) so far) ─────────────────────

Topics already covered — build on these, do not repeat them:
{covered}

For this phase:
  - The brand introduction has been done. Now go deeper on specific aspects.
  - Introduce product features and concrete use cases one at a time.
  - Trends and external content are now appropriate — connect them to the brand.
  - Each topic should add something the audience hasn't heard from this brand yet.
  - One new "brand story" angle is still acceptable if it covers a side not yet explored.
"""
    else:
        covered = "\n".join(f"  - {t}" for t in used_topics[:20])
        content_phase = "established"
        phase_note = f"""
─── CONTENT PHASE: ESTABLISHED ({total_pieces} pieces so far) ────────────────────────

Topics already covered (avoid repeating):
{covered}

Standard full-range content strategy applies. Prioritize variety, freshness,
and topics that extend rather than repeat what's already been published.
"""

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
{phase_note}
{linked_context_block}{linked_cap_note}{pillar_context_block}
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

- instagram_stories: Ephemeral, interactive, behind-the-scenes. Only for the existing community, not discovery.
  Best for: behind-the-scenes, quick reactions, countdowns/announcements
  Avoid: anything meant to reach new audiences — Stories only show to existing followers

- youtube_shorts: Vertical, under 60s, search-friendly unlike TikTok.
  Best for: educational (simplified), trend-reaction, product-spotlight (quick demo)
  Avoid: long narrative arcs — save those for youtube (long-form)

- pinterest: Search-engine mindset, not social. High-intent, planning/discovery.
  Best for: educational (how-to/step-by-step), product-spotlight (as an infographic-style pin)
  Avoid: trend-reaction, behind-the-scenes, anything time-sensitive or opinion-based

- reddit: Community value-add, never promotional. Practitioner voice, not brand voice.
  Best for: educational, behind-the-scenes (genuine process/lessons-learned)
  Avoid: product-launch, product-spotlight, thought-leadership — these read as marketing and get removed

- threads: Casual, conversational, more relaxed than X. Instagram's audience in a browsing mood.
  Best for: trend-reaction, behind-the-scenes, thought-leadership (short, casual take)
  Avoid: product-launch, formal announcements

CHANNEL ASSIGNMENT RULES (STRICT):
1. TIERS — exactly ONE topic in the batch is the "pillar": the strongest, most broadly relevant idea, marked "tier": "pillar". The pillar gets ALL active channels (it will be natively adapted per platform downstream, not copy-pasted). Every other topic is "tier": "standard" and gets 1–2 best-fit channels maximum — never stretch a niche idea onto platforms where it doesn't belong.
2. A video/reel topic (source from YouTube, trending audio, short demo) → standard-tier assignment MUST go to tiktok, instagram, youtube, or youtube_shorts. NOT linkedin. NOT email.
3. A written analysis, industry report, product announcement → standard-tier assignment MUST go to linkedin or email. NOT tiktok, NOT reddit.
4. Coverage: the pillar already guarantees every active channel gets at least one post — do not force standard topics onto ill-fitting channels for coverage.
5. No channel may receive more than half of the STANDARD topics in a batch. If LinkedIn tempts you for >50% of them, reassign the extras.
6. Match FORMAT to CHANNEL: reels → tiktok/instagram/youtube_shorts. Carousels → instagram/linkedin. Podcasts → youtube. Threads → x.
7. reddit NEVER gets product-launch or product-spotlight format — only educational or behind-the-scenes, reframed as a practitioner's genuine post, not a company announcement.

─── FORMAT OPTIONS ──────────────────────────────────────────────────────────

{formats_text}

Format selection: match the format to the channel. Reels go on TikTok/Instagram. Carousels go on Instagram/LinkedIn.
Podcasts go on YouTube. Educational deep-dives go on YouTube/Email/LinkedIn.

─── CONTENT PILLARS ARE A FILTER, NOT A SOURCE ──────────────────────────────

The brand context may contain Content Pillars with example topics. These are
a LENS to evaluate research candidates — they are NOT a source of content ideas.

NEVER generate a topic that isn't directly grounded in a specific item from the
research candidate list above. If a brand example topic like "Using Jeff to
Automate Workflows" appears in the brand context, do not use it unless there is
an actual research candidate (article, video, trend) in the list that you are
drawing from. The example topics show the STYLE and ANGLE the brand wants —
always apply that style to real, current research material.

─── VISUAL BRIEF (only for image-first topics) ──────────────────────────────

If this topic is assigned to a visual channel ({", ".join(sorted(VISUAL_CHANNELS))})
or uses the carousel format, set "visual_brief" to 2-3 concrete sentences telling
a human what to photograph or illustrate — specific subject, composition, mood,
and any brand element to include. Not a mood board description, an actual shot
list a person could act on with a phone camera or a simple design tool. For every
other topic (text/video-only channels), set "visual_brief" to "".

─── GENERAL RULES ───────────────────────────────────────────────────────────

- Every topic must link to a specific research candidate (fill source_title correctly)
- Don't just repeat the headline — define a specific, ownable angle for this brand
- The hook must be a concrete opening line a writer can use directly
- key_points must be 3 specific things the content should communicate
- Avoid topics too similar to recently published ones
- Be specific enough that a writer can produce the content without further research

Respond ONLY with a valid JSON array — no markdown, no preamble:
[
  {{
    "topic": "The specific content angle for this brand",
    "tier": "pillar or standard — exactly one pillar per batch",
    "channels": ["linkedin", "instagram"],
    "source_title": "copy the EXACT title from the candidate list above, character for character",
    "source_category": "company or external",
    "format": "one of the format options above",
    "pillar": "exact name of the active content pillar this topic serves, or empty string if none",
    "visual_brief": "concrete shot/illustration direction for image-first channels, or empty string",
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

CRITICAL: Every topic you select MUST be grounded in one of the research candidates
listed above. Set source_title to the exact title of that candidate. Do not invent
topics from memory or from example topics in the brand context — only use what is
in the lists above. The brand's Content Pillars tell you WHAT ANGLE to take on a
real candidate, not what topics to make up.

Priority order:
1. Company content items — post about their own features, products, how-tos, demos
2. Bridge: take an external trend and connect it to a company feature ("X is trending → here's how our product handles X")
3. Pure external trends — only if no company angle is available

For each topic: the channel assignment must match the content type (see rules above).
Do NOT assign linkedin to every topic. The channels in this batch must be spread across at least 3 different platforms."""

    # max_tokens is shared between Claude's internal "thinking" tokens and the
    # visible JSON output — thinking usage varies per call (observed 50%+ of
    # the budget on some runs), so 4000 wasn't enough headroom and the JSON
    # occasionally got cut off mid-string on a larger topic batch. One retry
    # with more headroom before giving up with a clear error instead of a
    # raw JSONDecodeError traceback.
    raw = chat_json(system_prompt, user_message, model=SMART, max_tokens=8000)
    try:
        selected = json.loads(raw)
    except json.JSONDecodeError:
        print("  [strategy] Response was cut off — retrying with more room...")
        raw = chat_json(system_prompt, user_message, model=SMART, max_tokens=12000)
        try:
            selected = json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                "Strategy generation failed twice in a row — the response kept getting "
                "cut off before finishing. Try a smaller --topics count."
            ) from e

    # Enforce the tier rules in code — stated in the prompt but the model
    # doesn't always follow them, and nothing downstream else checks.
    # Standard topics: 1-2 channels max. Pillar handled after dedupe below.
    for item in selected:
        chans = item.get("channels") or ["linkedin"]
        if item.get("tier") != "pillar" and len(chans) > 2:
            print(f"  [strategy] Strategy returned {len(chans)} channels for "
                  f"standard topic '{item.get('topic', '')[:50]}' — capping to 2")
            chans = chans[:2]
        item["channels"] = chans
        # Resolve the model's pillar NAME to a real pillar_id — never trust
        # it blindly, since the model can misspell/invent a name that isn't
        # in pillar_lookup_by_name (built from the exact approved rows above).
        item["pillar_id"] = pillar_lookup_by_name.get((item.get("pillar") or "").strip().lower())

    selected = _filter_semantic_duplicates(selected, used_topics + linked_topics)

    # Tier enforcement AFTER dedupe (the filter may have dropped the model's
    # pillar): exactly one pillar per batch, and the pillar carries ALL active
    # channels — that alone guarantees every channel gets at least one post.
    if selected:
        pillars = [i for i in selected if i.get("tier") == "pillar"]
        if not pillars:
            selected[0]["tier"] = "pillar"          # promote the top-ranked topic
            pillars = [selected[0]]
        for extra in pillars[1:]:                    # model marked several — demote
            extra["tier"] = "standard"
            extra["channels"] = (extra.get("channels") or ["linkedin"])[:2]
        pillar = pillars[0]
        pillar["channels"] = list(active_channels)
        print(f"  [strategy] Pillar topic → all {len(active_channels)} active channels: "
              f"'{pillar.get('topic', '')[:60]}'")

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

    # Build phase context string for the content agent writer
    if content_phase == "new":
        phase_context_for_writer = (
            "This is the brand's FIRST EVER social media post. "
            "Write it as a genuine introduction — who we are, what we do, why we exist. "
            "Warm, human, specific. Not a press release. Make the reader feel like they just met "
            "a real person who built something they care about."
        )
    elif content_phase == "early":
        recent = ", ".join(used_topics[:5]) if used_topics else "none yet"
        phase_context_for_writer = (
            f"This brand is in its early content stage ({total_pieces} pieces so far). "
            f"Topics already covered: {recent}. "
            "Build on what's been established — go deeper, add a new angle, or introduce a specific feature. "
            "Write as a brand that has just introduced itself and is now showing what it can do."
        )
    else:
        phase_context_for_writer = ""

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
            # GPT generated a topic with no matching research candidate — likely
            # hallucinated from the brand's example topics. Log a warning so the
            # user can see it during preview/generate output.
            print(f"  [strategy] WARNING: no research candidate matched '{source_title}' "
                  f"— topic '{item.get('topic', '')[:50]}' may be hallucinated. "
                  f"Consider running research again or rejecting this draft.")
            item["source_summary"] = ""
            item["source_url"]     = ""
            item["source_meta"]    = {}
            item["_unmatched"]     = True  # flag for frontend to optionally surface

        # Attach phase context so the content agent writes at the right stage
        item["content_phase"]         = content_phase
        item["content_phase_context"] = phase_context_for_writer

    return selected
