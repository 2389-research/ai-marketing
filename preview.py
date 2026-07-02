"""
preview.py
Runs research (if pool is stale) + strategy agent only.
Does NOT write any drafts — just selects topics and outputs the strategy matrix.

The last line of stdout is always:
  STRATEGY_JSON:{...json...}

All other lines are human-readable log output for streaming display.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

from agents.project_context import scope


def _pool_is_fresh() -> bool:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    res = scope(_supabase.table("research_candidates").select("id").gte("created_at", cutoff)).limit(1).execute()
    return bool(res.data)


def _pool_count() -> int:
    res = scope(_supabase.table("research_candidates").select("id", count="exact")).execute()
    return res.count or 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--topics", type=int, default=5)
    parser.add_argument("--project-id", default=None)
    args = parser.parse_args()

    if args.project_id:
        os.environ["PROJECT_ID"] = args.project_id

    # Force line-buffered stdout so the API route gets lines immediately
    sys.stdout.reconfigure(line_buffering=True)

    print(f"[preview] Strategy preview — {args.topics} topic(s)")
    print("[preview] Checking research pool...")

    if _pool_is_fresh():
        count = _pool_count()
        print(f"[preview] Pool is fresh — {count} candidate(s) ready")
    else:
        print("[preview] Pool is stale — running research first...")

        from agents.research_agent import run_research
        from agents.trend_agent import run_trend_research
        from agents.website_agent import run_website_research

        print("[preview] → Fetching articles and Reddit posts...")
        run_research(save_to_db=True)

        print("[preview] → Fetching YouTube videos and Google Trends...")
        run_trend_research(save_to_db=True)

        print("[preview] → Scraping company website...")
        run_website_research(save_to_db=True)

        print(f"[preview] Research complete — {_pool_count()} candidate(s) in pool")

    print(f"[preview] Selecting {args.topics} best topic(s) for your brand...")

    from agents.strategy_agent import run_strategy
    selected = run_strategy(num_topics=args.topics)

    print(f"[preview] Done — {len(selected)} topic(s) selected:")
    for i, item in enumerate(selected, 1):
        channels = ", ".join(item.get("channels") or [])
        topic    = (item.get("topic") or "")[:65]
        print(f"[preview]   {i}. {topic}  →  {channels}")

    # Emit the structured data as a special marker line the API route will parse
    print(f"STRATEGY_JSON:{json.dumps(selected)}")


if __name__ == "__main__":
    main()
