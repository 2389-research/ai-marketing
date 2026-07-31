"""
Run the FULL QA suite (agents/qa_agent.run_qa) on specific drafts by id.

Spawned detached by /api/drafts/compose so Write-page drafts get the exact
same QA as pipeline drafts — custom per-channel rules, LLM tone/credibility/
clarity checks, char limits, near-duplicate detection — not just the
deterministic slop lint the route stamps synchronously. run_qa() writes
qa_passed/qa_issues back to the row itself.

Usage: python qa_draft.py <draft_id> [<draft_id> ...]
"""

import os
import sys

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def main(ids: list[str]) -> int:
    from agents.project_context import set_active_project
    from agents.qa_agent import run_qa

    failed = 0
    for draft_id in ids:
        try:
            row = _supabase.table("generated_drafts").select(
                "id, topic, draft_text, channel, project_id"
            ).eq("id", draft_id).single().execute().data
            if not row:
                print(f"[qa-draft] {draft_id}: not found")
                failed += 1
                continue
            if row.get("project_id"):
                set_active_project(row["project_id"])
            result = run_qa(row["draft_text"], row["channel"], row["topic"], draft_id=draft_id)
            print(f"[qa-draft] {draft_id} [{row['channel']}]: "
                  f"{'PASS' if result.passed else 'FAIL'} "
                  f"({len(result.issues)} issues, {len(result.warnings)} warnings)")
        except Exception as e:
            print(f"[qa-draft] {draft_id}: ✗ {e}")
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: qa_draft.py <draft_id> [...]", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1:]))
