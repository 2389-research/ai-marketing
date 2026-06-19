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

missing = [k for k in ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    print(f"[cron] Missing env vars: {', '.join(missing)}")
    sys.exit(1)

from agents.research_agent import run_research
from agents.trend_agent import run_trend_research

def main():
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

    elapsed = (datetime.now() - start).seconds
    print(f"[cron] Done in {elapsed}s — check /research in the dashboard\n")

if __name__ == "__main__":
    main()
