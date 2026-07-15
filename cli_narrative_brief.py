#!/usr/bin/env python3
"""
cli_narrative_brief.py

On-demand narrative-brief generation for one project — same entrypoint
shape as run.py (--project-id), spawned by the frontend's "Generate
narrative brief now" button (Brand page) via the SSE-log pattern used for
frontend/app/api/pipeline/run/route.ts. Posts the proposed pillars to Slack
for Approve/Reject — see agents/slack_agent.py::post_brief_for_approval and
slack_app.py's approve_brief/reject_brief handlers.

  python cli_narrative_brief.py --project-id <id>
"""

import argparse
import os
import sys
from dotenv import load_dotenv

load_dotenv()

missing = [k for k in ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    print(f"[pillar] Missing environment variables: {', '.join(missing)}")
    sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a narrative brief for the active project")
    parser.add_argument("--project-id", default=None, help="Project to generate for (default: oldest project)")
    parser.add_argument("--period-label", default=None, help="Override the period label (default: current YYYY-MM)")
    args = parser.parse_args()

    if args.project_id:
        os.environ["PROJECT_ID"] = args.project_id

    from agents.pillar_agent import run_narrative_brief
    brief = run_narrative_brief(period_label=args.period_label, save_to_db=True)
    print(f"[pillar] Brief created ({brief.get('id', 'no id')}) — "
          f"{len(brief.get('raw_pillars', []))} pillar(s) proposed, awaiting Slack approval.")
