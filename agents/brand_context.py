"""
Shared brand context loader.
All agents import from here so every stage of the pipeline sees
the same brand profile, just at different verbosity levels.

mode="scoring"    — compact, for research-scoring agents  (strategy ≤ 1 000 chars)
mode="strategy"   — fuller, for topic-selection agent     (strategy ≤ 1 800 chars)
mode="generation" — maximum, for the content writer       (strategy ≤ 3 500 chars)
"""

import os
from functools import lru_cache
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

_FALLBACK_CTX = "Tech startup building AI-powered productivity tools."
_FALLBACK_CHANNELS: list[str] = []

_STRATEGY_LIMITS = {
    "scoring":    1_000,
    "strategy":   1_800,
    "generation": 3_500,
}

# Path to the competitive insights file — lives at the project root alongside agents/
_INSIGHTS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "brand_competitive_insights.md")

def _load_competitor_report(project_id: str | None, max_chars: int) -> str:
    """Latest agents/competitor_agent.py report for this project, formatted
    as short prose. Returns "" if competitor_reports doesn't exist yet
    (sql/setup_competitor_intel.sql not applied) or no report has run yet."""
    try:
        q = _supabase.table("competitor_reports").select("findings").order("generated_at", desc=True)
        if project_id:
            q = q.eq("project_id", project_id)
        res = q.limit(1).execute()
        if not res.data:
            return ""
        findings = res.data[0].get("findings") or {}
        parts = []
        for c in findings.get("competitors", []):
            if c.get("positioning_summary"):
                parts.append(f"- {c['name']}: {c['positioning_summary']}")
        if findings.get("whitespace_angles"):
            parts.append("Whitespace angles: " + "; ".join(findings["whitespace_angles"]))
        text = "\n".join(parts).strip()
        return text[:max_chars] if len(text) > max_chars else text
    except Exception:
        return ""


def _load_audit_insights(project_id: str | None, max_chars: int = 800) -> str:
    """Latest agents/audit_agent.py recommendations for this project. Returns
    "" if audit_reports doesn't exist yet or no audit has run yet. Mirrors
    _load_competitor_report — audit findings previously only reached content
    generation through the narrative-brief approval gate; this makes them
    shape every generation run directly, the same way competitor intel does,
    instead of being informational-only unless a brief happens to get approved."""
    try:
        q = _supabase.table("audit_reports").select("findings").order("created_at", desc=True)
        if project_id:
            q = q.eq("project_id", project_id)
        res = q.limit(1).execute()
        if not res.data:
            return ""
        recs = (res.data[0].get("findings") or {}).get("recommendations") or []
        if not recs:
            return ""
        text = "\n".join(f"- {r}" for r in recs)
        return text[:max_chars] if len(text) > max_chars else text
    except Exception:
        return ""


def _load_competitive_insights(max_chars: int = 1_200, project_id: str | None = None) -> str:
    """Competitive intelligence for the active project. Prefers the DB-backed
    competitor_agent.py report (fresher, per-project) and falls back to the
    hand-written brand_competitive_insights.md file if no DB report exists
    yet — the file keeps working exactly as before until a report lands."""
    db_report = _load_competitor_report(project_id, max_chars)
    if db_report:
        return db_report
    try:
        with open(_INSIGHTS_PATH, "r", encoding="utf-8") as f:
            text = f.read().strip()
        return text[:max_chars] if len(text) > max_chars else text
    except FileNotFoundError:
        return ""

# Cache the raw DB row per project so every agent doesn't hit Supabase separately.
@lru_cache(maxsize=8)
def _load_profile(project_id: str | None = None) -> dict:
    try:
        # select("*") on purpose: naming columns here means a not-yet-applied
        # migration (user runs setup_*.sql by hand) would error the whole
        # select and silently wipe the brand context for every agent.
        q = _supabase.table("brand_profile").select("*")
        if project_id:
            q = q.eq("project_id", project_id)
        res = q.limit(1).execute()
        if res.data:
            return res.data[0]
    except Exception:
        pass
    return {}


def get_brand_context(mode: str = "scoring", project_id: str | None = None) -> tuple[str, list[str]]:
    """
    Returns (brand_context_str, preferred_channels).

    brand_context_str is ready to drop into a system or user prompt.
    preferred_channels is the list stored in brand_profile, or [] if not set.
    """
    from agents.project_context import get_project_id
    limit = _STRATEGY_LIMITS.get(mode, 1_000)
    resolved_project_id = project_id or get_project_id()
    p = _load_profile(resolved_project_id)

    if not p:
        return _FALLBACK_CTX, _FALLBACK_CHANNELS

    parts: list[str] = []

    if p.get("company_name"):
        parts.append(f"Company: {p['company_name']}")
    if p.get("website_url"):
        parts.append(f"Website: {p['website_url']}")
    if p.get("manual_notes"):
        # 600 chars — enough for a real company description
        parts.append(f"Notes: {p['manual_notes'][:600]}")
    if p.get("strategy"):
        parts.append(f"Marketing strategy:\n{p['strategy'][:limit]}")

    # Distilled lessons from the user's own feedback (rejects, edit diffs,
    # silent vetoes...) — maintained by cron_learn.py. Injected for BOTH
    # topic selection and writing: taste applies to both.
    if mode in ("strategy", "generation") and p.get("learned_lessons"):
        parts.append(
            "LEARNED PREFERENCES — distilled from this brand's own past feedback "
            "(rejections, human edits, what never got posted). Follow these unless "
            "they conflict with a hard rule:\n"
            f"{p['learned_lessons'][:1800]}"
        )

    # Real posts pasted by the user — the strongest voice signal we have.
    # Generation mode only (writers); topic-selection doesn't need voice.
    if mode == "generation" and p.get("voice_examples"):
        parts.append(
            "REAL POSTS this brand has actually published — study their voice, "
            "rhythm, length, and level of casualness, and match it EXACTLY. "
            "Imitate the voice, never the content. If these read casual and "
            "understated, do not produce polished marketing structure:\n"
            f"{p['voice_examples'][:1500]}"
        )

    # Competitive insights and self-audit findings are only loaded in
    # strategy / generation modes — too verbose for scoring, would waste tokens.
    if mode in ("strategy", "generation"):
        insights = _load_competitive_insights(max_chars=1_200, project_id=resolved_project_id)
        if insights:
            parts.append(f"Competitive intelligence:\n{insights}")

        audit_insights = _load_audit_insights(resolved_project_id, max_chars=800)
        if audit_insights:
            parts.append(f"Self-audit recommendations (act on these):\n{audit_insights}")

    ctx = "\n".join(parts) if parts else _FALLBACK_CTX
    preferred = p.get("preferred_channels") or []
    return ctx, preferred


def invalidate_cache() -> None:
    """Call this if brand_profile is updated mid-session."""
    _load_profile.cache_clear()
