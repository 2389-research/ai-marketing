"""
agents/audit_agent.py

Self-audit of the active project's own channels, built entirely from data
this pipeline already collects for real — published_posts.engagement
(agents/auto_poster.py::run_engagement_sync pulls real likes/comments/views
back from LinkedIn/X/Instagram) and generated_drafts/published_posts.format.

There is no followers/reach column anywhere in this schema, so engagement
is never reported as an absolute engagement-rate tier — it's ranked as a
percentile within that channel's OWN historical distribution of posts.

Unrelated to frontend/app/audit/page.tsx ("Presence Audit" — setup
completeness). This is performance auditing, surfaced at /performance.
"""

import os
import json
from datetime import datetime, timezone, timedelta
from bisect import bisect_left

from supabase import create_client
from dotenv import load_dotenv

from agents.project_context import scope, stamp, get_project_id
from agents.llm import chat_json, SMART

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

MIN_POSTS_FOR_HOOK_ANALYSIS = 6
HISTORY_LIMIT = 200  # posts per channel used to build the percentile baseline


def _get_posting_cadence() -> dict:
    try:
        result = scope(_supabase.table("brand_profile").select("posting_cadence")).limit(1).execute()
        if result.data:
            return result.data[0].get("posting_cadence") or {}
    except Exception:
        pass
    return {}


def _composite_score(engagement: dict | None) -> float:
    """likes + comments + 2x the platform's amplification signal (reposts on
    X, reach on Instagram) — same shape across channels even though the raw
    fields differ per platform's API."""
    if not engagement:
        return 0.0
    likes = engagement.get("likes", 0) or 0
    comments = engagement.get("comments", 0) or 0
    amplify = engagement.get("reposts", engagement.get("views", engagement.get("reach", 0))) or 0
    return float(likes + comments + 2 * amplify)


def _post_text(row: dict) -> str:
    return row.get("post_text") or row.get("content") or ""


def _active_channels() -> list[str]:
    """Channels this project has actually published to — more accurate than
    a static list, and naturally limited to channels in real use."""
    try:
        res = scope(_supabase.table("published_posts").select("channel")).execute()
        return sorted({r["channel"] for r in (res.data or []) if r.get("channel")})
    except Exception:
        return []


def _pillar_names(pillar_ids: set) -> dict:
    """Best-effort pillar-id -> name lookup. Returns {} if content_pillars
    doesn't exist yet (setup_content_pillars.sql not applied) — a missing
    pillar system must never break the audit."""
    if not pillar_ids:
        return {}
    try:
        res = _supabase.table("content_pillars").select("id, name").in_("id", list(pillar_ids)).execute()
        return {r["id"]: r["name"] for r in (res.data or [])}
    except Exception:
        return {}


def _rate_hook_quality(top: list[dict], bottom: list[dict]) -> dict:
    """One LLM call comparing the hook/opening patterns of the best- and
    worst-performing posts on this channel. Explicitly told not to claim
    causality from a 3-post sample — this is pattern description, not proof."""
    if not top and not bottom:
        return {}

    def _fmt(rows):
        return "\n".join(
            f"- [{r.get('composite_score', 0):.0f} pts] \"{_post_text(r)[:200]}\""
            for r in rows
        ) or "(none)"

    system = (
        "You compare the opening lines of a brand's best- and worst-performing social posts "
        "on one channel. With only 3 examples per group, do NOT claim a causal or statistically "
        "significant pattern — describe observable differences in hook style, specificity, and "
        "structure as a hypothesis for a human to weigh, not a conclusion.\n\n"
        'Respond ONLY with JSON: {"top_pattern": "one sentence", "bottom_pattern": "one sentence", '
        '"hypothesis": "one sentence starting with something like \'This may suggest...\'"}'
    )
    user = f"Top performing posts:\n{_fmt(top)}\n\nBottom performing posts:\n{_fmt(bottom)}"
    try:
        raw = chat_json(system, user, model=SMART, max_tokens=400)
        return json.loads(raw)
    except Exception as e:
        print(f"  [audit] Hook-quality rating failed ({e}) — skipping for this channel")
        return {}


