#!/usr/bin/env python3
# content_calendar.py
# View and manage the content schedule.
#
# Usage:
#   python content_calendar.py               — show next 14 days
#   python content_calendar.py --days 30     — show next 30 days
#   python content_calendar.py --reschedule <draft_id> --to "2026-07-10 09:00"
#   python content_calendar.py --postpone <draft_id> --days 3

import argparse
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table
from rich.text import Text
from rich import box

load_dotenv()

console = Console()

missing = [k for k in ["SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    console.print(f"[bold red]Missing env vars:[/] {', '.join(missing)}")
    sys.exit(1)

from agents.scheduler import get_schedule, reschedule, postpone

TIMEZONE = ZoneInfo(os.getenv("SCHEDULE_TIMEZONE", "Europe/Amsterdam"))

CHANNEL_COLOR = {
    "linkedin":  "blue",
    "instagram": "magenta",
    "email":     "yellow",
    "tiktok":    "cyan",
}

STATUS_LABEL = {
    "approved":   "[green]approved[/]",
    "pending":    "[yellow]pending[/]",
    "rejected":   "[red]rejected[/]",
    "needs_edit": "[orange3]needs edit[/]",
}


def show_calendar(days: int = 14):
    posts = get_schedule(days_ahead=days)

    console.print()
    console.rule(f"[bold blue]Content Calendar — Next {days} Days[/]")

    if not posts:
        console.print("\n[dim]No scheduled posts found. Approve some drafts first.[/]\n")
        return

    table = Table(box=box.ROUNDED, show_header=True, header_style="bold", expand=True)
    table.add_column("Scheduled", style="dim", width=18)
    table.add_column("Channel", width=12)
    table.add_column("Status", width=12)
    table.add_column("QA", justify="center", width=6)
    table.add_column("Topic")
    table.add_column("ID", style="dim", width=10)

    current_day = None

    for post in posts:
        sf = post.get("scheduled_for", "")
        try:
            dt = datetime.fromisoformat(sf).astimezone(TIMEZONE)
            day_str = dt.strftime("%a %b %d")
            time_str = dt.strftime("%H:%M")
            scheduled_display = f"{day_str}\n{time_str}"
        except Exception:
            scheduled_display = sf[:16]
            day_str = sf[:10]

        # Add a blank separator row between different days
        if day_str != current_day and current_day is not None:
            table.add_row("", "", "", "", "", "")
        current_day = day_str

        channel = post.get("channel", "")
        color = CHANNEL_COLOR.get(channel, "white")
        status = STATUS_LABEL.get(post.get("status", ""), post.get("status", ""))
        qa = "[green]✓[/]" if post.get("qa_passed") else "[red]✗[/]" if post.get("qa_passed") is False else "[dim]—[/]"
        topic = post.get("topic", "")[:70] + ("…" if len(post.get("topic", "")) > 70 else "")
        draft_id = (post.get("id") or "")[:8] + "…"

        table.add_row(
            scheduled_display,
            f"[{color}]{channel.upper()}[/]",
            status,
            qa,
            topic,
            draft_id,
        )

    console.print(table)
    console.print(f"\n[dim]{len(posts)} post(s) scheduled in the next {days} days[/]")
    console.print("[dim]Use --reschedule <id> --to 'YYYY-MM-DD HH:MM' or --postpone <id> --days N to adjust[/]\n")


def run_reschedule(draft_id: str, to_str: str):
    try:
        new_dt = datetime.strptime(to_str, "%Y-%m-%d %H:%M").replace(tzinfo=TIMEZONE)
    except ValueError:
        console.print("[red]Date format must be 'YYYY-MM-DD HH:MM', e.g. '2026-07-10 09:00'[/]")
        sys.exit(1)

    result_dt = reschedule(draft_id, new_dt)
    console.print(f"[green]✓[/] Rescheduled [dim]{draft_id[:8]}…[/] to [bold]{result_dt.strftime('%a %b %d at %H:%M')}[/]")


def run_postpone(draft_id: str, days: int):
    new_dt = postpone(draft_id, days)
    console.print(f"[green]✓[/] Postponed [dim]{draft_id[:8]}…[/] by {days} day(s) → [bold]{new_dt.strftime('%a %b %d at %H:%M')}[/]")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="View and manage the content schedule")
    parser.add_argument("--days", type=int, default=14, help="Days ahead to show (default 14)")
    parser.add_argument("--reschedule", metavar="DRAFT_ID", help="Reschedule a post to a specific date")
    parser.add_argument("--to", metavar="DATETIME", help="New datetime for --reschedule, format: 'YYYY-MM-DD HH:MM'")
    parser.add_argument("--postpone", metavar="DRAFT_ID", help="Postpone a post by N days")
    parser.add_argument("--postpone-days", type=int, default=7, help="Number of days to postpone (default 7)")
    args = parser.parse_args()

    if args.reschedule:
        if not args.to:
            console.print("[red]--reschedule requires --to 'YYYY-MM-DD HH:MM'[/]")
            sys.exit(1)
        run_reschedule(args.reschedule, args.to)

    elif args.postpone:
        run_postpone(args.postpone, args.postpone_days)

    else:
        show_calendar(days=args.days)
