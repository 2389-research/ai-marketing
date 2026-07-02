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

  # 2. Generate drafts — Monday and Thursday at 8:00am (after research)
  0 8 * * 1,4 /path/to/.venv/bin/python /path/to/cron_generate.py >> /path/to/logs/cron_generate.log 2>&1

Replace /path/to with: /Users/aruzhanzhengis/Downloads/marketing-agent

Adjust NUM_TOPICS below (or set the CRON_TOPICS env var) to control
how many topics are written per run.
──────────────────────────────────────────────────────────────────────
"""

import os
import sys
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

missing = [k for k in ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    print(f"[generate-cron] Missing env vars: {', '.join(missing)}")
    sys.exit(1)

# How many topics to write per run — override with CRON_TOPICS env var
NUM_TOPICS = int(os.getenv("CRON_TOPICS", "5"))


def main():
    from agents.project_context import list_projects, set_active_project
    projects = list_projects()
    if not projects:
        _run_one()   # pre-migration database — run unscoped
        return
    for p in projects:
        print(f"\n[generate-cron] ══ Project: {p['name']} ══")
        set_active_project(p["id"])
        _run_one()


def _run_one():
    start = datetime.now()
    print(f"\n{'='*60}")
    print(f"[generate-cron] Started at {start.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[generate-cron] Will write {NUM_TOPICS} topic(s) from today's research pool")
    print(f"{'='*60}\n")

    try:
        from run import run_auto, DEFAULT_CHANNELS
        from agents.brand_context import get_brand_context

        _, preferred = get_brand_context(mode="strategy")
        channels = preferred if preferred else DEFAULT_CHANNELS

        print(f"[generate-cron] Active channels: {', '.join(channels)}\n")

        run_auto(channels=channels, num_topics=NUM_TOPICS, save_to_db=True)

        elapsed = (datetime.now() - start).seconds
        print(f"\n[generate-cron] Done in {elapsed}s — check the Drafts page to review and approve posts")

    except Exception as e:
        print(f"[generate-cron] ✗ Failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
