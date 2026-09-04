#!/usr/bin/env python3
"""
cron_research.py

Runs Phase 1 only: RSS/Reddit + YouTube/Trends research and saves results
to Supabase so the Research page has fresh data every morning.

Does NOT generate content — that stays a manual step via the Generate page.

Usage (manual test):
  python cron_research.py

Setup as a nightly cron (runs at 07:00 every day):
  crontab -e
  0 7 * * * /Users/aruzhanzhengis/Downloads/marketing-agent/.venv/bin/python \
            /Users/aruzhanzhengis/Downloads/marketing-agent/cron_research.py \
            >> /Users/aruzhanzhengis/Downloads/marketing-agent/logs/cron.log 2>&1
"""

import os
import sys
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

missing = [k for k in ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    print(f"[cron] Missing env vars: {', '.join(missing)}")
    sys.exit(1)

from agents.research_agent import run_research
from agents.trend_agent import run_trend_research
from agents.website_agent import run_website_research
from agents.trendjack_agent import run_trendjack_research
from agents.last30days_agent import run_last30days_research
from agents.project_context import list_projects, set_active_project, has_configured_brand

# Exit codes (issue #10) — cron_wrap.py alerts on non-zero:
#   0 = all attempted phases succeeded (or nothing was due)
#   2 = degraded — some phases failed but not all
#   1 = dead — every attempted phase failed
EXIT_OK, EXIT_FAILED, EXIT_DEGRADED = 0, 1, 2


def main():
    projects = list_projects()
    if not projects:
        failed, attempted = _run_one()   # pre-migration database — run unscoped
        sys.exit(_exit_code(failed, attempted))
    # Cost control: only research for projects whose GENERATION is due today
    # (an hour later, at 8am). Researching daily for an every-3-days cadence
    # burned ~3x the needed API spend — and skipping here is safe because
    # run_auto re-runs research inline anyway if the pool is >24h old, so a
    # manual "Full run" on an off-day still gets fresh data automatically.
    from cron_generate import _due_for_generation
    total_failed = total_attempted = 0
    for p in projects:
        if not has_configured_brand(p["id"]):
            print(f"\n[cron] ══ Project: {p['name']} — skipped (no brand info configured yet) ══")
            continue
        due, reason = _due_for_generation(p["id"])
        if not due:
            print(f"\n[cron] ══ Project: {p['name']} — skipped (generation not due today: {reason}) ══")
            continue
        print(f"\n[cron] ══ Project: {p['name']} ══")
        set_active_project(p["id"])
        failed, attempted = _run_one()
        total_failed += failed
        total_attempted += attempted
    sys.exit(_exit_code(total_failed, total_attempted))


def _exit_code(failed: int, attempted: int) -> int:
    if attempted == 0 or failed == 0:
        return EXIT_OK
    if failed >= attempted:
        return EXIT_FAILED
    return EXIT_DEGRADED


def _run_one() -> tuple[int, int]:
    """Run all research phases. Returns (failed_count, attempted_count) so the
    caller can pick a three-state exit code. Each phase still runs even if an
    earlier one failed, but failures are counted, not swallowed (issue #10)."""
    start = datetime.now()
    print(f"\n{'='*60}")
    print(f"[cron] Research run started at {start.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    failed: list[str] = []

    def phase(name: str, fn):
        print(f"[cron] {name}")
        try:
            result = fn()
            n = len(result) if hasattr(result, "__len__") else 0
            print(f"[cron] ✓ {name}: {n} saved\n")
        except Exception as e:
            failed.append(name)
            print(f"[cron] ✗ {name} FAILED: {e}\n")

    phase("Phase 1a: RSS + Reddit", lambda: run_research(save_to_db=True))
    phase("Phase 1b: YouTube + Google Trends", lambda: run_trend_research(save_to_db=True))
    phase("Phase 1c: Company website", lambda: run_website_research(save_to_db=True))
    phase("Phase 1d: Broad trend hooks (newsjacking)", lambda: run_trendjack_research(save_to_db=True))
    phase("Phase 1e: Social signal (Reddit + HN via last30days)", lambda: run_last30days_research(save_to_db=True))

    attempted = 5
    elapsed = (datetime.now() - start).seconds
    if failed:
        print(f"[cron] Done in {elapsed}s — {len(failed)}/{attempted} phase(s) FAILED: {', '.join(failed)}\n")
    else:
        print(f"[cron] Done in {elapsed}s — all phases OK. Check /research in the dashboard\n")
    return len(failed), attempted

if __name__ == "__main__":
    main()
