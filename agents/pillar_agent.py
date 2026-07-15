"""
agents/pillar_agent.py

Narrative briefs and content pillars: a periodic, human-approved monthly
narrative that gives run_strategy() a durable content-pillar signal instead
of picking topics run-to-run with no overarching story.

One pillar can be pillar_type='product' — naming a specific product to
focus content on for the cycle, without re-running full company/website
research or forking a second `projects` row (which would fork real social
channels via linked_project_id, a mechanism meant for genuinely separate
brands, not an internal focus shift).

Mirrors the existing generated_drafts -> published_posts split: a
narrative_briefs row is a proposal event (pending_approval/approved/rejected);
content_pillars rows are the durable active state, approved via Slack the
same way drafts are (agents/slack_agent.py::post_brief_for_approval).

Pillar-share capping (compute_pillar_actuals) is the exact same idea as
agents/strategy_agent.py's linked-project cap (linked_topic_cap_ratio), but
exact rather than fuzzy: pillar_id is set explicitly on generated_drafts /
published_posts when a topic is written, so no name-substring matching is
needed the way it is for a linked project's name.
"""

import os
import json
from datetime import datetime, timezone

from supabase import create_client
from dotenv import load_dotenv

from agents.brand_context import get_brand_context
from agents.project_context import scope, stamp, get_project_id, get_project_name
from agents.llm import chat_json, SMART

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

RECENT_WINDOW = 10  # same window strategy_agent's linked-project cap uses


def get_active_pillars(project_id: str | None = None) -> list[dict]:
    """Currently approved pillars for a project. Fails open to [] if
    content_pillars doesn't exist yet (setup_content_pillars.sql not
    applied) — a missing pillar system must never break topic selection."""
    pid = project_id or get_project_id()
    try:
        q = _supabase.table("content_pillars").select("*").eq("status", "approved")
        if pid:
            q = q.eq("project_id", pid)
        res = q.execute()
        return res.data or []
    except Exception:
        return []


def compute_pillar_actuals(project_id: str | None = None) -> dict:
    """{pillar_id: share} of this project's last RECENT_WINDOW published
    posts tagged with that pillar. Exact tag match, not the fuzzy
    name-substring heuristic strategy_agent uses for a linked project's
    name — pillar_id is set explicitly at write time, so no guessing."""
    pid = project_id or get_project_id()
    pillars = get_active_pillars(pid)
    if not pillars:
        return {}

    try:
        q = _supabase.table("published_posts").select("pillar_id").order("published_at", desc=True).limit(RECENT_WINDOW)
        if pid:
            q = q.eq("project_id", pid)
        recent = (q.execute().data) or []
    except Exception:
        recent = []

    if not recent:
        return {p["id"]: 0.0 for p in pillars}

    total = len(recent)
    return {
        p["id"]: sum(1 for r in recent if r.get("pillar_id") == p["id"]) / total
        for p in pillars
    }


def _latest_row(table: str, project_id: str | None, order_col: str) -> dict | None:
    """Best-effort latest row from a table this feature may not have
    populated yet (or whose migration hasn't landed) — never blocks brief
    generation on a missing/empty table."""
    try:
        q = _supabase.table(table).select("*").order(order_col, desc=True)
        if project_id:
            q = q.eq("project_id", project_id)
        res = q.limit(1).execute()
        return (res.data or [None])[0]
    except Exception:
        return None


def _recent_topics(project_id: str | None, limit: int = 20) -> list[str]:
    try:
        q = _supabase.table("published_posts").select("topic").order("published_at", desc=True).limit(limit)
        if project_id:
            q = q.eq("project_id", project_id)
        return [r["topic"] for r in (q.execute().data or []) if r.get("topic")]
    except Exception:
        return []


def _propose_pillars(brand_context: str, current_pillars: list[dict], audit: dict | None,
                      competitor: dict | None, recent_topics: list[str]) -> dict:
    current_text = "\n".join(
        f"- {p['name']} ({p.get('pillar_type', 'theme')}): {p.get('description', '')}"
        for p in current_pillars
    ) or "None yet — this is the first narrative brief."

    audit_text = "No self-audit run yet."
    if audit and audit.get("findings"):
        recs = audit["findings"].get("recommendations", [])
        if recs:
            audit_text = "Self-audit recommendations:\n" + "\n".join(f"- {r}" for r in recs)

    competitor_text = "No competitor scan run yet."
    if competitor and competitor.get("findings"):
        angles = competitor["findings"].get("whitespace_angles", [])
        if angles:
            competitor_text = "Competitor whitespace angles:\n" + "\n".join(f"- {a}" for a in angles)

    recent_text = "\n".join(f"- {t}" for t in recent_topics[:20]) or "No published posts yet."

    system = (
        "You are a content strategist proposing this cycle's content pillars for a brand — the "
        "durable themes that will bias (not replace) topic selection for the next month. Propose "
        "3-5 pillars. At most ONE may be pillar_type='product' — a specific named product from the "
        "brand context to focus on this cycle (only if the brand context actually names one worth "
        "spotlighting; otherwise use pillar_type='theme' for everything). Keep continuity with pillars "
        "that are still working rather than discarding everything every cycle. Ground pillars in the "
        "audit/competitor findings given, not invented signals.\n\n"
        'Respond ONLY with JSON: {"summary": "2-3 sentences on the story this cycle", "pillars": '
        '[{"name": "...", "description": "...", "pillar_type": "theme|product", "target_ratio": 0.25, '
        '"example_topics": ["...", "..."]}]}'
    )
    user = (
        f"Brand context:\n{brand_context}\n\n"
        f"Current pillars:\n{current_text}\n\n"
        f"{audit_text}\n\n"
        f"{competitor_text}\n\n"
        f"Recently published topics:\n{recent_text}"
    )
    # max_tokens is shared between Claude's internal "thinking" tokens and the
    # visible JSON output (same failure mode as strategy_agent.py::run_strategy) —
    # one retry with more headroom before giving up with a clear error instead
    # of a raw JSONDecodeError traceback.
    raw = chat_json(system, user, model=SMART, max_tokens=2000)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        print("  [pillar] Response was cut off — retrying with more room...")
        raw = chat_json(system, user, model=SMART, max_tokens=3200)
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                "Narrative brief generation failed twice in a row — the response kept getting "
                "cut off before finishing."
            ) from e


