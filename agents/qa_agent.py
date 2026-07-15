# agents/qa_agent.py
# Runs three checks on a draft:
#   1. Brand voice check — does it sound like us?
#   2. Brand safety filter — banned phrases, off-tone content
#   3. Fact signal check — flags unverified claims for human review
# Returns a QAResult with pass/fail and specific issues.

import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
from difflib import SequenceMatcher
from supabase import create_client
from dotenv import load_dotenv
from dataclasses import dataclass, field
from config.brand_voice import BRAND_VOICE
from agents.llm import chat_json, SMART

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

from agents.project_context import scope, get_project_id, get_channel_group_ids


@dataclass
class QAResult:
    passed: bool
    issues: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)  # non-blocking, for human awareness
    channel: str = ""
    topic: str = ""
    draft_text: str = ""


def _check_banned_phrases(draft_text: str) -> list[str]:
    """Fast local check for banned phrases — no API call needed."""
    found = []
    lower = draft_text.lower()
    for phrase in BRAND_VOICE["banned_phrases"]:
        if phrase.lower() in lower:
            found.append(f'Contains banned phrase: "{phrase}"')
    return found


_CHAR_LIMITS: dict[str, int] = {
    "linkedin":  3000,
    "instagram": 2200,
    "x":          280,
    "tiktok":    2200,
    # reddit, instagram_stories, youtube_shorts get no entry — no real hard
    # cap exists for them, same precedent as youtube/email having none.
    "pinterest":  500,   # soft platform norm for title + description combined, not a hard block
    "threads":    500,   # Meta's actual per-post limit — a real hard cap
}

def _check_char_limits(draft_text: str, channel: str) -> tuple[list[str], list[str]]:
    """Hard block if over platform limit; warning if above 85%."""
    limit = _CHAR_LIMITS.get(channel)
    if not limit:
        return [], []
    length = len(draft_text)
    if length > limit:
        return [f"Post is {length:,} chars — exceeds {channel} limit of {limit:,}"], []
    if length / limit > 0.85:
        return [], [f"Approaching {channel} limit: {length:,} / {limit:,} chars"]
    return [], []


def similarity_ratio(text_a: str, text_b: str) -> float:
    """Normalised text similarity [0.0 – 1.0]. Exported for tests."""
    return SequenceMatcher(None, text_a.lower().strip(), text_b.lower().strip()).ratio()


def find_similar(draft_text: str, existing_texts: list[str]) -> tuple[list[str], list[str]]:
    """
    Pure similarity check — compare draft against a list of existing post texts.
    Exported so tests can call it without a DB connection.

    Returns (issues, warnings).
    issues   → ≥ 85% match — blocks approval (near-duplicate)
    warnings → 70–84% match — flags for human review
    """
    issues: list[str] = []
    warnings: list[str] = []
    for existing in existing_texts:
        ratio = similarity_ratio(draft_text, existing)
        preview = existing[:60].replace("\n", " ")
        if ratio >= 0.85:
            issues.append(
                f"Near-duplicate of existing post ({int(ratio * 100)}% match): \"{preview}…\""
            )
        elif ratio >= 0.70:
            warnings.append(
                f"Similar to existing post ({int(ratio * 100)}% match): \"{preview}…\""
            )
    return issues, warnings


def _check_similar_posts(draft_text: str, channel: str) -> tuple[list[str], list[str]]:
    """Fetch existing channel posts from Supabase and run find_similar.

    Also checks posts from any project that shares real social channels with
    this one (see get_channel_group_ids) — a near-duplicate on the same real
    feed is still a near-duplicate even if it came from the linked project's
    own generation pipeline."""
    try:
        drafts_res = (
            scope(_supabase.table("generated_drafts")
            .select("draft_text")
            .eq("channel", channel)
            .neq("status", "rejected")
            .not_.is_("draft_text", "null"))
            .execute()
        )
        published_res = (
            scope(_supabase.table("published_posts")
            .select("post_text")
            .eq("channel", channel))
            .execute()
        )
        existing: list[str] = [
            r["draft_text"] for r in (drafts_res.data or []) if r.get("draft_text")
        ] + [
            r["post_text"] for r in (published_res.data or []) if r.get("post_text")
        ]

        own_pid = get_project_id()
        linked_ids = [pid for pid in (get_channel_group_ids(own_pid) if own_pid else []) if pid != own_pid]
        if linked_ids:
            linked_drafts_res = (
                _supabase.table("generated_drafts")
                .select("draft_text")
                .eq("channel", channel)
                .neq("status", "rejected")
                .not_.is_("draft_text", "null")
                .in_("project_id", linked_ids)
                .execute()
            )
            linked_published_res = (
                _supabase.table("published_posts")
                .select("post_text")
                .eq("channel", channel)
                .in_("project_id", linked_ids)
                .execute()
            )
            existing += [
                r["draft_text"] for r in (linked_drafts_res.data or []) if r.get("draft_text")
            ] + [
                r["post_text"] for r in (linked_published_res.data or []) if r.get("post_text")
            ]

        # Remove exact self-match (the draft being QA'd may already be in DB)
        existing = [t for t in existing if t.strip() != draft_text.strip()]
        return find_similar(draft_text, existing)
    except Exception:
        return [], []   # never let a similarity failure block QA


