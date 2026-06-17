# agents/publish_agent.py
# Queues an approved draft in Buffer and records it in published_posts.
# Email channel is skipped (Buffer doesn't handle email).

import os
import httpx
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

BUFFER_API = "https://api.bufferapp.com/1"

CHANNEL_PROFILE_ENV = {
    "linkedin": "BUFFER_LINKEDIN_PROFILE_ID",
    "instagram": "BUFFER_INSTAGRAM_PROFILE_ID",
    "tiktok": "BUFFER_TIKTOK_PROFILE_ID",
}

_supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def queue_post(draft_id: str) -> dict:
    """
    Fetch an approved draft from Supabase, queue it in Buffer,
    and insert a record into published_posts.

    Returns a dict with keys: channel, buffer_update_id, buffer_url
    Raises ValueError for unsupported/unconfigured channels.
    Raises httpx.HTTPStatusError on Buffer API failures.
    """
    token = os.environ.get("BUFFER_ACCESS_TOKEN")
    if not token:
        raise ValueError("BUFFER_ACCESS_TOKEN not set in .env")

    # Fetch draft from Supabase
    row = _supabase.table("generated_drafts").select("*").eq("id", draft_id).single().execute()
    draft = row.data
    channel = draft["channel"]
    draft_text = draft["draft_text"]
    topic = draft["topic"]

    if channel == "email":
        raise ValueError("Email posts are not published via Buffer — send manually.")

    env_key = CHANNEL_PROFILE_ENV.get(channel)
    if not env_key:
        raise ValueError(f"Unsupported channel for Buffer: {channel}")

    profile_id = os.getenv(env_key)
    if not profile_id:
        raise ValueError(f"{env_key} not set in .env — run list_buffer_profiles.py to find your IDs")

    # Queue in Buffer (adds to next available slot in your posting schedule)
    response = httpx.post(
        f"{BUFFER_API}/updates/create.json",
        data={
            "access_token": token,
            "profile_ids[]": profile_id,
            "text": draft_text,
        },
        timeout=15,
    )
    response.raise_for_status()
    result = response.json()

    updates = result.get("updates", [])
    buffer_update_id = updates[0].get("id") if updates else None

    # Record in published_posts
    _supabase.table("published_posts").insert({
        "topic": topic,
        "channel": channel,
        "post_text": draft_text,
        "draft_id": draft_id,
        "engagement": {
            "buffer_update_id": buffer_update_id,
            "status": "queued",
        },
    }).execute()

    return {
        "channel": channel,
        "buffer_update_id": buffer_update_id,
    }
