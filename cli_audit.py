#!/usr/bin/env python3
"""
cli_audit.py

On-demand self-audit for one project — same entrypoint shape as run.py
(--project-id), spawned by the frontend's "Run audit now" button
(frontend/app/api/performance/run/route.ts) via the SSE-log pattern already
used for frontend/app/api/pipeline/run/route.ts, and reusable from a shell
for manual runs.

  python cli_audit.py --project-id <id>
  python cli_audit.py --project-id <id> --days 14
"""

import argparse
import os
import sys
from dotenv import load_dotenv

load_dotenv()

missing = [k for k in ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    print(f"[audit] Missing environment variables: {', '.join(missing)}")
    sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run a self-audit of the active project's channels")
    parser.add_argument("--project-id", default=None, help="Project to audit (default: oldest project)")
    parser.add_argument("--days", type=int, default=30, help="Lookback window in days (default: 30)")
    args = parser.parse_args()

    if args.project_id:
        os.environ["PROJECT_ID"] = args.project_id

    from agents.audit_agent import run_audit
    run_audit(period_days=args.days, save_to_db=True)
