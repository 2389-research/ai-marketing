"""
Shared Anthropic LLM client for all Python agents.

Drop-in replacement for the OpenAI chat.completions pattern:
  - chat(system, user) -> str
  - chat_json(system, user) -> str   (same, with JSON reminder appended)
"""
import json
import os
import re

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

_client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

FAST  = "claude-haiku-4-5-20251001"   # replaces gpt-4o-mini
SMART = "claude-sonnet-5"              # replaces gpt-4o


def chat(system: str, user: str, model: str = SMART, max_tokens: int = 2048) -> str:
    """Call Claude, return the text response."""
    msg = _client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return next(b.text for b in msg.content if getattr(b, "type", "") == "text")


def chat_json(system: str, user: str, model: str = SMART, max_tokens: int = 2048) -> str:
    """Call Claude for a JSON response; strips markdown fences if present."""
    full_system = system.rstrip() + "\n\nReturn ONLY valid JSON — no markdown fences, no explanation."
    raw = chat(full_system, user, model, max_tokens)
    # Strip any accidental ```json ... ``` wrapping
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    raw = re.sub(r"```\s*$", "", raw.strip(), flags=re.MULTILINE)
    return raw.strip()
