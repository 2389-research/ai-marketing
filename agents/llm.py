"""
Shared Anthropic LLM client for all Python agents.

Drop-in replacement for the OpenAI chat.completions pattern:
  - chat(system, user) -> str
  - chat_json(system, user) -> str   (same, with JSON reminder appended)
"""
import inspect
import json
import os
import re

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

_client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

FAST  = "claude-haiku-4-5-20251001"   # replaces gpt-4o-mini
SMART = "claude-sonnet-5"              # replaces gpt-4o

# USD per 1M tokens (input, output) — Anthropic's current list prices,
# checked 2026-07-13. Update here if pricing changes; an unmapped model
# just skips the cost calc (tokens are still logged).
_PRICING = {
    SMART: (3.00, 15.00),
    FAST: (1.00, 5.00),
}

def mock_mode() -> bool:
    return os.environ.get("MOCK_MODE", "").lower() in ("1", "true", "yes")


def _caller_name() -> str:
    """Name of the first stack frame outside this file — i.e. the real
    agent function that called chat()/chat_json()/chat_vision(), even when
    reached through the chat_json() -> chat() wrapper chain."""
    for frame in inspect.stack()[1:]:
        if frame.filename != __file__:
            return frame.function
    return "unknown"


def _log_usage(model: str, usage, caller: str) -> None:
    """Best-effort token/cost logging — never raises, never blocks a real
    response. Skipped entirely in mock mode (nothing real happened)."""
    try:
        from agents.project_context import get_project_id
        from supabase import create_client

        input_t = getattr(usage, "input_tokens", 0) or 0
        output_t = getattr(usage, "output_tokens", 0) or 0
        cache_c = getattr(usage, "cache_creation_input_tokens", 0) or 0
        cache_r = getattr(usage, "cache_read_input_tokens", 0) or 0
        price = _PRICING.get(model)
        # With prompt caching, usage.input_tokens excludes the cached blocks:
        # cache writes bill at 1.25x the input rate, cache reads at 0.1x.
        cost = round(
            (input_t * price[0]
             + cache_c * price[0] * 1.25
             + cache_r * price[0] * 0.10
             + output_t * price[1]) / 1_000_000, 6,
        ) if price else None

        supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
        supabase.table("llm_usage").insert({
            "project_id": get_project_id(),
            "caller": caller,
            "model": model,
            "input_tokens": input_t,
            "output_tokens": output_t,
            "cache_creation_input_tokens": cache_c,
            "cache_read_input_tokens": cache_r,
            "cost_usd": cost,
        }).execute()
    except Exception:
        pass  # fail open — a logging hiccup (or sql/setup_llm_usage.sql not applied yet) must never block a real LLM call


# Small, schema-correct canned responses for MOCK_MODE, keyed by the name
# of the real agent function that calls chat()/chat_json()/chat_vision() —
# derived from the actual shape each caller parses the response into.
MOCK_RESPONSES = {
    "get_research_queries": '{"youtube_queries": ["mock topic"], "trend_keywords": ["mock"], "reddit_subreddits": ["technology"], "news_queries": ["mock news"]}',
    "_derive_topics": '["Mock topic A", "Mock topic B"]',
    "_synthesize_cluster": '{"title": "Mock topic", "summary": "Mock synthesized summary for pipeline testing."}',
    "score_research_items": '[{"index": 1, "brand_relevance": 7, "engagement_potential": 7, "reason": "mock score"}]',
    "score_trend_items": '[{"index": 1, "brand_relevance": 7, "engagement_potential": 7, "reason": "mock score"}]',
    "score_website_items": '[{"index": 1, "communication_priority": 7, "audience_value": 7, "reason": "mock score"}]',
    "_generate_trend_angles": '[{"index": 1, "can_connect": true, "connection_strength": 7, "angle_title": "Mock angle", "angle_summary": "Mock summary", "hook": "Mock hook", "reason": "mock reason"}]',
    "_filter_semantic_duplicates": "[]",
    "run_strategy": '[{"topic": "Mock topic", "channels": ["linkedin"], "source_title": "Mock source", "source_category": "company", "format": "educational", "why_it_fits": "mock reason", "hook": "Mock hook line", "key_points": ["point 1", "point 2", "point 3"]}]',
    "_run_llm_qa": '{"tone_ok": true, "tone_issues": [], "credibility_ok": true, "credibility_flags": [], "clarity_ok": true, "clarity_issues": [], "overall_verdict": "pass", "suggested_edit": null}',
    "run_content": "[MOCK MODE] Sample generated content for pipeline testing — no real API call was made.",
    "_moderate_image": "OK: mock mode — no real vision check performed",
    "_rate_hook_quality": '{"top_pattern": "mock top pattern", "bottom_pattern": "mock bottom pattern", "hypothesis": "This may suggest mock hypothesis."}',
    "_synthesize_recommendations": '{"recommendations": ["Mock recommendation 1", "Mock recommendation 2"]}',
    "_infer_competitors": '{"competitors": ["Mock Competitor A", "Mock Competitor B"]}',
    "_synthesize_competitor_positioning": '{"positioning_summary": "mock positioning", "notable_moves": [], "audience_reaction": "mock reaction", "sources": []}',
    "_synthesize_whitespace": '{"gaps": [], "whitespace_angles": [], "shared_themes": []}',
    "_propose_pillars": '{"summary": "mock narrative summary", "pillars": [{"name": "Mock Pillar", "description": "mock description", "pillar_type": "theme", "target_ratio": 0.25, "example_topics": []}]}',
}


