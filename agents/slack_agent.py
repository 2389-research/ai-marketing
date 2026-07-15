# agents/slack_agent.py
# Posts QA'd drafts to Slack for human approval using Block Kit.
# Each message has Approve / Request Edit / Reject buttons.
# The slack_app.py server handles the button interactions.

import os
import json
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from dotenv import load_dotenv

load_dotenv()

_slack = WebClient(token=os.environ["SLACK_BOT_TOKEN"])
SLACK_CHANNEL = os.environ["SLACK_CHANNEL_ID"]

CHANNEL_EMOJI = {
    "linkedin": "💼",
    "instagram": "📸",
    "email": "📧",
    "tiktok": "🎵",
    "youtube": "▶️",
    "x": "✖️",
    "instagram_stories": "🎞️",
    "youtube_shorts": "🔻",
    "pinterest": "📌",
    "reddit": "👽",
    "threads": "🧵",
}


def post_draft_for_approval(
    draft_id: str,
    topic: str,
    channel: str,
    draft_text: str,
    qa_passed: bool,
    qa_issues: list[str] = None,
    qa_warnings: list[str] = None,
) -> str:
    """
    Post a draft to Slack with Approve / Request Edit / Reject buttons.
    Returns the Slack message timestamp (ts).
    """
    emoji = CHANNEL_EMOJI.get(channel, "📝")
    qa_label = "✅ QA Passed" if qa_passed else "⚠️ QA Flagged — review required"

    # Label the message with the project so one Slack channel can serve
    # every client project without ambiguity.
    from agents.project_context import get_project_name
    project_name = get_project_name()
    header = f"{emoji} {project_name} — {channel.upper()}" if project_name \
             else f"{emoji} Approval Request — {channel.upper()}"

    # Slack text blocks cap at 3000 chars
    display_text = draft_text[:2800] + "\n…[truncated]" if len(draft_text) > 2800 else draft_text

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": header,
            },
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Topic:*\n{topic}"},
                {"type": "mrkdwn", "text": f"*QA Status:*\n{qa_label}"},
            ],
        },
        {"type": "divider"},
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Draft:*\n```{display_text}```",
            },
        },
    ]

    if qa_issues:
        issues_text = "\n".join(f"• {i}" for i in qa_issues)
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*QA Issues:*\n{issues_text}"},
        })

    if qa_warnings:
        warnings_text = "\n".join(f"• {w}" for w in qa_warnings)
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Warnings (non-blocking):*\n{warnings_text}"},
        })

    # Embed draft_id in each button value so the interaction handler knows which row to update
    action_value = json.dumps({"draft_id": draft_id})

    blocks += [
        {"type": "divider"},
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "✅ Approve"},
                    "style": "primary",
                    "action_id": "approve_draft",
                    "value": action_value,
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "✏️ Request Edit"},
                    "action_id": "request_edit",
                    "value": action_value,
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "❌ Reject"},
                    "style": "danger",
                    "action_id": "reject_draft",
                    "value": action_value,
                },
            ],
        },
    ]

    response = _slack.chat_postMessage(
        channel=SLACK_CHANNEL,
        blocks=blocks,
        text=f"New draft ready for approval: {channel.upper()} — {topic}",
    )
    return response["ts"]


def post_brief_for_approval(brief_id: str, project_name: str, summary: str, pillars: list[dict]) -> str:
    """
    Post a narrative brief (proposed content pillars for the cycle) to Slack
    with Approve / Reject buttons. Separate action namespace from
    post_draft_for_approval — briefs are infrequent and narrative, drafts are
    frequent and need char-perfect preview, so they don't share a flow.
    Returns the Slack message timestamp (ts).
    """
    header = f"🧭 {project_name} — Narrative Brief" if project_name else "🧭 New Narrative Brief"

    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": header}},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*This cycle's story:*\n{summary}"}},
        {"type": "divider"},
    ]

    for p in pillars:
        type_badge = "🎯 PRODUCT" if p.get("pillar_type") == "product" else "📌 THEME"
        lines = [f"*{p.get('name', 'Untitled')}* — {type_badge}"]
        if p.get("description"):
            lines.append(p["description"])
        if p.get("target_ratio"):
            lines.append(f"_Target share of topics: {p['target_ratio']:.0%}_")
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": "\n".join(lines)}})

    action_value = json.dumps({"brief_id": brief_id})
    blocks += [
        {"type": "divider"},
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "✅ Approve pillars"},
                    "style": "primary",
                    "action_id": "approve_brief",
                    "value": action_value,
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "❌ Reject"},
                    "style": "danger",
                    "action_id": "reject_brief",
                    "value": action_value,
                },
            ],
        },
    ]

    response = _slack.chat_postMessage(
        channel=SLACK_CHANNEL,
        blocks=blocks,
        text=f"New narrative brief ready for approval — {project_name}",
    )
    return response["ts"]
