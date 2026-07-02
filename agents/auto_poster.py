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

def post_buffer(text: str, profile_id: str, access_token: str, scheduled_at: str | None = None) -> str:
    """
    Creates a post in Buffer for the given profile.
    scheduled_at: ISO 8601 string (e.g. '2026-06-30T09:00:00Z'). If None, posts now.
    Returns the Buffer update ID on success.
    """
    import requests

    params: dict = {
        "profile_ids[]": profile_id,
        "text": text,
        "access_token": access_token,
    }
    if scheduled_at:
        params["scheduled_at"] = scheduled_at
    else:
        params["now"] = "true"

    resp = requests.post(
        "https://api.bufferapp.com/1/updates/create.json",
        data=params,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    updates = data.get("updates") or []
    if not updates:
        raise RuntimeError(f"Buffer returned no update IDs: {data}")
    return updates[0].get("id", "")


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


def post_instagram(caption: str, image_url: str, access_token: str, account_id: str) -> str:
    """
    Posts a photo to Instagram via the Graph API.
    Instagram requires an image — text-only posts are not supported on the feed.
    Returns the Instagram media ID on success.
    """
    import requests

    # Step 1: create media container
    container_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{account_id}/media",
        params={
            "image_url": image_url,
            "caption":   caption,
            "access_token": access_token,
        },
        timeout=30,
    )
    container_resp.raise_for_status()
    creation_id = container_resp.json()["id"]

    # Step 2: publish the container
    publish_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{account_id}/media_publish",
        params={
            "creation_id":  creation_id,
            "access_token": access_token,
        },
        timeout=30,
    )
    publish_resp.raise_for_status()
    return publish_resp.json()["id"]


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

def _cred(creds: dict, key: str) -> str | None:
    """Project-level credential with env-var fallback: per-client social
    accounts live in projects.credentials JSONB; global env vars remain the
    default for single-account setups."""
    return (creds or {}).get(key) or os.getenv(key)


def _dispatch(draft: dict, creds: dict | None = None) -> str:
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
        buffer_token = _cred(creds, "BUFFER_ACCESS_TOKEN")
        buffer_profile = _cred(creds, "BUFFER_LINKEDIN_PROFILE_ID")
        if buffer_token and buffer_profile:
            return post_buffer(text, buffer_profile, buffer_token, draft.get("scheduled_for"))
        # fallback: direct LinkedIn API
        access_token = _cred(creds, "LINKEDIN_ACCESS_TOKEN")
        person_urn = _cred(creds, "LINKEDIN_PERSON_URN")
        if not access_token or not person_urn:
            logger.warning(
                "[auto-poster] No Buffer or LinkedIn credentials set — skipping draft %s",
                draft["id"],
            )
            return "__skip__"
        return post_linkedin(text, access_token, person_urn)

    elif channel in ("x", "twitter"):
        api_key = _cred(creds, "X_API_KEY")
        api_secret = _cred(creds, "X_API_SECRET")
        x_access_token = _cred(creds, "X_ACCESS_TOKEN")
        x_access_token_secret = _cred(creds, "X_ACCESS_TOKEN_SECRET")
        if not all([api_key, api_secret, x_access_token, x_access_token_secret]):
            logger.warning(
                "[auto-poster] X credentials not fully set — skipping draft %s",
                draft["id"],
            )
            return "__skip__"
        return post_x(text, api_key, api_secret, x_access_token, x_access_token_secret)

    elif channel == "instagram":
        access_token = _cred(creds, "INSTAGRAM_ACCESS_TOKEN")
        account_id   = _cred(creds, "INSTAGRAM_BUSINESS_ACCOUNT_ID")
        if not access_token or not account_id:
            logger.warning(
                "[auto-poster] INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ACCOUNT_ID not set — skipping draft %s",
                draft["id"],
            )
            return "__skip__"
        # Instagram feed posts require an image — use the first attached media URL
        media_urls = draft.get("media") or []
        if not media_urls:
            logger.warning(
                "[auto-poster] Instagram draft %s has no media attached — "
                "Instagram feed posts require an image. Attach one in the Drafts page.",
                draft["id"],
            )
            return "__skip__"
        return post_instagram(text, media_urls[0], access_token, account_id)

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

    # Per-project credentials (empty pre-migration or when unset)
    try:
        proj_res = supabase.table("projects").select("id, credentials").execute()
        project_creds = {p["id"]: (p.get("credentials") or {}) for p in (proj_res.data or [])}
    except Exception:
        project_creds = {}

    for draft in drafts:
        draft_id = draft["id"]
        channel = draft.get("channel", "unknown")
        topic = draft.get("topic", "")

        try:
            platform_post_id = _dispatch(draft, project_creds.get(draft.get("project_id"), {}))

            if platform_post_id == "__skip__":
                skipped += 1
                continue

            # Record in published_posts
            published_row = {
                "draft_id": draft_id,
                "channel": channel,
                "topic": topic,
                "content": draft.get("draft_text", ""),
                "published_at": datetime.now(timezone.utc).isoformat(),
                "platform_post_id": platform_post_id,
            }
            if draft.get("project_id"):
                published_row["project_id"] = draft["project_id"]
            supabase.table("published_posts").insert(published_row).execute()

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
