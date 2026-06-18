# agents/event_agent.py
# Generates a multi-phase content timeline for a specific event
# (launch, conference, award, etc.) and posts each piece to Slack for approval.
#
# Timeline:
#   Standard:     Teaser (T-7) → Announcement (T-0) → Recap (T+1)
#   High-priority: + Countdown T-3, T-2, T-1

import os
from datetime import datetime, timedelta
from agents.content_agent import generate_drafts
from agents.qa_agent import run_qa
from dotenv import load_dotenv

load_dotenv()

SLACK_ENABLED = bool(os.getenv("SLACK_BOT_TOKEN") and os.getenv("SLACK_CHANNEL_ID"))
if SLACK_ENABLED:
    from agents.slack_agent import post_draft_for_approval

# Each phase: days_offset from event date, writing instructions for the content agent
STANDARD_PHASES = [
    {
        "key": "teaser",
        "label": "Teaser",
        "days_offset": -7,
        "instructions": (
            "This is a TEASER post — create intrigue without revealing full details. "
            "Hint at something exciting coming without spelling it out. "
            "End with a question or a cliffhanger. Do NOT announce the event explicitly."
        ),
    },
    {
        "key": "announcement",
        "label": "Announcement",
        "days_offset": 0,
        "instructions": (
            "This is the MAIN ANNOUNCEMENT post. Full details, high energy, clear and exciting. "
            "This is the hero post of the entire campaign — make it count. "
            "Include all key information about the event."
        ),
    },
    {
        "key": "recap",
        "label": "Recap",
        "days_offset": 1,
        "instructions": (
            "This is a POST-EVENT RECAP. Reflect on what happened, share key outcomes or highlights. "
            "Conversational and genuine — like telling a colleague what went down. "
            "Thank participants or collaborators if relevant."
        ),
    },
]

COUNTDOWN_PHASES = [
    {
        "key": "countdown_3",
        "label": "Countdown — 3 days",
        "days_offset": -3,
        "instructions": (
            "Countdown post — 3 days to go. Build anticipation. "
            "Share one small behind-the-scenes detail or a teaser stat/quote. Keep it short and punchy."
        ),
    },
    {
        "key": "countdown_2",
        "label": "Countdown — 2 days",
        "days_offset": -2,
        "instructions": (
            "Countdown post — 2 days to go. Keep the energy building. "
            "Share another detail, a sneak peek, or a reason to care."
        ),
    },
    {
        "key": "countdown_1",
        "label": "Countdown — 1 day",
        "days_offset": -1,
        "instructions": (
            "Countdown post — tomorrow is the day. High energy, direct. "
            "Strong CTA — tell people to tune in, attend, or stay tuned."
        ),
    },
]


def generate_event_timeline(
    event_name: str,
    event_date: datetime,
    description: str,
    channels: list[str],
    priority: str = "standard",
) -> list[dict]:
    """
    Generate and QA all timeline posts for an event. Posts each to Slack for approval.

    Args:
        event_name:  Short name, e.g. "AI Lab Open Day"
        event_date:  The date of the event (datetime object)
        description: What the event is about — used as extra context for the content agent
        channels:    Target platforms, e.g. ["linkedin", "instagram"]
        priority:    "standard" (3 posts) or "high" (6 posts with countdown)

    Returns:
        List of phase result dicts with draft info and QA results.
    """
    phases = STANDARD_PHASES.copy()
    if priority == "high":
        phases = COUNTDOWN_PHASES + phases
        # Sort by days_offset so they appear in chronological order
        phases.sort(key=lambda p: p["days_offset"])

    results = []

    for phase in phases:
        scheduled_date = event_date + timedelta(days=phase["days_offset"])
        scheduled_str = scheduled_date.strftime("%b %d")

        # Topic includes phase label and scheduled date so it's clear in Slack + Supabase
        topic = f"[{phase['label']} — {scheduled_str}] {event_name}"

        extra_context = (
            f"Event: {event_name}\n"
            f"Event date: {event_date.strftime('%B %d, %Y')}\n"
            f"Description: {description}\n"
            f"This post is scheduled for: {scheduled_date.strftime('%B %d, %Y')}\n\n"
            f"Phase instructions: {phase['instructions']}"
        )

        print(f"\n  [{phase['label']}] Generating drafts for {scheduled_str}...")

        drafts = generate_drafts(
            topic=topic,
            channels=channels,
            extra_context=extra_context,
            save_to_db=True,
        )

        for channel, info in drafts.items():
            qa = run_qa(
                draft_text=info["draft_text"],
                channel=channel,
                topic=topic,
                draft_id=info["draft_id"],
            )

            if SLACK_ENABLED and info["draft_id"]:
                try:
                    post_draft_for_approval(
                        draft_id=info["draft_id"],
                        topic=topic,
                        channel=channel,
                        draft_text=info["draft_text"],
                        qa_passed=qa.passed,
                        qa_issues=qa.issues or [],
                        qa_warnings=qa.warnings or [],
                    )
                except Exception as e:
                    print(f"    ⚠ Slack post failed for {channel}: {e}")

            results.append({
                "phase": phase["label"],
                "scheduled_date": scheduled_date.strftime("%Y-%m-%d"),
                "channel": channel,
                "draft_id": info["draft_id"],
                "qa_passed": qa.passed,
                "qa_issues": qa.issues,
            })

    return results
