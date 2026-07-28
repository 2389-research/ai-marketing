#!/usr/bin/env python3
"""
cron_generate.py

Runs the full content pipeline automatically:
  - Skips research (uses today's pool from cron_research.py)
  - Picks the best topics via strategy agent
  - Writes posts for each topic
  - Saves drafts to Supabase for review on the Drafts page

You never need to touch the Generate button — this runs on a schedule.
The Generate button in the dashboard is for on-demand runs only.

──────────────────────────────────────────────────────────────────────
SETUP: add two crontab entries

  # 1. Research — every day at 7:00am
  0 7 * * * /path/to/.venv/bin/python /path/to/cron_research.py >> /path/to/logs/cron.log 2>&1

  # 2. Generate — runs daily at 8:00am, but each project's own
  #    generation_frequency (Daily / Every 3 days / Weekly, set on the
  #    Brand page) decides whether that day is actually its turn to write.
  0 8 * * * /path/to/.venv/bin/python /path/to/cron_generate.py >> /path/to/logs/cron_generate.log 2>&1

Replace /path/to with: /Users/aruzhanzhengis/Downloads/marketing-agent

How many topics get written per run is a per-project setting (the
"Content generation" section on the Brand page) — CRON_TOPICS / NUM_TOPICS
below is only the fallback default for projects that haven't set one yet,
or for pre-migration databases (sql/setup_topics_per_run.sql not applied).
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
    print(f"[generate-cron] Missing env vars: {', '.join(missing)}")
    sys.exit(1)

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# Fallback topics-per-run for projects without their own setting yet
# (or pre-migration databases) — override with CRON_TOPICS env var
DEFAULT_NUM_TOPICS = int(os.getenv("CRON_TOPICS", "3"))

FREQUENCY_DAYS = {"daily": 1, "every_3_days": 3, "weekly": 7}


def _topics_for_project(project_id: str) -> int:
    """Per-project topics-per-run, from brand_profile.topics_per_run. Falls
    back to DEFAULT_NUM_TOPICS on any error, missing column (migration not
    applied), or null value — a lookup hiccup must never crash generation."""
    try:
        row = (_supabase.table("brand_profile")
               .select("topics_per_run")
               .eq("project_id", project_id).limit(1).execute()).data
    except Exception:
        return DEFAULT_NUM_TOPICS
    if not row or row[0].get("topics_per_run") is None:
        return DEFAULT_NUM_TOPICS
    return int(row[0]["topics_per_run"])


def _due_for_generation(project_id: str) -> tuple[bool, str]:
    """Whether it's this project's turn to generate today, per its own
    generation_frequency. Returns (due, reason) — reason is only used for
    the skip log line when due=False. Fails open (always due) if the
    columns don't exist yet — sql/setup_generation_frequency.sql not applied —
    or on any other lookup error, so a DB hiccup never silently stops
    content generation."""
    try:
        row = (_supabase.table("brand_profile")
               .select("generation_frequency, last_generated_at")
               .eq("project_id", project_id).limit(1).execute()).data
    except Exception:
        return True, ""
    if not row or not row[0].get("last_generated_at"):
        return True, ""
    freq = row[0].get("generation_frequency") or "every_3_days"
    interval = FREQUENCY_DAYS.get(freq, 3)
    last = datetime.fromisoformat(row[0]["last_generated_at"])
    days_since = (datetime.now(timezone.utc) - last).days
    if days_since >= interval:
        return True, ""
    return False, f"'{freq}' cadence, last ran {days_since}d ago, next eligible in {interval - days_since}d"


def _mark_generated(project_id: str) -> None:
    try:
        _supabase.table("brand_profile").update(
            {"last_generated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("project_id", project_id).execute()
    except Exception as e:
        print(f"[generate-cron] Could not stamp last_generated_at (has sql/setup_generation_frequency.sql "
              f"been applied?): {e}")


def main():
    from agents.project_context import list_projects, set_active_project, has_configured_brand
    projects = list_projects()
    if not projects:
        _run_one(DEFAULT_NUM_TOPICS)   # pre-migration database — run unscoped
        return
    for p in projects:
        if not has_configured_brand(p["id"]):
            print(f"\n[generate-cron] ══ Project: {p['name']} — skipped (no brand info configured yet) ══")
            continue
        due, reason = _due_for_generation(p["id"])
        if not due:
            print(f"\n[generate-cron] ══ Project: {p['name']} — skipped (not due yet: {reason}) ══")
            continue
        print(f"\n[generate-cron] ══ Project: {p['name']} ══")
        set_active_project(p["id"])
        # Only consume the cadence on SUCCESS, and never let one project's
        # failure kill the loop — the next project still gets its run.
        if _run_one(_topics_for_project(p["id"])):
            _mark_generated(p["id"])
        else:
            print(f"[generate-cron] ✗ {p['name']} failed — cadence NOT consumed, will retry tomorrow; continuing to next project")


def _run_one(num_topics: int):
    start = datetime.now()
    print(f"\n{'='*60}")
    print(f"[generate-cron] Started at {start.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[generate-cron] Will write {num_topics} topic(s) from today's research pool")
    print(f"{'='*60}\n")

    try:
        from run import run_auto, DEFAULT_CHANNELS
        from agents.brand_context import get_brand_context

        _, preferred = get_brand_context(mode="strategy")
        channels = preferred if preferred else DEFAULT_CHANNELS

        print(f"[generate-cron] Active channels: {', '.join(channels)}\n")

        run_auto(channels=channels, num_topics=num_topics, save_to_db=True)

        elapsed = (datetime.now() - start).seconds
        print(f"\n[generate-cron] Done in {elapsed}s — check the Drafts page to review and approve posts")
        return True

    except Exception as e:
        print(f"[generate-cron] ✗ Failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    main()
