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

# Cache the raw DB row for the session so every agent doesn't hit Supabase separately.
@lru_cache(maxsize=1)
def _load_profile() -> dict:
    try:
        res = _supabase.table("brand_profile").select(
            "company_name, website_url, manual_notes, strategy, preferred_channels"
        ).limit(1).execute()
        if res.data:
            return res.data[0]
    except Exception:
        pass
    return {}


def get_brand_context(mode: str = "scoring") -> tuple[str, list[str]]:
    """
    Returns (brand_context_str, preferred_channels).

    brand_context_str is ready to drop into a system or user prompt.
    preferred_channels is the list stored in brand_profile, or [] if not set.
    """
    limit = _STRATEGY_LIMITS.get(mode, 1_000)
    p = _load_profile()

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

    ctx = "\n".join(parts) if parts else _FALLBACK_CTX
    preferred = p.get("preferred_channels") or []
    return ctx, preferred


def invalidate_cache() -> None:
    """Call this if brand_profile is updated mid-session."""
    _load_profile.cache_clear()
