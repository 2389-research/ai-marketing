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
        cost = round((input_t * price[0] + output_t * price[1]) / 1_000_000, 6) if price else None

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
        pass  # fail open — a logging hiccup (or setup_llm_usage.sql not applied yet) must never block a real LLM call


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
}


def _mock_response(caller: str) -> str:
    if caller not in MOCK_RESPONSES:
        print(f"[MOCK_MODE] no fixture for '{caller}' — add one to MOCK_RESPONSES in agents/llm.py")
        return "[]"
    return MOCK_RESPONSES[caller]


def chat(system: str, user: str, model: str = SMART, max_tokens: int = 2048) -> str:
    """Call Claude, return the text response."""
    caller = _caller_name()
    if mock_mode():
        return _mock_response(caller)
    msg = _client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    _log_usage(model, msg.usage, caller)
    return next(b.text for b in msg.content if getattr(b, "type", "") == "text")


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
