"""
Project resolution for multi-project support.

Every entry point (run.py, preview.py, cron_*.py, slack_app.py) resolves the
active project once via get_project_id(); agents and DB call sites use it to
scope queries. Resolution order:

  1. PROJECT_ID env var (entry points set this from their --project-id arg)
  2. The oldest row in the projects table (single-project behavior — keeps
     everything working when no project is specified anywhere)
"""

import os
from functools import lru_cache
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


@lru_cache(maxsize=1)
def _default_project_id() -> str | None:
    try:
        res = _supabase.table("projects").select("id").order("created_at").limit(1).execute()
        if res.data:
            return res.data[0]["id"]
    except Exception:
        pass
    return None


def get_project_id() -> str | None:
    """Active project id, or None if the projects table doesn't exist yet
    (pre-migration databases keep working unscoped)."""
    return os.environ.get("PROJECT_ID") or _default_project_id()


def get_project_name(project_id: str | None = None) -> str:
    pid = project_id or get_project_id()
    if not pid:
        return ""
    try:
        res = _supabase.table("projects").select("name").eq("id", pid).limit(1).execute()
        if res.data:
            return res.data[0]["name"]
    except Exception:
        pass
    return ""


def list_projects() -> list[dict]:
    """All projects, oldest first — cron scripts iterate over these."""
    try:
        res = _supabase.table("projects").select("id, name").order("created_at").execute()
        return res.data or []
    except Exception:
        return []


def set_active_project(project_id: str) -> None:
    """Set the active project for this process (used by cron loops)."""
    os.environ["PROJECT_ID"] = project_id


def scope(query):
    """Add the active-project filter to a supabase query builder.
    No-op when no project exists yet (pre-migration databases)."""
    pid = get_project_id()
    return query.eq("project_id", pid) if pid else query


def stamp(row: dict) -> dict:
    """Add project_id to an insert payload (no-op pre-migration)."""
    pid = get_project_id()
    if pid:
        row["project_id"] = pid
    return row