def run_narrative_brief(period_label: str | None = None, save_to_db: bool = True) -> dict:
    """Propose this cycle's pillars and post them to Slack for approval.
    Nothing changes about live topic selection until a human approves —
    see approve_narrative_brief()."""
    pid = get_project_id()
    brand_context, _ = get_brand_context(mode="strategy")
    current_pillars = get_active_pillars(pid)
    audit = _latest_row("audit_reports", pid, "created_at")
    competitor = _latest_row("competitor_reports", pid, "generated_at")
    recent_topics = _recent_topics(pid)

    try:
        proposal = _propose_pillars(brand_context, current_pillars, audit, competitor, recent_topics)
    except Exception as e:
        raise RuntimeError(f"Narrative brief generation failed: {e}") from e

    period_label = period_label or datetime.now(timezone.utc).strftime("%Y-%m")
    brief_row = {
        "period_label": period_label,
        "summary": proposal.get("summary", ""),
        "raw_pillars": proposal.get("pillars", []),
        "status": "pending_approval",
    }

    if not save_to_db:
        return brief_row

    res = _supabase.table("narrative_briefs").insert(stamp(brief_row)).execute()
    brief = res.data[0] if res.data else brief_row
    brief_id = brief.get("id")

    if brief_id:
        try:
            from agents.slack_agent import post_brief_for_approval
            ts = post_brief_for_approval(
                brief_id, get_project_name(pid) or "Project",
                brief_row["summary"], brief_row["raw_pillars"],
            )
            _supabase.table("narrative_briefs").update({"slack_ts": ts}).eq("id", brief_id).execute()
            print(f"[pillar] Narrative brief posted to Slack for approval (brief {brief_id})")
        except Exception as e:
            print(f"[pillar] Brief saved but Slack post failed ({e}) — approve it manually in the DB, "
                  f"or wire up a frontend approval action for narrative_briefs.")

    return brief


def approve_narrative_brief(brief_id: str, decided_by: str = "") -> list[dict]:
    """Archive the project's previously-approved pillars and activate the
    brief's proposed pillars in their place."""
    brief_res = _supabase.table("narrative_briefs").select("*").eq("id", brief_id).limit(1).execute()
    if not brief_res.data:
        raise ValueError(f"Narrative brief {brief_id} not found")
    brief = brief_res.data[0]
    pid = brief.get("project_id")

    archive_q = _supabase.table("content_pillars").update({"status": "archived"}).eq("status", "approved")
    if pid:
        archive_q = archive_q.eq("project_id", pid)
    archive_q.execute()

    now = datetime.now(timezone.utc).isoformat()
    new_rows = []
    for p in (brief.get("raw_pillars") or []):
        row = {
            "brief_id": brief_id,
            "name": p.get("name", "Untitled"),
            "description": p.get("description", ""),
            "pillar_type": p.get("pillar_type", "theme"),
            "target_ratio": p.get("target_ratio", 0.25),
            "example_topics": p.get("example_topics", []),
            "status": "approved",
            "approved_at": now,
        }
        if pid:
            row["project_id"] = pid
        res = _supabase.table("content_pillars").insert(row).execute()
        if res.data:
            new_rows.append(res.data[0])

    _supabase.table("narrative_briefs").update({
        "status": "approved", "decided_at": now, "decided_by": decided_by,
    }).eq("id", brief_id).execute()

    print(f"[pillar] Brief {brief_id} approved by {decided_by or 'unknown'} — "
          f"{len(new_rows)} pillar(s) now active")
    return new_rows


def reject_narrative_brief(brief_id: str, decided_by: str = "", feedback: str | None = None) -> None:
    """Mark the brief rejected. No edit-in-place in v1 — pillars are left
    untouched and the next scheduled cycle proposes a fresh brief."""
    _supabase.table("narrative_briefs").update({
        "status": "rejected",
        "decided_at": datetime.now(timezone.utc).isoformat(),
        "decided_by": decided_by,
    }).eq("id", brief_id).execute()
    print(f"[pillar] Brief {brief_id} rejected by {decided_by or 'unknown'}"
          f"{f' — {feedback}' if feedback else ''}")
