#!/usr/bin/env python3
"""
cost_report.py — print LLM cost/token usage grouped by project and day.

Manual tool, not wired into cron. Run after a generation run (or any time)
to see cost-per-campaign, where a "campaign" is one project's generation
run for a given day:

  python3 cost_report.py [--days 30]

Reads from the llm_usage table (see sql/setup_llm_usage.sql) that
agents/llm.py logs every real Anthropic call into.
"""
import argparse
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv
load_dotenv()

from supabase import create_client
from agents.project_context import get_project_name


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=30, help="How many days back to report (default 30)")
    args = parser.parse_args()

    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    since = (datetime.now(timezone.utc) - timedelta(days=args.days)).isoformat()

    try:
        rows = (supabase.table("llm_usage")
                .select("project_id, model, input_tokens, output_tokens, cost_usd, created_at")
                .gte("created_at", since)
                .execute()).data or []
    except Exception as e:
        print(f"Couldn't read llm_usage — has sql/setup_llm_usage.sql been applied yet? ({e})")
        return

    if not rows:
        print(f"No LLM usage logged in the last {args.days} day(s).")
        return

    # group by (project, day)
    groups: dict[tuple, dict] = defaultdict(lambda: {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "unpriced_calls": 0})
    for r in rows:
        day = (r.get("created_at") or "")[:10]
        key = (r.get("project_id"), day)
        g = groups[key]
        g["calls"] += 1
        g["input_tokens"] += r.get("input_tokens") or 0
        g["output_tokens"] += r.get("output_tokens") or 0
        if r.get("cost_usd") is not None:
            g["cost_usd"] += r["cost_usd"]
        else:
            g["unpriced_calls"] += 1

    project_names = {}
    print(f"\n{'Project':<24} {'Day':<12} {'Calls':>7} {'In tok':>10} {'Out tok':>10} {'Cost ($)':>10}")
    print("-" * 76)
    total_cost = 0.0
    for (project_id, day), g in sorted(groups.items(), key=lambda kv: kv[0][1]):
        if project_id not in project_names:
            project_names[project_id] = get_project_name(project_id) or (project_id or "(unscoped)")
        name = project_names[project_id][:24]
        cost_str = f"{g['cost_usd']:.4f}" + ("*" if g["unpriced_calls"] else "")
        print(f"{name:<24} {day:<12} {g['calls']:>7} {g['input_tokens']:>10} {g['output_tokens']:>10} {cost_str:>10}")
        total_cost += g["cost_usd"]

    print("-" * 76)
    print(f"Total cost across {len(rows)} calls: ${total_cost:.4f}")
    print("(* = includes calls from a model not in agents/llm.py's _PRICING table, undercounted)")


if __name__ == "__main__":
    main()