def _mock_response(caller: str) -> str:
    if caller not in MOCK_RESPONSES:
        print(f"[MOCK_MODE] no fixture for '{caller}' — add one to MOCK_RESPONSES in agents/llm.py")
        return "[]"
    return MOCK_RESPONSES[caller]


# Ceiling for automatic budget escalation in chat(). High enough that thinking
# plus any realistic post/JSON output fits; low enough to bound a runaway call.
_MAX_ESCALATED_TOKENS = 16000


def chat(system: str, user: str, model: str = SMART, max_tokens: int = 2048, _retried: bool = False) -> str:
    """Call Claude, return the text response."""
    caller = _caller_name()
    if mock_mode():
        return _mock_response(caller)
    # Prompt caching: the system prompt (brand context + style rules) is
    # identical across every call in a batch run — the writer alone resends it
    # ~8x per batch. cache_control makes the second and later calls within the
    # 5-minute TTL read it at 0.1x the input rate (writes cost 1.25x once).
    # Prompts below the model's minimum cacheable size are simply not cached —
    # no error, so this is safe for every call site.
    msg = _client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user}],
    )
    _log_usage(model, msg.usage, caller)
    text_block = next((b.text for b in msg.content if getattr(b, "type", "") == "text"), None)
    # Sonnet 5 runs adaptive thinking by default when `thinking` isn't set,
    # and thinking tokens share the max_tokens budget. Two ways too small a
    # budget bites: (1) thinking consumes everything → no text block at all;
    # (2) thinking consumes most of it → text is present but cut off
    # mid-output (stop_reason == "max_tokens"), which silently breaks JSON
    # parsing downstream. A single doubling proved not enough (a long prompt
    # can burn >2x the base budget purely on thinking before any text), so
    # escalate 4x per retry until the ceiling instead of giving up after one.
    truncated = getattr(msg, "stop_reason", None) == "max_tokens"
    if (text_block is None or truncated) and max_tokens < _MAX_ESCALATED_TOKENS:
        bumped = min(max_tokens * 4, _MAX_ESCALATED_TOKENS)
        print(f"  [llm] {caller}: budget {max_tokens} exhausted by thinking/output — retrying at {bumped}")
        return chat(system, user, model, bumped, _retried=True)
    if text_block is None:
        raise RuntimeError(f"No text content in Claude response (stop_reason={msg.stop_reason})")
    return text_block


def chat_json(system: str, user: str, model: str = SMART, max_tokens: int = 2048) -> str:
    """Call Claude for a JSON response; strips markdown fences if present."""
    full_system = system.rstrip() + "\n\nReturn ONLY valid JSON — no markdown fences, no explanation."
    raw = chat(full_system, user, model, max_tokens)
    # Strip any accidental ```json ... ``` wrapping
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    raw = re.sub(r"```\s*$", "", raw.strip(), flags=re.MULTILINE)
    return raw.strip()


def chat_vision(system: str, user_text: str, image_bytes: bytes, media_type: str,
                model: str = FAST, max_tokens: int = 200) -> str:
    """Same as chat(), but with an image attached to the user turn."""
    import base64
    caller = _caller_name()
    if mock_mode():
        return _mock_response(caller)
    msg = _client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": [
            {"type": "text", "text": user_text},
            {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                          "data": base64.b64encode(image_bytes).decode()}},
        ]}],
    )
    _log_usage(model, msg.usage, caller)
    return next(b.text for b in msg.content if getattr(b, "type", "") == "text")
