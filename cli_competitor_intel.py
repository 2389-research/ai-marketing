#!/usr/bin/env python3
"""
cli_competitor_intel.py

On-demand competitor intel scan for one project — same entrypoint shape as
run.py (--project-id), spawned by the frontend's "Run competitor scan now"
button (frontend/app/api/competitors/run/route.ts) via the SSE-log pattern
used for frontend/app/api/pipeline/run/route.ts, and reusable from a shell.

  python cli_competitor_intel.py --project-id <id>
"""

import argparse
import os
import sys
from dotenv import load_dotenv

load_dotenv()

missing = [k for k in ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    print(f"[competitor] Missing environment variables: {', '.join(missing)}")
    sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run a competitor intel scan for the active project")
    parser.add_argument("--project-id", default=None, help="Project to scan for (default: oldest project)")
    args = parser.parse_args()

    if args.project_id:
        os.environ["PROJECT_ID"] = args.project_id

    from agents.competitor_agent import run_competitor_intel
    run_competitor_intel(save_to_db=True)
