# agents/scheduler.py
# Assigns optimal posting times to approved drafts and manages rescheduling.
# Posting windows are based on platform best practices.
# Never double-books the same channel on the same day.

import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# Timezone for scheduling — change to your local timezone
TIMEZONE = ZoneInfo(os.getenv("SCHEDULE_TIMEZONE", "Europe/Amsterdam"))

# Optimal posting windows per channel
# weekdays: 0=Monday ... 6=Sunday, hour is 24h local time
OPTIMAL_SLOTS = {
    "linkedin": [
        {"weekdays": [1, 2, 3], "hour": 9},    # Tue–Thu 9am (best for B2B)
        {"weekdays": [1, 2, 3], "hour": 12},   # Tue–Thu 12pm
        {"weekdays": [0, 4],    "hour": 9},    # Mon, Fri 9am (fallback)
    ],
    "instagram": [
        {"weekdays": [0, 1, 2, 3, 4], "hour": 11},  # Mon–Fri 11am
        {"weekdays": [0, 1, 2, 3, 4], "hour": 19},  # Mon–Fri 7pm
        {"weekdays": [5, 6],          "hour": 10},  # Weekend 10am
    ],
    "email": [
        {"weekdays": [1, 3], "hour": 9},   # Tue, Thu 9am
        {"weekdays": [1, 3], "hour": 14},  # Tue, Thu 2pm
    ],
    "tiktok": [
        {"weekdays": [0, 1, 2, 3, 4], "hour": 19},  # Mon–Fri 7pm
        {"weekdays": [5, 6],          "hour": 10},  # Weekend 10am
    ],
}

MIN_DAYS_AHEAD = 1  # never schedule for today, minimum 1 day out


def _get_booked_dates(channel: str) -> set[str]:
    """Return set of YYYY-MM-DD strings already scheduled for this channel."""
    result = _supabase.table("generated_drafts").select("scheduled_for").eq(
        "channel", channel
    ).not_.is_("scheduled_for", "null").execute()

    booked = set()
    for row in result.data or []:
        sf = row.get("scheduled_for")
        if sf:
            booked.add(sf[:10])  # take YYYY-MM-DD part
    return booked


def assign_schedule(draft_id: str, channel: str) -> datetime:
    """
    Find the next optimal posting slot for a channel and assign it to the draft.
    Returns the scheduled datetime.
    """
    slots = OPTIMAL_SLOTS.get(channel, OPTIMAL_SLOTS["linkedin"])
    booked = _get_booked_dates(channel)
    now = datetime.now(TIMEZONE)
    earliest = now + timedelta(days=MIN_DAYS_AHEAD)

    # Search up to 60 days ahead for a free slot
    for days_ahead in range(1, 61):
        candidate_date = (now + timedelta(days=days_ahead)).date()
        date_str = candidate_date.isoformat()

        if date_str in booked:
            continue

        weekday = candidate_date.weekday()

        for slot in slots:
            if weekday not in slot["weekdays"]:
                continue

            candidate_dt = datetime(
                candidate_date.year,
                candidate_date.month,
                candidate_date.day,
                slot["hour"],
                0,
                0,
                tzinfo=TIMEZONE,
            )

            if candidate_dt <= earliest:
                continue

            # Found a free slot — assign it
            _supabase.table("generated_drafts").update({
                "scheduled_for": candidate_dt.isoformat(),
            }).eq("id", draft_id).execute()

            return candidate_dt

    raise RuntimeError(f"Could not find a free posting slot for {channel} in the next 60 days.")


def reschedule(draft_id: str, new_dt: datetime) -> datetime:
    """Move a post to a specific datetime."""
    if new_dt.tzinfo is None:
        new_dt = new_dt.replace(tzinfo=TIMEZONE)

    _supabase.table("generated_drafts").update({
        "scheduled_for": new_dt.isoformat(),
    }).eq("id", draft_id).execute()

    return new_dt


def postpone(draft_id: str, days: int) -> datetime:
    """Push a post forward by N days, keeping the same time of day."""
    result = _supabase.table("generated_drafts").select(
        "scheduled_for, channel"
    ).eq("id", draft_id).single().execute()

    row = result.data
    if not row or not row.get("scheduled_for"):
        raise ValueError(f"Draft {draft_id} has no scheduled_for date. Approve it first.")

    current_dt = datetime.fromisoformat(row["scheduled_for"])
    new_dt = current_dt + timedelta(days=days)

    _supabase.table("generated_drafts").update({
        "scheduled_for": new_dt.isoformat(),
    }).eq("id", draft_id).execute()

    return new_dt


def get_schedule(days_ahead: int = 14) -> list[dict]:
    """Return all scheduled posts for the next N days, sorted by date."""
    cutoff = (datetime.now(TIMEZONE) + timedelta(days=days_ahead)).isoformat()
    now_iso = datetime.now(TIMEZONE).isoformat()

    result = _supabase.table("generated_drafts").select(
        "id, topic, channel, status, scheduled_for, qa_passed"
    ).not_.is_(
        "scheduled_for", "null"
    ).gte(
        "scheduled_for", now_iso
    ).lte(
        "scheduled_for", cutoff
    ).order("scheduled_for").execute()

    return result.data or []
