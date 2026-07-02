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

from agents.project_context import scope

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
        {"weekdays": [1, 3], "hour": 9},    # Tue, Thu 9am
        {"weekdays": [1, 3], "hour": 14},   # Tue, Thu 2pm
    ],
    "tiktok": [
        {"weekdays": [0, 2, 4],    "hour": 19},  # Mon/Wed/Fri 7pm
        {"weekdays": [1, 3],       "hour": 12},  # Tue/Thu noon
        {"weekdays": [5, 6],       "hour": 10},  # Weekend 10am
        {"weekdays": [5, 6],       "hour": 15},  # Weekend 3pm
    ],
    "youtube": [
        {"weekdays": [4, 5], "hour": 15},   # Fri–Sat 3pm (YouTube peaks on weekends)
        {"weekdays": [6, 0], "hour": 12},   # Sun–Mon 12pm
        {"weekdays": [1, 2], "hour": 16},   # Tue–Wed 4pm (fallback)
    ],
    "x": [
        {"weekdays": [0, 1, 2, 3, 4], "hour": 9},   # Mon–Fri 9am
        {"weekdays": [0, 1, 2, 3, 4], "hour": 13},  # Mon–Fri 1pm
        {"weekdays": [0, 1, 2, 3, 4], "hour": 18},  # Mon–Fri 6pm
    ],
}

MIN_DAYS_AHEAD = 1  # never schedule for today, minimum 1 day out


def _get_posting_cadence() -> dict:
    """Fetch per-channel posting frequency (posts/week) from brand_profile."""
    try:
        result = scope(_supabase.table("brand_profile").select("posting_cadence")).limit(1).execute()
        if result.data:
            return result.data[0].get("posting_cadence") or {}
    except Exception:
        pass
    return {}


def _cadence_to_min_days(posts_per_week) -> int:
    """Convert posts-per-week into minimum days between posts for a channel."""
    if not posts_per_week or posts_per_week <= 0:
        return 2  # default: at least every other day
    return max(1, int(7 / posts_per_week))


def _gap_ok(candidate_date, booked_date_strs: set, min_days: int) -> bool:
    """True if candidate_date is at least min_days away from every already-booked date."""
    for d_str in booked_date_strs:
        try:
            d = datetime.strptime(d_str, "%Y-%m-%d").date()
            if abs((candidate_date - d).days) < min_days:
                return False
        except ValueError:
            continue
    return True


def _get_booked_slots(channel: str) -> tuple[set[str], set[str]]:
    """
    Return (booked_dates, booked_datetimes) for non-rejected future posts on this channel.
    - booked_dates: set of YYYY-MM-DD — prevents two posts on the same day for slow channels
    - booked_datetimes: set of YYYY-MM-DDTHH — prevents two posts at the same hour
    """
    now_iso = datetime.now(TIMEZONE).isoformat()
    result = scope(_supabase.table("generated_drafts").select("scheduled_for")).eq(
        "channel", channel
    ).not_.is_(
        "scheduled_for", "null"
    ).neq(
        "status", "rejected"
    ).gte(
        "scheduled_for", now_iso
    ).execute()

    booked_dates: set[str]     = set()
    booked_datetimes: set[str] = set()
    for row in result.data or []:
        sf = row.get("scheduled_for")
        if sf:
            booked_dates.add(sf[:10])       # YYYY-MM-DD
            booked_datetimes.add(sf[:13])   # YYYY-MM-DDTHH
    return booked_dates, booked_datetimes


def assign_schedule(draft_id: str, channel: str) -> datetime:
    """
    Find the next optimal posting slot for a channel and assign it to the draft.
    Checks both date-level and hour-level conflicts to prevent double-booking,
    including a post-write re-check to handle simultaneous approvals.
    Returns the scheduled datetime.
    """
    slots    = OPTIMAL_SLOTS.get(channel, OPTIMAL_SLOTS["linkedin"])
    cadence  = _get_posting_cadence()
    min_days = _cadence_to_min_days(cadence.get(channel, 0))
    booked_dates, booked_datetimes = _get_booked_slots(channel)
    now = datetime.now(TIMEZONE)
    earliest = now + timedelta(days=MIN_DAYS_AHEAD)

    # Search up to 90 days ahead for a free slot
    for days_ahead in range(1, 91):
        candidate_date = (now + timedelta(days=days_ahead)).date()
        weekday  = candidate_date.weekday()

        for slot in slots:
            if weekday not in slot["weekdays"]:
                continue

            candidate_dt = datetime(
                candidate_date.year,
                candidate_date.month,
                candidate_date.day,
                slot["hour"], 0, 0,
                tzinfo=TIMEZONE,
            )

            if candidate_dt <= earliest:
                continue

            hour_key = candidate_dt.strftime("%Y-%m-%dT%H")
            if hour_key in booked_datetimes:
                continue  # exact hour already taken (race condition guard)

            if not _gap_ok(candidate_date, booked_dates, min_days):
                continue  # too close to another post for this channel

            # Write the slot
            _supabase.table("generated_drafts").update({
                "scheduled_for": candidate_dt.isoformat(),
            }).eq("id", draft_id).execute()

            # Post-write conflict check: re-fetch to see if we now have a collision
            check = _supabase.table("generated_drafts").select("id").eq(
                "channel", channel
            ).gte(
                "scheduled_for", candidate_dt.isoformat()
            ).lte(
                "scheduled_for", candidate_dt.isoformat()
            ).neq(
                "status", "rejected"
            ).execute()

            if len(check.data or []) > 1:
                # Another post landed on the same slot simultaneously.
                # Re-read the full booked state from DB to avoid picking the same slot again.
                booked_dates, booked_datetimes = _get_booked_slots(channel)
                continue

            return candidate_dt

    raise RuntimeError(f"Could not find a free posting slot for {channel} in the next 90 days (cadence: {cadence.get(channel, 'default')} posts/week, min gap: {min_days} days).")


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

    result = scope(_supabase.table("generated_drafts").select(
        "id, topic, channel, status, scheduled_for, qa_passed"
    )).not_.is_(
        "scheduled_for", "null"
    ).gte(
        "scheduled_for", now_iso
    ).lte(
        "scheduled_for", cutoff
    ).order("scheduled_for").execute()

    return result.data or []
