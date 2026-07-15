#!/usr/bin/env python3
# slack_app.py
# Slack Bolt app (Socket Mode) that handles approval button clicks.
# Run this as a background server alongside your main pipeline:
#
#   python slack_app.py
#
# It listens for Approve / Reject / Request Edit interactions and updates Supabase.

import os
import json
from datetime import datetime, timezone
from dotenv import load_dotenv
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler
from supabase import create_client
from agents.scheduler import assign_schedule

load_dotenv()

missing = [k for k in ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    print(f"Missing environment variables: {', '.join(missing)}")
    print("Add them to your .env file and restart.")
    raise SystemExit(1)

app = App(token=os.environ["SLACK_BOT_TOKEN"])
_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def _parse_value(raw: str) -> str:
    """Extract draft_id from button value (stored as JSON)."""
    try:
        return json.loads(raw)["draft_id"]
    except (json.JSONDecodeError, KeyError):
        return raw  # fallback: value is the raw draft_id string


def _parse_brief_value(raw: str) -> str:
    try:
        return json.loads(raw)["brief_id"]
    except (json.JSONDecodeError, KeyError):
        return raw


def _replace_buttons(client, body, status_line: str):
    """Remove the action buttons from the original message and append a status line."""
    channel_id = body["channel"]["id"]
    message_ts = body["message"]["ts"]
    original_blocks = body["message"].get("blocks", [])

    new_blocks = [b for b in original_blocks if b.get("type") != "actions"]
    new_blocks.append({
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": status_line}],
    })

    client.chat_update(
        channel=channel_id,
        ts=message_ts,
        blocks=new_blocks,
        text=status_line,
    )


@app.action("approve_draft")
def handle_approve(ack, body, client):
    ack()
    draft_id = _parse_value(body["actions"][0]["value"])
    user = body["user"]["name"]

    # Fetch channel so we can assign the right posting slot
    row = _supabase.table("generated_drafts").select("channel, project_id").eq("id", draft_id).single().execute()
    channel = row.data.get("channel", "linkedin") if row.data else "linkedin"

    # This process is long-lived and serves every project — point the project
    # context at the draft's own project so assign_schedule reads the right
    # posting cadence (handlers run sequentially in Socket Mode).
    if row.data and row.data.get("project_id"):
        os.environ["PROJECT_ID"] = row.data["project_id"]

    _supabase.table("generated_drafts").update({
        "status": "approved",
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "notes": f"Approved by {user} via Slack",
    }).eq("id", draft_id).execute()

    # Auto-assign optimal posting time
    try:
        scheduled_dt = assign_schedule(draft_id, channel)
        schedule_line = f"📅 Scheduled for *{scheduled_dt.strftime('%a %b %d at %H:%M')}*"
    except Exception as e:
        schedule_line = f"⚠️ Could not auto-schedule: {e}"

    _replace_buttons(client, body, f"✅ *Approved* by @{user}\n{schedule_line}")
    print(f"[approve] draft {draft_id} approved by {user} — {schedule_line}")


@app.action("reject_draft")
def handle_reject(ack, body, client):
    ack()
    draft_id = _parse_value(body["actions"][0]["value"])
    user = body["user"]["name"]

    _supabase.table("generated_drafts").update({
        "status": "rejected",
        "notes": f"Rejected by {user} via Slack",
    }).eq("id", draft_id).execute()

    _replace_buttons(client, body, f"❌ *Rejected* by @{user}")
    print(f"[reject] draft {draft_id} rejected by {user}")


@app.action("request_edit")
def handle_request_edit(ack, body, client):
    ack()
    raw_value = body["actions"][0]["value"]
    draft_id = _parse_value(raw_value)

    # Store draft_id + original message context in modal metadata so we can update it on submit
    metadata = json.dumps({
        "draft_id": draft_id,
        "channel_id": body["channel"]["id"],
        "message_ts": body["message"]["ts"],
    })

    client.views_open(
        trigger_id=body["trigger_id"],
        view={
            "type": "modal",
            "callback_id": "edit_feedback_modal",
            "private_metadata": metadata,
            "title": {"type": "plain_text", "text": "Request Edit"},
            "submit": {"type": "plain_text", "text": "Submit"},
            "close": {"type": "plain_text", "text": "Cancel"},
            "blocks": [
                {
                    "type": "input",
                    "block_id": "feedback_block",
                    "label": {"type": "plain_text", "text": "What needs to change?"},
                    "element": {
                        "type": "plain_text_input",
                        "action_id": "feedback_input",
                        "multiline": True,
                        "placeholder": {
                            "type": "plain_text",
                            "text": "e.g. Shorten the first paragraph, make the tone more casual...",
                        },
                    },
                }
            ],
        },
    )


@app.view("edit_feedback_modal")
def handle_edit_modal(ack, body, client):
    ack()
    meta = json.loads(body["view"]["private_metadata"])
    draft_id = meta["draft_id"]
    channel_id = meta["channel_id"]
    message_ts = meta["message_ts"]
    user = body["user"]["name"]
    feedback = body["view"]["state"]["values"]["feedback_block"]["feedback_input"]["value"]

    _supabase.table("generated_drafts").update({
        "status": "needs_edit",
        "notes": f"Edit requested by {user}: {feedback}",
    }).eq("id", draft_id).execute()

    # Update the original message to remove buttons and show edit-requested status
    original_blocks = body.get("message", {}).get("blocks", [])
    new_blocks = [b for b in original_blocks if b.get("type") != "actions"]
    new_blocks.append({
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": f"✏️ *Edit requested* by @{user}: _{feedback}_"}],
    })

    try:
        client.chat_update(
            channel=channel_id,
            ts=message_ts,
            blocks=new_blocks,
            text=f"Edit requested by {user}",
        )
    except Exception:
        # Fallback: post a reply if we can't update the original
        client.chat_postMessage(
            channel=channel_id,
            thread_ts=message_ts,
            text=f"✏️ Edit requested by @{user} for draft `{draft_id[:8]}…`:\n_{feedback}_",
        )

    print(f"[edit] draft {draft_id} needs edit — {user}: {feedback}")


@app.action("approve_brief")
def handle_approve_brief(ack, body, client):
    ack()
    brief_id = _parse_brief_value(body["actions"][0]["value"])
    user = body["user"]["name"]

    row = _supabase.table("narrative_briefs").select("project_id").eq("id", brief_id).single().execute()
    if row.data and row.data.get("project_id"):
        os.environ["PROJECT_ID"] = row.data["project_id"]

    from agents.pillar_agent import approve_narrative_brief
    try:
        pillars = approve_narrative_brief(brief_id, decided_by=user)
        names = ", ".join(p["name"] for p in pillars) or "none"
        status_line = f"✅ *Pillars approved* by @{user}\nActive pillars: {names}"
    except Exception as e:
        status_line = f"⚠️ Approval failed: {e}"

    _replace_buttons(client, body, status_line)
    print(f"[approve_brief] brief {brief_id} approved by {user}")


@app.action("reject_brief")
def handle_reject_brief(ack, body, client):
    ack()
    brief_id = _parse_brief_value(body["actions"][0]["value"])
    user = body["user"]["name"]

    row = _supabase.table("narrative_briefs").select("project_id").eq("id", brief_id).single().execute()
    if row.data and row.data.get("project_id"):
        os.environ["PROJECT_ID"] = row.data["project_id"]

    from agents.pillar_agent import reject_narrative_brief
    reject_narrative_brief(brief_id, decided_by=user)

    _replace_buttons(client, body, f"❌ *Rejected* by @{user} — a fresh brief will be proposed next cycle")
    print(f"[reject_brief] brief {brief_id} rejected by {user}")


if __name__ == "__main__":
    print("⚡ Slack approval app is running (Socket Mode)...")
    print("Waiting for Approve / Reject / Request Edit interactions in Slack.")
    SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"]).start()