def _run_llm_qa(draft_text: str, channel: str, topic: str) -> dict:
    """
    Ask chatgpt to evaluate the draft on tone, clarity, and fact signals.
    Returns a structured JSON result.
    """
    system_prompt = f"""
You are a QA reviewer for {BRAND_VOICE['lab_name']}, a tech laboratory.
Your job is to evaluate marketing drafts before they go live.

You check for three things:
1. TONE — Does this sound like the lab? Tone descriptors: {', '.join(BRAND_VOICE['tone_descriptors'])}
2. CREDIBILITY — Are there any claims that sound unverifiable or exaggerated?
3. CLARITY — Is anything confusing, vague, or likely to be misread?

Respond ONLY with a valid JSON object. No preamble. No markdown. Example format:
{{
  "tone_ok": true,
  "tone_issues": [],
  "credibility_ok": true,
  "credibility_flags": ["'10x faster' — needs a source or qualifier"],
  "clarity_ok": true,
  "clarity_issues": [],
  "overall_verdict": "pass",
  "suggested_edit": null
}}

overall_verdict must be "pass", "fix", or "reject".
- pass: ready for human approval
- fix: has issues but salvageable with edits (describe in suggested_edit)
- reject: fundamentally off-brand or misleading, regenerate
""".strip()

    user_message = f"""
Channel: {channel.upper()}
Topic: {topic}

Draft:
{draft_text}

Run QA on this draft now.
""".strip()

    raw = chat_json(system_prompt, user_message, model=SMART, max_tokens=1000)
    return json.loads(raw)


def run_qa(
    draft_text: str,
    channel: str,
    topic: str,
    draft_id: str = None,
) -> QAResult:
    """
    Run full QA on a draft.

    Args:
        draft_text: The content to check
        channel: The target platform
        topic: The original topic (used for context)
        draft_id: Supabase row ID to update with QA results (optional)

    Returns:
        QAResult with pass/fail and all issues listed
    """
    issues = []
    warnings = []

    # Check 1: banned phrases (local, fast)
    banned_hits = _check_banned_phrases(draft_text)
    issues.extend(banned_hits)

    # Check 2: character limits (local, fast)
    limit_issues, limit_warnings = _check_char_limits(draft_text, channel)
    issues.extend(limit_issues)
    warnings.extend(limit_warnings)

    # Check 3: near-duplicate detection against existing posts on this channel
    sim_issues, sim_warnings = _check_similar_posts(draft_text, channel)
    issues.extend(sim_issues)
    warnings.extend(sim_warnings)

    # Check 4: LLM QA
    try:
        llm_result = _run_llm_qa(draft_text, channel, topic)

        if not llm_result.get("tone_ok"):
            issues.extend(llm_result.get("tone_issues", []))

        if not llm_result.get("credibility_ok"):
            # Credibility flags are warnings, not hard failures — human decides
            warnings.extend(llm_result.get("credibility_flags", []))

        if not llm_result.get("clarity_ok"):
            issues.extend(llm_result.get("clarity_issues", []))

        verdict = llm_result.get("overall_verdict", "pass")
        if verdict == "reject":
            issues.append("LLM QA verdict: REJECT — regenerate this draft")
        elif verdict == "fix" and llm_result.get("suggested_edit"):
            warnings.append(f"Suggested edit: {llm_result['suggested_edit']}")

    except json.JSONDecodeError as e:
        warnings.append(f"QA LLM returned unparseable response — manual review required. Error: {e}")

    passed = len(issues) == 0

    # Update Supabase if we have a draft_id
    if draft_id:
        all_issues = issues + [f"[WARNING] {w}" for w in warnings]
        _supabase.table("generated_drafts").update({
            "qa_passed": passed,
            "qa_issues": all_issues if all_issues else [],
        }).eq("id", draft_id).execute()

    return QAResult(
        passed=passed,
        issues=issues,
        warnings=warnings,
        channel=channel,
        topic=topic,
        draft_text=draft_text,
    )
