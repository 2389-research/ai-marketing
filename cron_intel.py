#!/usr/bin/env python3
"""
cron_intel.py

Runs self-audit, competitor intel, and narrative-brief generation on their
own per-project cadences — one script, not three, since the brief step
reads the other two's latest rows and this fixed order (audit -> competitor
-> brief) guarantees freshness within a single invocation.

Distinct from cron_generate.py's content pipeline: this script only writes
audit_reports / competitor_reports / narrative_briefs and, once a brief is
approved via Slack, content_pillars. It never writes generated_drafts.

──────────────────────────────────────────────────────────────────────
SETUP: add one crontab entry, before the 7am research / 8am generate crons

  0 6 * * * /path/to/.venv/bin/python /path/to/cron_intel.py >> /path/to/logs/cron_intel.log 2>&1

Replace /path/to with this repo's absolute path on your machine.
──────────────────────────────────────────────────────────────────────
"""

import os
import sys
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

missing = [k for k in ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    print(f"[intel-cron] Missing env vars: {', '.join(missing)}")
    sys.exit(1)

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

FREQUENCY_DAYS = {"daily": 1, "every_3_days": 3, "weekly": 7, "monthly": 30}


def _due(project_id: str, freq_col: str, last_col: str, default_freq: str) -> tuple[bool, str]:
    """Fail-open due-date check, same shape as cron_generate.py's
    _due_for_generation: always due if the columns don't exist yet (a
    migration not yet applied must never silently stop this from running)."""
    try:
        row = (_supabase.table("brand_profile")
               .select(f"{freq_col}, {last_col}")
               .eq("project_id", project_id).limit(1).execute()).data
    except Exception:
        return True, ""
    if not row or not row[0].get(last_col):
        return True, ""
    freq = row[0].get(freq_col) or default_freq
    interval = FREQUENCY_DAYS.get(freq, FREQUENCY_DAYS[default_freq])
    last = datetime.fromisoformat(row[0][last_col])
    days_since = (datetime.now(timezone.utc) - last).days
    if days_since >= interval:
        return True, ""
    return False, f"'{freq}' cadence, last ran {days_since}d ago, next eligible in {interval - days_since}d"


def _mark(project_id: str, col: str) -> None:
    try:
        _supabase.table("brand_profile").update(
            {col: datetime.now(timezone.utc).isoformat()}
        ).eq("project_id", project_id).execute()
    except Exception as e:
        print(f"[intel-cron] Could not stamp {col} (has the relevant setup_*.sql been applied?): {e}")


# Exit codes mirror cron_research.py (issue #10): 0 ok, 2 degraded, 1 dead.
_stats = {"failed": 0, "attempted": 0}


def _run_step(project_id: str, label: str, freq_col: str, last_col: str, default_freq: str, fn) -> None:
    due, reason = _due(project_id, freq_col, last_col, default_freq)
    if not due:
        print(f"  [intel-cron] {label} skipped (not due yet: {reason})")
        return
    _stats["attempted"] += 1
    try:
        fn()
        _mark(project_id, last_col)
    except Exception as e:
        _stats["failed"] += 1
        print(f"  [intel-cron] {label} FAILED: {e}")
        import traceback
        traceback.print_exc()


def main():
    from agents.project_context import list_projects, set_active_project, has_configured_brand
    projects = list_projects()
    if not projects:
        print("[intel-cron] No projects table yet — pre-migration database, skipping (intel needs multi-project setup).")
        return

    for p in projects:
        if not has_configured_brand(p["id"]):
            print(f"\n[intel-cron] == Project: {p['name']} — skipped (no brand info configured yet) ==")
            continue

        print(f"\n[intel-cron] == Project: {p['name']} ==")
        set_active_project(p["id"])

        from agents.audit_agent import run_audit
        from agents.competitor_agent import run_competitor_intel
        from agents.pillar_agent import run_narrative_brief

        _run_step(p["id"], "Self-audit", "audit_frequency", "last_audit_at", "weekly",
                   lambda: run_audit(period_days=30, save_to_db=True))
        _run_step(p["id"], "Competitor intel", "competitor_frequency", "last_competitor_at", "weekly",
                   lambda: run_competitor_intel(save_to_db=True))
        _run_step(p["id"], "Narrative brief", "narrative_brief_frequency", "last_brief_generated_at", "monthly",
                   lambda: run_narrative_brief(save_to_db=True))


if __name__ == "__main__":
    main()
    # Three-state exit so cron_wrap.py can alert on silent failures (issue #10).
    f, a = _stats["failed"], _stats["attempted"]
    if a == 0 or f == 0:
        sys.exit(0)
    sys.exit(1 if f >= a else 2)
