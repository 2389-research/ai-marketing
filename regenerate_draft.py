# regenerate_draft.py
# Reads a draft from Supabase by ID, optionally takes new feedback,
# calls content_agent to rewrite the post, and updates the draft in place.
# Status resets to "pending" so the user can review and approve/reject.
#
# Usage (JSON on stdin):
#   echo '{"draft_id": "uuid", "feedback": "make it shorter"}' | python regenerate_draft.py

import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client
from agents.content_agent import generate_drafts
from agents.brand_context import invalidate_cache

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def main():
    payload = json.load(sys.stdin)
    draft_id = payload.get("draft_id", "").strip()
    override_feedback = (payload.get("feedback") or "").strip()

    if not draft_id:
        print("[regenerate] Error: draft_id is required", file=sys.stderr)
        sys.exit(1)

    # Fetch the draft
    res = _supabase.table("generated_drafts").select("*").eq("id", draft_id).limit(1).execute()
    if not res.data:
        print(f"[regenerate] Draft {draft_id} not found", file=sys.stderr)
        sys.exit(1)

    draft = res.data[0]
    topic      = draft["topic"]
    channel    = draft["channel"]
    source_url = (draft.get("source_url") or "").strip()

    # Resolve feedback: use override if provided, else fall back to stored notes
    stored_notes = (draft.get("notes") or "").replace("Edit requested via dashboard: ", "").strip()
    feedback = override_feedback or stored_notes

    # If new feedback came in, persist it to notes before rewriting
    if override_feedback:
        _supabase.table("generated_drafts").update({
            "notes":  f"Edit requested via dashboard: {override_feedback}",
            "status": "needs_edit",
        }).eq("id", draft_id).execute()

    print(f"[regenerate] Topic:    {topic[:70]}")
    print(f"[regenerate] Channel:  {channel}")
    if feedback:
        print(f"[regenerate] Feedback: {feedback[:120]}")

    # Reconstruct source context from research_candidates (if URL is still in the pool)
    strategy: dict = {}
    if source_url:
        cand_res = _supabase.table("research_candidates").select("summary,source_url").eq("source_url", source_url).limit(1).execute()
        if cand_res.data:
            c = cand_res.data[0]
            strategy = {
                "source_summary": c.get("summary") or "",
                "source_url":     source_url,
            }

    feedback_block = ""
    if feedback:
        feedback_block = (
            "REVISION NOTES — the reviewer asked for these specific changes. "
            "Apply ALL of them in your rewrite:\n" + feedback
        )

    invalidate_cache()  # ensure brand_context is fresh
    drafts = generate_drafts(
        topic=topic,
        channels=[channel],
        extra_context=feedback_block,
        save_to_db=False,
        strategy=strategy or None,
    )

    new_text = drafts[channel]["draft_text"]

    _supabase.table("generated_drafts").update({
        "draft_text": new_text,
        "status":     "pending",
        "qa_passed":  None,
        "qa_issues":  None,
    }).eq("id", draft_id).execute()

    print("[regenerate] Done — draft rewritten and reset to pending")


if __name__ == "__main__":
    main()
