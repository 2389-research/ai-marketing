#!/usr/bin/env python3
"""
post_draft.py — publish a single approved draft immediately by id.

Used by the "Post now" button (frontend spawns this). Prints a JSON result
to stdout; never throws so the UI always gets a structured answer.

Usage:
  python post_draft.py <draft_id>
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv
load_dotenv()


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "error": "draft_id required"}))
        return
    draft_id = sys.argv[1]
    try:
        from agents.auto_poster import post_single_draft
        result = post_single_draft(draft_id)
    except Exception as e:  # noqa: BLE001
        result = {"status": "error", "error": str(e)}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
