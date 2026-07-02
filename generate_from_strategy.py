"""
generate_from_strategy.py
Reads a strategy JSON array from stdin and runs content generation + QA
for each item. Does NOT re-run research or strategy.

Usage:
  echo '[{...}]' | python generate_from_strategy.py [--project-id UUID]
  cat strategy.json | python generate_from_strategy.py
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-id", default=None)
    args = parser.parse_args()
    if args.project_id:
        os.environ["PROJECT_ID"] = args.project_id

    sys.stdout.reconfigure(line_buffering=True)

    raw = sys.stdin.read().strip()
    if not raw:
        print("[generate] Error: no strategy JSON received on stdin", file=sys.stderr)
        sys.exit(1)

    try:
        items = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[generate] Error: invalid JSON — {e}", file=sys.stderr)
        sys.exit(1)

    if not items:
        print("[generate] No topics to generate — exiting")
        sys.exit(0)

    print(f"[generate] Writing content for {len(items)} topic(s)...")

    from agents.content_agent import generate_drafts
    from agents.qa_agent import run_qa

    total_saved = 0
    total_passed = 0

    for i, item in enumerate(items, 1):
        topic    = item.get("topic") or ""
        channels = item.get("channels") or []

        print(f"\n[generate] {i}/{len(items)}: {topic[:60]}")
        print(f"  Channels: {', '.join(channels)}")

        phase = item.get("content_phase", "")
        if phase:
            print(f"  Phase: {phase}")

        try:
            drafts = generate_drafts(
                topic,
                channels,
                strategy=item,
                extra_context=item.get("content_phase_context", ""),
                save_to_db=True,
            )
        except Exception as e:
            print(f"  Error generating drafts: {e}")
            continue

        for channel, draft in drafts.items():
            draft_id   = draft.get("draft_id")
            draft_text = draft.get("draft_text", "")

            if not draft_id:
                print(f"  [{channel}] draft not saved")
                continue

            try:
                result = run_qa(draft_text, channel, topic, draft_id)
                mark   = "✓" if result.passed else "⚠"
                if result.issues:
                    print(f"  [{channel}] QA {mark}  issues: {', '.join(result.issues[:2])}")
                else:
                    print(f"  [{channel}] QA {mark}")
                total_saved += 1
                if result.passed:
                    total_passed += 1
            except Exception as e:
                print(f"  [{channel}] QA error: {e}")
                total_saved += 1

    print(f"\n[generate] Complete — {total_saved} draft(s) saved, {total_passed} passed QA")
    print("[generate] Go to /drafts to review and approve them")


if __name__ == "__main__":
    main()
