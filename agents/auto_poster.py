"""
agents/auto_poster.py

Checks for approved drafts whose scheduled_for time has passed and posts them
to their respective platforms, then records them in published_posts.
"""

import os
import logging
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Platform posters
# ---------------------------------------------------------------------------

def post_linkedin(text: str, access_token: str, person_urn: str) -> str:
    """Returns the LinkedIn post URN on success, raises on failure."""
    import requests

    payload = {
        "author": person_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": text},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }
    resp = requests.post(
        "https://api.linkedin.com/v2/ugcPosts",
        json=payload,
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-Restli-Protocol-Version": "2.0.0",
            "Content-Type": "application/json",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.headers.get("x-restli-id", "")


def post_x(
    text: str,
    api_key: str,
    api_secret: str,
    access_token: str,
    access_token_secret: str,
) -> str:
    """Returns tweet ID on success."""
    import tweepy

    client = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_token_secret,
    )
    response = client.create_tweet(text=text[:280])
    return str(response.data["id"])


# ---------------------------------------------------------------------------
# Dispatcher: routes a draft to the correct platform poster
# ---------------------------------------------------------------------------

def _dispatch(draft: dict) -> str:
    """
    Post a single draft to its platform.
    Returns the platform post ID / URN string on success.
    Raises an exception on failure.
    For unsupported platforms, returns a sentinel string so the caller can
    mark it as skipped rather than failed.
    """
    channel = (draft.get("channel") or "").lower()
    text = draft.get("draft_text", "")

    if channel == "linkedin":
        access_token = os.getenv("LINKEDIN_ACCESS_TOKEN")
        person_urn = os.getenv("LINKEDIN_PERSON_URN")
        if not access_token or not person_urn:
            logger.warning(
                "[auto-poster] LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_URN not set — skipping draft %s",
                draft["id"],
            )
            return "__skip__"
        return post_linkedin(text, access_token, person_urn)

    elif channel in ("x", "twitter"):
        api_key = os.getenv("X_API_KEY")
        api_secret = os.getenv("X_API_SECRET")
        x_access_token = os.getenv("X_ACCESS_TOKEN")
        x_access_token_secret = os.getenv("X_ACCESS_TOKEN_SECRET")
        if not all([api_key, api_secret, x_access_token, x_access_token_secret]):
            logger.warning(
                "[auto-poster] X credentials not fully set — skipping draft %s",
                draft["id"],
            )
            return "__skip__"
        return post_x(text, api_key, api_secret, x_access_token, x_access_token_secret)

    elif channel == "instagram":
        logger.info(
            "[auto-poster] Instagram posting not yet configured, skipping draft %s",
            draft["id"],
        )
        return "__skip__"

    elif channel == "tiktok":
        logger.info(
            "[auto-poster] TikTok posting not yet configured, skipping draft %s",
            draft["id"],
        )
        return "__skip__"

    elif channel == "youtube":
        logger.info(
            "[auto-poster] YouTube posting not yet configured, skipping draft %s",
            draft["id"],
        )
        return "__skip__"

    elif channel == "email":
        logger.info(
            "[auto-poster] Email posting not configured, skipping draft %s",
            draft["id"],
        )
        return "__skip__"

    else:
        logger.warning(
            "[auto-poster] Unknown channel '%s' for draft %s — skipping",
            channel,
            draft["id"],
        )
        return "__skip__"


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_auto_poster() -> dict:
    """
    Query approved drafts whose scheduled_for has passed, post them to their
    platforms, and update the DB.

    Returns {"posted": int, "skipped": int, "failed": int}.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")

    supabase = create_client(supabase_url, supabase_key)

    now_iso = datetime.now(timezone.utc).isoformat()

    # Fetch due approved drafts
    result = (
        supabase.table("generated_drafts")
        .select("*")
        .eq("status", "approved")
        .lte("scheduled_for", now_iso)
        .not_.is_("scheduled_for", "null")
        .execute()
    )
    drafts = result.data or []

    if not drafts:
        logger.info("[auto-poster] No approved drafts due for posting.")
        return {"posted": 0, "skipped": 0, "failed": 0}

    logger.info("[auto-poster] Found %d draft(s) due for posting.", len(drafts))

    posted = 0
    skipped = 0
    failed = 0

    for draft in drafts:
        draft_id = draft["id"]
        channel = draft.get("channel", "unknown")
        topic = draft.get("topic", "")

        try:
            platform_post_id = _dispatch(draft)

            if platform_post_id == "__skip__":
                skipped += 1
                continue

            # Record in published_posts
            supabase.table("published_posts").insert(
                {
                    "draft_id": draft_id,
                    "channel": channel,
                    "topic": topic,
                    "content": draft.get("draft_text", ""),
                    "published_at": datetime.now(timezone.utc).isoformat(),
                    "platform_post_id": platform_post_id,
                }
            ).execute()

            # Mark draft as published
            supabase.table("generated_drafts").update({"status": "published"}).eq(
                "id", draft_id
            ).execute()

            logger.info(
                "[auto-poster] Posted draft %s to %s (platform_id: %s)",
                draft_id,
                channel,
                platform_post_id,
            )
            posted += 1

        except Exception as exc:  # noqa: BLE001
            # Log and leave status unchanged so it retries next run
            logger.error(
                "[auto-poster] Failed to post draft %s to %s: %s",
                draft_id,
                channel,
                exc,
                exc_info=True,
            )
            failed += 1

    logger.info(
        "[auto-poster] Done — posted: %d, skipped: %d, failed: %d",
        posted,
        skipped,
        failed,
    )
    return {"posted": posted, "skipped": skipped, "failed": failed}
