#!/usr/bin/env python3
"""
cron_post.py

Automatically publishes approved drafts whose scheduled_for time has passed.
Run this on a frequent schedule (every 15-30 minutes) via cron.

SETUP: add to crontab
  # Post approved drafts every 30 minutes
  */30 * * * * /path/to/.venv/bin/python /path/to/cron_post.py >> /path/to/logs/cron_post.log 2>&1

Replace /path/to with: /Users/aruzhanzhengis/Downloads/marketing-agent

Required env vars (add to .env):
  LINKEDIN_ACCESS_TOKEN=...    # your LinkedIn OAuth2 access token
  LINKEDIN_PERSON_URN=...      # urn:li:person:YOUR_ID
  X_API_KEY=...                # X/Twitter API key
  X_API_SECRET=...             # X/Twitter API secret
  X_ACCESS_TOKEN=...           # X/Twitter access token
  X_ACCESS_TOKEN_SECRET=...    # X/Twitter access token secret
"""

import os
import sys
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

missing = [k for k in ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    print(f"[post-cron] Missing env vars: {', '.join(missing)}")
    sys.exit(1)


def main():
    start = datetime.now()
    print(f"\n{'='*60}")
    print(f"[post-cron] Started at {start.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[post-cron] Checking for approved drafts due for publishing...")
    print(f"{'='*60}\n")

    try:
        from agents.auto_poster import run_auto_poster

        results = run_auto_poster()

        elapsed = (datetime.now() - start).seconds
        print(
            f"\n[post-cron] Posted: {results['posted']}, "
            f"Skipped: {results['skipped']}, "
            f"Blocked (QA-failed): {results.get('blocked', 0)}, "
            f"Failed: {results['failed']}"
        )
        print(f"[post-cron] Done in {elapsed}s")

    except Exception as e:
        print(f"[post-cron] Failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
