#!/usr/bin/env python3
"""
cron_engagement.py

Pulls real engagement (likes/comments/views) back from each platform for
posts that were actually published (have a platform_post_id), and stores it
on published_posts.engagement. Not scheduled automatically — add to crontab
when ready, same pattern as cron_post.py:

  # Sync engagement every 6 hours
  0 */6 * * * /path/to/.venv/bin/python /path/to/cron_engagement.py >> /path/to/logs/cron_engagement.log 2>&1

Replace /path/to with: /Users/aruzhanzhengis/Downloads/marketing-agent

Note: as of this writing, no channel has a real posted row with a
platform_post_id yet (X is blocked by its own billing tier; LinkedIn/
Instagram have no credentials configured) — this will report "nothing to
sync" until that changes, which is expected, not a bug.
"""

import os
import sys
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

missing = [k for k in ["SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    print(f"[engagement-cron] Missing env vars: {', '.join(missing)}")
    sys.exit(1)


def main():
    start = datetime.now()
    print(f"\n{'='*60}")
    print(f"[engagement-cron] Started at {start.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    try:
        from agents.auto_poster import run_engagement_sync

        results = run_engagement_sync()

        elapsed = (datetime.now() - start).seconds
        print(
            f"\n[engagement-cron] Checked: {results['checked']}, "
            f"Updated: {results['updated']}, "
            f"Unavailable: {results['unavailable']}"
        )
        print(f"[engagement-cron] Done in {elapsed}s")

    except Exception as e:
        print(f"[engagement-cron] Failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
