#!/usr/bin/env python3
"""
tests/eval_content_agent.py

Content quality evaluation harness — NOT a pytest test. This makes real,
billed Anthropic API calls and has normal run-to-run variance from the
LLM judge, so it isn't wired into `pytest tests/` (which should stay fast
and deterministic). Run it manually whenever you want to sanity-check
generation quality, e.g. after changing a prompt in content_agent.py:

    python3 tests/eval_content_agent.py

For each sample topic in fixtures/sample_strategy_items.json, this:
  1. Calls generate_drafts() for real (save_to_db=False)
  2. Runs the existing objective QA checks (banned phrases, char limits) —
     reused directly from qa_agent.py, not reimplemented
  3. Asks a fresh Claude call to judge the draft 1-10 on grounding (stuck to
     source material, no invented facts/numbers), tone-match, and hook
     quality
  4. Compares against fixed minimum thresholds (a quality floor, not an
     exact-match diff against a prior run — LLM judge scores naturally
     fluctuate a few points call to call, so an exact-match diff would
     produce false "regression" alerts from normal variance)

Exits with a non-zero status if anything falls below threshold, so it can
still be used as a manual gate even though it's not part of the fast suite.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.content_agent import generate_drafts
from agents.qa_agent import _check_banned_phrases, _check_char_limits
from agents.llm import chat_json, FAST

FIXTURES_PATH = Path(__file__).parent / "fixtures" / "sample_strategy_items.json"

# Quality floor — flag anything scoring below these, don't diff against a
# specific prior run (LLM judge variance makes exact-match comparisons noisy)
MIN_GROUNDING = 7
MIN_TONE      = 7
MIN_HOOK      = 6


def judge_draft(draft_text: str, strategy: dict) -> dict:
    """Fresh LLM-judge call — deliberately independent of the system prompt
    used to generate the draft, so it isn't just grading its own homework
    with the same instructions."""
    prompt = f"""You are evaluating a piece of AI-generated marketing content for quality.

Source material the draft should be grounded in:
{strategy.get('source_summary', '(none provided)')}

Key points the draft was supposed to cover:
{chr(10).join('- ' + p for p in strategy.get('key_points', []))}

The draft:
---
{draft_text}
---

Score 1-10 on each:
- grounding: does every factual claim trace back to the source material above, with nothing invented (no made-up numbers, pricing, or claims not in the source)?
- tone: does this read as confident, specific marketing copy (not generic AI filler)?
- hook: is the opening line/sentence genuinely attention-grabbing?

Return ONLY this JSON: {{"grounding": 8, "tone": 7, "hook": 8, "notes": "one short sentence on the weakest aspect, if any"}}"""

    raw = chat_json("You are a precise, skeptical content quality judge.", prompt, model=FAST, max_tokens=300)
    return json.loads(raw)


def eval_one(fixture: dict) -> bool:
    print(f"\n{'='*70}")
    print(f"[{fixture['id']}] {fixture['topic'][:60]}")
    print(f"{'='*70}")

    drafts = generate_drafts(
        topic=fixture["topic"],
        channels=fixture["channels"],
        strategy=fixture,
        save_to_db=False,
    )

    all_ok = True
    for channel, info in drafts.items():
        text = info["draft_text"]
        print(f"\n  [{channel}] ({len(text)} chars)")
        print(f"  {text[:150].replace(chr(10), ' ')}...")

        # Objective checks — reused directly from qa_agent.py
        banned = _check_banned_phrases(text)
        char_issues, char_warnings = _check_char_limits(text, channel)
        if banned:
            print(f"  ✗ Banned phrases: {banned}")
            all_ok = False
        if char_issues:
            print(f"  ✗ Char limit: {char_issues}")
            all_ok = False
        if char_warnings:
            print(f"  ⚠ {char_warnings}")

        # LLM-judge quality scores
        try:
            scores = judge_draft(text, fixture)
        except Exception as e:
            print(f"  ✗ Judge call failed: {e}")
            all_ok = False
            continue

        grounding, tone, hook = scores.get("grounding", 0), scores.get("tone", 0), scores.get("hook", 0)
        print(f"  Scores: grounding={grounding}/10  tone={tone}/10  hook={hook}/10")
        if scores.get("notes"):
            print(f"  Notes: {scores['notes']}")

        if grounding < MIN_GROUNDING:
            print(f"  ✗ Grounding {grounding} below floor {MIN_GROUNDING} — may contain invented claims")
            all_ok = False
        if tone < MIN_TONE:
            print(f"  ✗ Tone {tone} below floor {MIN_TONE}")
            all_ok = False
        if hook < MIN_HOOK:
            print(f"  ✗ Hook {hook} below floor {MIN_HOOK}")
            all_ok = False

    return all_ok


def main():
    fixtures = json.loads(FIXTURES_PATH.read_text())
    results = {f["id"]: eval_one(f) for f in fixtures}

    print(f"\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}")
    for fid, ok in results.items():
        print(f"  {'✓' if ok else '✗'} {fid}")

    passed = sum(results.values())
    print(f"\n{passed}/{len(results)} fixtures passed all thresholds")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