def _audit_channel(channel: str, period_start: datetime, cadence: dict) -> dict:
    period_res = scope(
        _supabase.table("published_posts").select("*")
    ).eq("channel", channel).gte("published_at", period_start.isoformat()).execute()
    period_posts = period_res.data or []

    history_res = scope(
        _supabase.table("published_posts").select("*")
    ).eq("channel", channel).order("published_at", desc=True).limit(HISTORY_LIMIT).execute()
    history_posts = history_res.data or []

    for row in period_posts + history_posts:
        row["composite_score"] = _composite_score(row.get("engagement"))

    # Cadence: actual posts/week this period vs the target set on the Brand page.
    weeks = max((datetime.now(timezone.utc) - period_start).days / 7, 1e-6)
    cadence_actual = round(len(period_posts) / weeks, 2)
    cadence_target = cadence.get(channel, 0)

    # Content mix by format / pillar (both optional — columns may not exist yet).
    format_mix: dict = {}
    pillar_mix: dict = {}
    pillar_ids = {r["pillar_id"] for r in period_posts if r.get("pillar_id")}
    pillar_names = _pillar_names(pillar_ids)
    for r in period_posts:
        fmt = r.get("format") or "unspecified"
        format_mix[fmt] = format_mix.get(fmt, 0) + 1
        if r.get("pillar_id"):
            name = pillar_names.get(r["pillar_id"], "unknown pillar")
            pillar_mix[name] = pillar_mix.get(name, 0) + 1

    # Relative engagement: rank this period's posts against the channel's
    # own historical score distribution (no follower counts exist anywhere
    # in this schema, so an absolute engagement-rate tier isn't computable).
    # Every score ties at 0 until run_engagement_sync has real data to pull
    # (no platform_post_id yet, or credentials not configured) — that's a
    # "no data" state, not "below typical", and must be labeled as such or
    # every fresh account looks like it's underperforming from day one.
    has_signal = any(r["composite_score"] > 0 for r in history_posts)
    engagement_summary: dict = {"posts_analyzed": len(history_posts)}
    if not has_signal:
        engagement_summary["label"] = "no engagement data synced yet"
    elif len(history_posts) >= 3:
        baseline = sorted(r["composite_score"] for r in history_posts)
        percentiles = [
            bisect_left(baseline, r["composite_score"]) / len(baseline) * 100
            for r in period_posts
        ]
        if percentiles:
            median_pct = sorted(percentiles)[len(percentiles) // 2]
            engagement_summary["median_percentile_this_period"] = round(median_pct, 1)
            engagement_summary["label"] = (
                "above typical" if median_pct > 60 else
                "below typical" if median_pct < 40 else
                "typical"
            )
        else:
            engagement_summary["label"] = "no posts this period"
    else:
        engagement_summary["label"] = "not enough post history yet"

    # Hook-quality pattern check — only with a real enough sample AND real
    # engagement signal (ranking ties-at-zero by "composite score" is noise).
    hook_patterns = {}
    candidates = period_posts if len(period_posts) >= MIN_POSTS_FOR_HOOK_ANALYSIS else history_posts
    if has_signal and len(candidates) >= MIN_POSTS_FOR_HOOK_ANALYSIS:
        ranked = sorted(candidates, key=lambda r: r["composite_score"], reverse=True)
        top3, bottom3 = ranked[:3], ranked[-3:]
        rating = _rate_hook_quality(top3, bottom3)
        if rating:
            hook_patterns = {
                **rating,
                "sample_note": f"Based on top/bottom 3 of {len(candidates)} posts — too small to be conclusive.",
            }

    return {
        "posts_in_period": len(period_posts),
        "cadence_target_per_week": cadence_target,
        "cadence_actual_per_week": cadence_actual,
        "content_mix_by_format": format_mix,
        "content_mix_by_pillar": pillar_mix,
        "engagement": engagement_summary,
        "hook_patterns": hook_patterns or None,
    }


def _synthesize_recommendations(channels_findings: dict) -> list[str]:
    system = (
        "You are a social media strategist reviewing a self-audit report across a brand's channels. "
        "Give 3-6 specific, actionable recommendations grounded ONLY in the data given — cadence gaps, "
        "engagement percentile trends, format mix imbalances, or hook patterns. Do not invent metrics "
        "not present in the data.\n\n"
        'Respond ONLY with JSON: {"recommendations": ["...", ...]}'
    )
    try:
        raw = chat_json(system, json.dumps(channels_findings, default=str), model=SMART, max_tokens=600)
        data = json.loads(raw)
        return data.get("recommendations", [])
    except Exception as e:
        print(f"  [audit] Recommendation synthesis failed ({e})")
        return []


def run_audit(period_days: int = 30, save_to_db: bool = True) -> dict:
    """
    Self-audit of every channel this project has actually published to over
    the last `period_days`: cadence vs target, content mix, relative
    engagement (percentile within the channel's own history), top/bottom
    hook patterns (sample permitting), and synthesized recommendations.
    """
    period_start = datetime.now(timezone.utc) - timedelta(days=period_days)
    cadence = _get_posting_cadence()

    channels = _active_channels()
    if not channels:
        print("[audit] No published posts found for this project yet — nothing to audit.")
        return {"channels": {}, "recommendations": []}

    print(f"[audit] Auditing {len(channels)} channel(s) over the last {period_days} days: {', '.join(channels)}")
    findings = {}
    for channel in channels:
        print(f"  [audit] {channel}...")
        findings[channel] = _audit_channel(channel, period_start, cadence)

    recommendations = _synthesize_recommendations(findings)
    result = {"channels": findings, "recommendations": recommendations}

    if save_to_db:
        _supabase.table("audit_reports").insert(stamp({
            "period_start": period_start.isoformat(),
            "period_end": datetime.now(timezone.utc).isoformat(),
            "findings": result,
        })).execute()
        print(f"[audit] Saved audit report ({len(recommendations)} recommendation(s))")

    return result
