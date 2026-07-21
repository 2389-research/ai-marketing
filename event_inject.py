#!/usr/bin/env python3
# event_inject.py
# Inject a one-off event into the content pipeline.
# Generates a full timeline of posts (Teaser → Announcement → Recap)
# and sends each to Slack for approval — bypassing the Monday research cycle.
#
# Usage:
#   python event_inject.py --event "AI Lab Open Day" --date "2026-07-01" --description "We're opening our lab to the public for the first time"
#   python event_inject.py --event "Best Paper Award" --date "2026-07-15" --priority high --channels linkedin instagram
#   python event_inject.py  (interactive mode — prompts for input)

import argparse
import os
import sys
from datetime import datetime
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import box

load_dotenv()

console = Console()

missing = [k for k in ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    console.print(f"[bold red]Missing env vars:[/] {', '.join(missing)}")
    sys.exit(1)

from agents.event_agent import generate_event_timeline

VALID_CHANNELS = ["linkedin", "instagram", "email", "tiktok"]
DEFAULT_CHANNELS = ["linkedin", "instagram"]


def prompt_input(label: str, required: bool = True) -> str:
    while True:
        value = console.input(f"[bold cyan]{label}:[/] ").strip()
        if value or not required:
            return value
        console.print("[yellow]  This field is required.[/]")


def interactive_mode() -> dict:
    console.print()
    console.rule("[bold blue]Manual Event Injection[/]")
    console.print("[dim]Fill in the event details below. Press Enter to confirm each field.[/]\n")

    event_name = prompt_input("Event name (e.g. 'AI Lab Open Day')")

    while True:
        date_str = prompt_input("Event date (YYYY-MM-DD)")
        try:
            event_date = datetime.strptime(date_str, "%Y-%m-%d")
            break
        except ValueError:
            console.print("[yellow]  Use format YYYY-MM-DD, e.g. 2026-07-01[/]")

    description = prompt_input("Description (what is this event about?)")

    console.print(f"[bold cyan]Priority:[/] [dim]standard (teaser + announcement + recap) or high (+ countdown T-3, T-2, T-1)[/]")
    while True:
        priority = console.input("[bold cyan]Priority (standard/high) [[dim]standard[/]]: ").strip().lower() or "standard"
        if priority in ("standard", "high"):
            break
        console.print("[yellow]  Enter 'standard' or 'high'[/]")

    console.print(f"[bold cyan]Channels:[/] [dim]Available: linkedin, instagram, email, tiktok[/]")
    channels_input = console.input(f"[bold cyan]Channels [[dim]linkedin instagram[/]]: ").strip()
    if channels_input:
        channels = [c.strip() for c in channels_input.split() if c.strip() in VALID_CHANNELS]
        if not channels:
            channels = DEFAULT_CHANNELS
    else:
        channels = DEFAULT_CHANNELS

    return {
        "event_name": event_name,
        "event_date": event_date,
        "description": description,
        "priority": priority,
        "channels": channels,
    }


def run_injection(event_name, event_date, description, priority, channels):
    post_count = 3 if priority == "standard" else 6
    total_drafts = post_count * len(channels)

    console.print()
    console.rule("[bold blue]Event Content Pipeline[/]")
    console.print(f"\n[bold]Event:[/] {event_name}")
    console.print(f"[bold]Date:[/] {event_date.strftime('%B %d, %Y')}")
    console.print(f"[bold]Priority:[/] {priority.upper()} — {post_count} timeline posts × {len(channels)} channel(s) = {total_drafts} drafts")
    console.print(f"[bold]Channels:[/] {', '.join(channels)}")
    console.print()

    console.print("[bold]Generating timeline...[/]")
    results = generate_event_timeline(
        event_name=event_name,
        event_date=event_date,
        description=description,
        channels=channels,
        priority=priority,
    )

    # Summary table
    console.print()
    table = Table(box=box.ROUNDED, show_header=True, header_style="bold")
    table.add_column("Phase", style="bold")
    table.add_column("Scheduled")
    table.add_column("Channel")
    table.add_column("QA", justify="center")
    table.add_column("Draft ID", style="dim")

    for r in results:
        qa_label = "[green]PASS[/]" if r["qa_passed"] else "[red]FAIL[/]"
        draft_id_short = (r["draft_id"] or "—")[:8] + "…" if r["draft_id"] else "—"
        table.add_row(r["phase"], r["scheduled_date"], r["channel"], qa_label, draft_id_short)

    console.print(table)

    passed = sum(1 for r in results if r["qa_passed"])
    console.print(f"\n[bold]{passed}/{len(results)} drafts passed QA[/]")

    if os.getenv("SLACK_BOT_TOKEN"):
        console.print(f"[green]✓[/] All drafts posted to Slack for approval")
        console.print("[dim]Run [bold]python slack_app.py[/dim][dim] to handle Approve / Reject / Edit[/]")
    else:
        console.print("[dim]Slack not configured — drafts saved to Supabase only[/]")

    console.print()
    console.rule()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inject a one-off event into the content pipeline")
    parser.add_argument("--event", help="Event name, e.g. 'AI Lab Open Day'")
    parser.add_argument("--date", help="Event date in YYYY-MM-DD format")
    parser.add_argument("--description", help="What the event is about")
    parser.add_argument("--priority", choices=["standard", "high"], default="standard")
    parser.add_argument("--channels", nargs="+", choices=VALID_CHANNELS, default=DEFAULT_CHANNELS)
    args = parser.parse_args()

    # If any required arg is missing, fall into interactive mode
    if not args.event or not args.date or not args.description:
        params = interactive_mode()
    else:
        try:
            event_date = datetime.strptime(args.date, "%Y-%m-%d")
        except ValueError:
            console.print("[bold red]Invalid date format. Use YYYY-MM-DD.[/]")
            sys.exit(1)
        params = {
            "event_name": args.event,
            "event_date": event_date,
            "description": args.description,
            "priority": args.priority,
            "channels": args.channels,
        }

    run_injection(**params)
