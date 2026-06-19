#!/usr/bin/env python3
# run.py
# Main entry point.
#
# Manual mode (you supply the topic):
#   python run.py --topic "We open-sourced our CV pipeline" --channels linkedin instagram
#
# Auto mode (Research + Strategy agents pick the topic):
#   python run.py --auto
#   python run.py --auto --topics 2 --channels linkedin instagram

import argparse
import os
import sys
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.table import Table
from rich import box

load_dotenv()

console = Console()

# Quick env check before importing agents
missing = [k for k in ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"] if not os.getenv(k)]
if missing:
    console.print(f"[bold red]Missing environment variables:[/] {', '.join(missing)}")
    console.print("Copy .env.example to .env and fill in your keys.")
    sys.exit(1)

SLACK_ENABLED = bool(os.getenv("SLACK_BOT_TOKEN") and os.getenv("SLACK_CHANNEL_ID"))

from agents.content_agent import generate_drafts
from agents.qa_agent import run_qa
from agents.research_agent import run_research
from agents.strategy_agent import run_strategy
from agents.trend_agent import run_trend_research
from agents.website_agent import run_website_research
from supabase import create_client as _sb_create

_supabase = _sb_create(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

if SLACK_ENABLED:
    from agents.slack_agent import post_draft_for_approval


DEFAULT_CHANNELS = ["linkedin", "instagram"]


def print_draft(channel: str, draft: str, qa_result=None):
    color = {
        "linkedin": "blue",
        "instagram": "magenta",
        "email": "yellow",
        "tiktok": "cyan",
    }.get(channel, "white")

    # QA status label
    if qa_result is None:
        qa_label = ""
    elif qa_result.passed:
        qa_label = "  [bold green]✓ QA PASSED[/]"
    else:
        qa_label = "  [bold red]✗ QA FAILED[/]"

    console.print()
    console.print(Panel(
        Text(draft, style="white"),
        title=f"[bold {color}]{channel.upper()}[/]{qa_label}",
        border_style=color,
        padding=(1, 2),
    ))

    if qa_result and qa_result.issues:
        console.print(f"  [bold red]Issues:[/]")
        for issue in qa_result.issues:
            console.print(f"    [red]• {issue}[/]")

    if qa_result and qa_result.warnings:
        console.print(f"  [bold yellow]Warnings (non-blocking):[/]")
        for w in qa_result.warnings:
            console.print(f"    [yellow]• {w}[/]")


def run(topic: str, channels: list[str], extra_context: str = "", save_to_db: bool = True, strategy: dict | None = None):
    console.print()
    console.rule("[bold blue]AI Marketing Content Agent[/]")
    console.print(f"\n[bold]Topic:[/] {topic}")
    console.print(f"[bold]Channels:[/] {', '.join(channels)}")
    if extra_context:
        console.print(f"[bold]Extra context:[/] {extra_context}")
    console.print()

    # Step 1: Generate drafts
    # drafts: dict[channel, {"draft_text": str, "draft_id": str | None}]
    with console.status("[bold blue]Generating drafts...[/]"):
        drafts = generate_drafts(
            topic=topic,
            channels=channels,
            extra_context=extra_context,
            save_to_db=save_to_db,
            strategy=strategy,
        )
    console.print(f"[green]✓[/] Generated {len(drafts)} draft(s)")

    # Step 2: Run QA on each draft
    qa_results = {}
    with console.status("[bold blue]Running QA checks...[/]"):
        for channel, info in drafts.items():
            qa_results[channel] = run_qa(
                draft_text=info["draft_text"],
                channel=channel,
                topic=topic,
                draft_id=info["draft_id"],
            )
    console.print(f"[green]✓[/] QA complete\n")

    # Step 3: Print results
    for channel, info in drafts.items():
        print_draft(channel, info["draft_text"], qa_results.get(channel))

    # Step 4: Summary table
    console.print()
    table = Table(box=box.ROUNDED, show_header=True, header_style="bold")
    table.add_column("Channel", style="bold")
    table.add_column("QA", justify="center")
    table.add_column("Issues")
    table.add_column("Warnings")
    if save_to_db:
        table.add_column("Draft ID", style="dim")

    for channel, qa in qa_results.items():
        status = "[green]PASS[/]" if qa.passed else "[red]FAIL[/]"
        issues = str(len(qa.issues)) if qa.issues else "[green]0[/]"
        warnings = str(len(qa.warnings)) if qa.warnings else "[green]0[/]"
        draft_id = drafts[channel]["draft_id"] or "—"
        if save_to_db:
            table.add_row(channel, status, issues, warnings, draft_id[:8] + "…")
        else:
            table.add_row(channel, status, issues, warnings)

    console.print(table)

    passed = sum(1 for r in qa_results.values() if r.passed)
    total = len(qa_results)
    console.print(f"\n[bold]{passed}/{total} drafts passed QA[/]")

    # Step 5: Post to Slack for approval
    if SLACK_ENABLED and save_to_db:
        console.print()
        slack_posted = 0
        with console.status("[bold blue]Posting to Slack for approval...[/]"):
            for channel, info in drafts.items():
                if info["draft_id"] is None:
                    continue
                qa = qa_results[channel]
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
                    slack_posted += 1
                except Exception as e:
                    console.print(f"  [yellow]⚠ Slack post failed for {channel}: {e}[/]")
        console.print(f"[green]✓[/] {slack_posted} draft(s) posted to Slack — waiting for approval")
        console.print("[dim]Run [bold]python slack_app.py[/dim][dim] to handle Approve / Reject / Edit interactions[/]")
    elif not SLACK_ENABLED:
        console.print("\n[dim]Slack not configured — set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID in .env to enable approval flow[/]")
    else:
        console.print("\n[dim]--no-db flag set: Slack approval skipped (no draft IDs to reference)[/]")

    if save_to_db:
        console.print("[dim]Drafts saved to Supabase (generated_drafts table)[/]")

    console.print()
    console.rule()
    return drafts, qa_results


def run_auto(channels: list[str], num_topics: int = 1, save_to_db: bool = True):
    """Full automated pipeline: Research → Strategy → Content → QA → Slack."""
    console.print()
    console.rule("[bold blue]AI Marketing Agent — Auto Mode[/]")

    # Reset all selected flags from previous runs
    if save_to_db:
        _supabase.table("research_candidates").update({"selected": False}).eq("selected", True).execute()

    # Step 1a: Article + Reddit research
    console.print("\n[bold]Phase 1a: Article & Reddit Research[/]")
    with console.status("[bold blue]Fetching RSS feeds and Reddit...[/]"):
        candidates = run_research(save_to_db=save_to_db)
    console.print(f"[green]✓[/] {len(candidates)} article/reddit candidates scored")

    # Step 1b: YouTube + Google Trends research
    console.print("\n[bold]Phase 1b: YouTube & Google Trends[/]")
    with console.status("[bold blue]Fetching YouTube videos and trending searches...[/]"):
        trend_candidates = run_trend_research(save_to_db=save_to_db)
    console.print(f"[green]✓[/] {len(trend_candidates)} trend/video items scored")

    # Step 1c: Company website scraping (runs only if 3+ days since last scrape)
    console.print("\n[bold]Phase 1c: Company Website[/]")
    with console.status("[bold blue]Scraping company website for new content...[/]"):
        website_candidates = run_website_research(save_to_db=save_to_db)
    if website_candidates:
        console.print(f"[green]✓[/] {len(website_candidates)} company items found")
    else:
        console.print("[dim]↷ Skipped (scraped recently or no website set)[/]")

    # Step 2: Strategy → Content Strategy Matrix
    console.print("\n[bold]Phase 2: Content Strategy Matrix[/]")
    with console.status("[bold blue]Building strategy brief for each topic...[/]"):
        selected = run_strategy(num_topics=num_topics)
    console.print(f"[green]✓[/] {len(selected)} topic(s) selected\n")

    for i, item in enumerate(selected):
        console.print(f"  [bold cyan]{i+1}.[/] {item['topic']}")
        if item.get("format"):
            console.print(f"      [dim]Format:[/] {item['format']}")
        if item.get("why_it_fits"):
            console.print(f"      [dim]Why:[/] {item['why_it_fits']}")
        if item.get("hook"):
            console.print(f"      [dim]Hook:[/] {item['hook']}")
        if item.get("key_points"):
            for pt in item["key_points"]:
                console.print(f"        [dim]·[/] {pt}")
    console.print()

    # Step 3+: Content → QA → Slack for each topic
    VALID_CHANNELS = {"linkedin", "instagram", "email", "tiktok", "youtube"}
    console.print("[bold]Phase 3: Content + QA + Slack[/]")
    for item in selected:
        topic = item["topic"]
        topic_channels = [c for c in item.get("channels", channels) if c in VALID_CHANNELS]
        if not topic_channels:
            topic_channels = channels
        run(topic=topic, channels=topic_channels, save_to_db=save_to_db, strategy=item)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the AI Marketing Agent pipeline")
    parser.add_argument("--auto", action="store_true", help="Auto mode: Research + Strategy pick the topic")
    parser.add_argument("--topic", default="", help="Manual mode: the content topic")
    parser.add_argument(
        "--channels",
        nargs="+",
        default=DEFAULT_CHANNELS,
        choices=["linkedin", "instagram", "email", "tiktok"],
        help="Target channels",
    )
    parser.add_argument("--topics", type=int, default=1, help="Auto mode: number of topics to select (default 1)")
    parser.add_argument("--context", default="", help="Manual mode: extra context (stats, links, event details)")
    parser.add_argument("--no-db", action="store_true", help="Skip saving to Supabase (useful for testing)")
    args = parser.parse_args()

    if args.auto:
        run_auto(
            channels=args.channels,
            num_topics=args.topics,
            save_to_db=not args.no_db,
        )
    else:
        topic = args.topic or "We just shipped a new internal tool that automates our weekly research digest"
        run(
            topic=topic,
            channels=args.channels,
            extra_context=args.context,
            save_to_db=not args.no_db,
        )
