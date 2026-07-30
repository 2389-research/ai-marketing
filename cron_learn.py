"""
Learning distiller — turns raw feedback into a bounded lessons memo.

The learning loop, concretely:
  1. CAPTURE (frontend): rejects w/ reasons, manual edit diffs, final-version
     pastes at posting time, edit-request feedback -> feedback_events rows.
  2. DERIVE (here, live queries, nothing stored): approved-but-never-posted
     drafts (the silent veto), research-candidate rejections, engagement
     extremes among posted drafts.
  3. DISTILL (here, one small LLM call per project): rewrite the brand's
     "learned lessons" memo from current memo + new evidence. Hard bounds:
     max ~15 bullet lines; a lesson needs >=2 supporting events or one strong
     explicit reason; contradicted/stale lessons get dropped.
  4. INJECT (agents/brand_context.py + the Write route): the memo rides into
     every strategy and writing prompt, next to voice examples.

Cost control: skips a project entirely when it has no new events since the
last distillation. The memo's size cap keeps prompt growth flat forever.

Scheduled daily at 05:45 America/Chicago (before intel/research/generate so
fresh lessons shape the same morning's batch). Safe to run manually:
  python cron_learn.py
"""

import os
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

MEMO_CHAR_CAP = 1800          # hard bound on what we store/inject
EVENT_TEXT_CAP = 500          # per-event text truncation fed to the distiller
STALE_APPROVED_DAYS = 7       # approved, unposted for this long = silent veto

DISTILL_SYSTEM = """You maintain the "learned lessons" memo for a brand's AI content pipeline.
The memo is injected into every future content-strategy and writing prompt, so it must be
operational instructions, not commentary.

Rules:
- Max 15 bullet lines total. Terse, imperative ("Cut hashtags on X", not "the user seems to...").
- Only include a lesson supported by at least TWO pieces of evidence, OR one explicit
  user-stated reason. Never generalize from a single ambiguous event.
- Prefix channel-specific lessons with the channel name in brackets, e.g. "[x] ...".
- Keep still-valid lessons from the current memo; DROP any the new evidence contradicts.
- Edit diffs are the strongest signal: infer what the human changed and why (length, tone,
  hashtags, structure, facts) — encode the pattern, not the instance.
- Silent vetoes (approved but never posted) and rejected research topics teach topic/taste
  preferences; engagement extremes teach what lands.
- If evidence is too thin for any new lesson, return the current memo unchanged.

Output ONLY the memo lines (plain bullets, no headers, no preamble)."""


def _fetch_new_events(pid: str, since: str | None) -> list[dict]:
    q = _supabase.table("feedback_events").select("*").eq("project_id", pid).order("created_at")
    if since:
        q = q.gt("created_at", since)
    return q.limit(200).execute().data or []


def _derived_signals(pid: str) -> list[str]:
    """Signals queried live from existing tables — no capture UI needed."""
    lines: list[str] = []
    now = datetime.now(timezone.utc)

    # Silent veto: approved > N days ago, never posted.
    stale_cutoff = (now - timedelta(days=STALE_APPROVED_DAYS)).isoformat()
    stale = _supabase.table("generated_drafts").select("channel, topic, approved_at") \
        .eq("project_id", pid).eq("status", "approved").is_("posted_at", "null") \
        .lt("approved_at", stale_cutoff).limit(20).execute().data or []
    for d in stale:
        lines.append(f"SILENT VETO (approved {d['approved_at'][:10]}, never posted) [{d['channel']}]: {d['topic'][:120]}")

    # Research-pool rejections: topics the user killed before writing.
    rejected = _supabase.table("research_candidates").select("title, source_category") \
        .eq("project_id", pid).eq("status", "rejected").order("created_at", desc=True) \
        .limit(20).execute().data or []
    for r in rejected:
        lines.append(f"RESEARCH REJECTED [{r.get('source_category', '?')}]: {(r.get('title') or '')[:120]}")

    # Engagement extremes among posted content with logged numbers
    # (engagement lives on published_posts, written by mark-posted).
    posted = _supabase.table("published_posts").select("channel, topic, engagement") \
        .eq("project_id", pid).not_.is_("engagement", "null") \
        .limit(100).execute().data or []
    scored = []
    for d in posted:
        e = d.get("engagement") or {}
        total = (e.get("likes") or 0) + 2 * (e.get("comments") or 0)
        scored.append((total, d))
    if len(scored) >= 4:
        scored.sort(key=lambda t: t[0])
        worst, best = scored[0], scored[-1]
        lines.append(f"BEST ENGAGEMENT [{best[1]['channel']}] ({best[0]} pts): {best[1]['topic'][:120]}")
        lines.append(f"WORST ENGAGEMENT [{worst[1]['channel']}] ({worst[0]} pts): {worst[1]['topic'][:120]}")

    return lines


def _format_events(events: list[dict]) -> list[str]:
    lines = []
    for ev in events:
        t = ev["event_type"]
        base = f"{t.upper()} [{ev.get('channel') or '?'}] topic: {(ev.get('topic') or '')[:100]}"
        if ev.get("reason"):
            base += f" | reason: {ev['reason'][:EVENT_TEXT_CAP]}"
        if ev.get("before_text") and ev.get("after_text"):
            base += (f"\n  AI WROTE: {ev['before_text'][:EVENT_TEXT_CAP]}"
                     f"\n  HUMAN CHANGED TO: {ev['after_text'][:EVENT_TEXT_CAP]}")
        lines.append(base)
    return lines


def _distill(pid: str, project_name: str) -> bool:
    row = _supabase.table("brand_profile").select("learned_lessons, learned_lessons_updated_at") \
        .eq("project_id", pid).limit(1).execute().data
    memo = (row[0].get("learned_lessons") if row else None) or "(empty — no lessons yet)"
    since = row[0].get("learned_lessons_updated_at") if row else None

    events = _fetch_new_events(pid, since)
    if not events:
        print(f"  [{project_name}] no new feedback events — skipping (cost control)")
        return False

    evidence = _format_events(events) + _derived_signals(pid)
    user_msg = (
        f"CURRENT MEMO:\n{memo}\n\n"
        f"NEW EVIDENCE ({len(events)} explicit events + derived signals):\n"
        + "\n".join(f"- {l}" for l in evidence)
        + "\n\nRewrite the memo."
    )

    from agents.llm import chat, SMART
    new_memo = chat(DISTILL_SYSTEM, user_msg, model=SMART, max_tokens=2000).strip()[:MEMO_CHAR_CAP]

    _supabase.table("brand_profile").update({
        "learned_lessons": new_memo,
        "learned_lessons_updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("project_id", pid).execute()
    print(f"  [{project_name}] memo updated ({len(new_memo)} chars, {len(events)} new events)")
    return True


def main():
    from agents.project_context import list_projects, set_active_project
    projects = list_projects()
    if not projects:
        print("[learn-cron] no projects — nothing to do")
        return
    print(f"[learn-cron] {datetime.now().strftime('%Y-%m-%d %H:%M')} — distilling lessons")
    for p in projects:
        try:
            set_active_project(p["id"])
            _distill(p["id"], p["name"])
        except Exception as e:
            # Isolation: one project's failure must not block the others.
            print(f"  [{p['name']}] ✗ distillation failed: {e}")


if __name__ == "__main__":
    main()
