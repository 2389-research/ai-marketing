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

def main():
    projects = list_projects()
    if not projects:
        _run_one()   # pre-migration database — run unscoped
        return
    # Cost control: only research for projects whose GENERATION is due today
    # (an hour later, at 8am). Researching daily for an every-3-days cadence
    # burned ~3x the needed API spend — and skipping here is safe because
    # run_auto re-runs research inline anyway if the pool is >24h old, so a
    # manual "Full run" on an off-day still gets fresh data automatically.
    from cron_generate import _due_for_generation
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
        _run_one()


def _run_one():
    start = datetime.now()
    print(f"\n{'='*60}")
    print(f"[cron] Research run started at {start.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    try:
        print("[cron] Phase 1a: RSS + Reddit")
        articles = run_research(save_to_db=True)
        print(f"[cron] ✓ {len(articles)} articles/reddit saved\n")
    except Exception as e:
        print(f"[cron] ✗ Article research failed: {e}\n")

    try:
        print("[cron] Phase 1b: YouTube + Google Trends")
        trends = run_trend_research(save_to_db=True)
        print(f"[cron] ✓ {len(trends)} videos/trends saved\n")
    except Exception as e:
        print(f"[cron] ✗ Trend research failed: {e}\n")

    try:
        print("[cron] Phase 1c: Company website (runs every 3 days)")
        pages = run_website_research(save_to_db=True)
        if pages:
            print(f"[cron] ✓ {len(pages)} company items saved\n")
        else:
            print("[cron] ↷ Skipped (scraped recently or no website set)\n")
    except Exception as e:
        print(f"[cron] ✗ Website scrape failed: {e}\n")

    try:
        print("[cron] Phase 1d: Broad trend hooks (newsjacking)")
        hooks = run_trendjack_research(save_to_db=True)
        print(f"[cron] ✓ {len(hooks)} trend hook(s) saved\n")
    except Exception as e:
        print(f"[cron] ✗ Trend hook research failed: {e}\n")

    try:
        print("[cron] Phase 1e: Social signal (Reddit + HN via last30days)")
        social = run_last30days_research(save_to_db=True)
        print(f"[cron] ✓ {len(social)} social items saved\n")
    except Exception as e:
        print(f"[cron] ✗ Social research failed: {e}\n")

    elapsed = (datetime.now() - start).seconds
    print(f"[cron] Done in {elapsed}s — check /research in the dashboard\n")

if __name__ == "__main__":
    main()
