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

from agents.llm import mock_mode

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


def _moderate_image(image_url: str) -> None:
    """Raises RuntimeError if the image is flagged as inappropriate/off-brand.
    Fails open on download/API errors — a moderation-check hiccup shouldn't
    block a legitimate post any more than QA hiccups do elsewhere in this
    file; it should only block on an actual FLAGGED verdict."""
    import requests
    from agents.llm import chat_vision

    try:
        resp = requests.get(image_url, timeout=15)
        resp.raise_for_status()
        media_type = resp.headers.get("content-type", "image/jpeg").split(";")[0]
        if not media_type.startswith("image/"):
            media_type = "image/jpeg"
        verdict = chat_vision(
            system="You are a content moderator for a professional brand's Instagram account.",
            user_text=(
                "Is this image inappropriate, NSFW, offensive, or embarrassing/off-brand for a "
                "professional brand account? Reply with exactly 'FLAGGED: <reason>' or 'OK: <reason>'."
            ),
            image_bytes=resp.content,
            media_type=media_type,
        )
    except Exception as e:
        logger.warning("[auto-poster] Image moderation check failed (%s) — proceeding without it", e)
        return

    if verdict.strip().upper().startswith("FLAGGED"):
        raise RuntimeError(f"Image moderation flagged this photo — {verdict}")


def post_instagram(caption: str, image_url: str, access_token: str, account_id: str) -> str:
    """
    Posts a photo to Instagram via the Graph API.
    Instagram requires an image — text-only posts are not supported on the feed.
    Returns the Instagram media ID on success.
    """
    import requests

    _moderate_image(image_url)

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
    try:
        response = client.create_tweet(text=text[:280])
    except tweepy.errors.HTTPException as e:
        # X's Free API tier returns 402 "no credits" on this — an account/
        # billing restriction on X's side, not a bug. Verified this also
        # blocks tweet lookups (get_engagement below), not just posting —
        # Free tier is essentially identity-only (get_me works, nothing else
        # does). Surface a message the user can act on instead of the raw text.
        if "credit" in str(e).lower() or "payment required" in str(e).lower():
            raise RuntimeError(
                "X API posting requires a paid Developer tier (Free tier is read-only). "
                "Upgrade at developer.x.com, or post via Buffer instead."
            ) from e
        raise
    return str(response.data["id"])


def get_engagement_x(platform_post_id: str, api_key: str, api_secret: str,
                     access_token: str, access_token_secret: str) -> dict | None:
    """Returns {"likes": int, "comments": int, "reposts": int, "views": int} or
    None if unavailable. NOTE: confirmed this hits the same 402 "no credits"
    Free-tier block as posting — tweet lookups aren't a separate free
    allowance on this account. Will work once the account has a paid tier."""
    import tweepy

    client = tweepy.Client(
        consumer_key=api_key, consumer_secret=api_secret,
        access_token=access_token, access_token_secret=access_token_secret,
    )
    try:
        resp = client.get_tweet(platform_post_id, tweet_fields=["public_metrics"])
    except Exception as e:
        logger.info("[engagement] X lookup failed for %s: %s", platform_post_id, e)
        return None
    if not resp.data:
        return None
    m = resp.data.public_metrics or {}
    return {
        "likes": m.get("like_count", 0),
        "comments": m.get("reply_count", 0),
        "reposts": m.get("retweet_count", 0),
        "views": m.get("impression_count", 0),
    }


def get_engagement_instagram(platform_post_id: str, access_token: str) -> dict | None:
    """Returns like/comment/reach counts via the Graph API insights endpoint.
    Untested — no Instagram credentials exist yet — but implemented per the
    documented endpoint shape for Business/Creator accounts."""
    import requests

    try:
        resp = requests.get(
            f"https://graph.facebook.com/v19.0/{platform_post_id}/insights",
            params={"metric": "likes,comments,reach", "access_token": access_token},
            timeout=15,
        )
        resp.raise_for_status()
        data = {d["name"]: d["values"][0]["value"] for d in resp.json().get("data", [])}
    except Exception as e:
        logger.info("[engagement] Instagram lookup failed for %s: %s", platform_post_id, e)
        return None
    return {
        "likes": data.get("likes", 0),
        "comments": data.get("comments", 0),
        "reach": data.get("reach", 0),
    }


def get_engagement_linkedin(platform_post_id: str, access_token: str) -> dict | None:
    """Returns basic like/comment counts via LinkedIn's Social Actions API,
    which works with the same w_member_social scope already needed for
    posting. Full analytics (impressions, CTR) need separate Marketing
    Developer Platform approval — out of scope here. Untested — no LinkedIn
    credentials exist yet."""
    import requests

    try:
        resp = requests.get(
            f"https://api.linkedin.com/v2/socialActions/{platform_post_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.info("[engagement] LinkedIn lookup failed for %s: %s", platform_post_id, e)
        return None
    return {
        "likes": (data.get("likesSummary") or {}).get("totalLikes", 0),
        "comments": (data.get("commentsSummary") or {}).get("totalFirstLevelComments", 0),
    }


def get_engagement(channel: str, platform_post_id: str, creds: dict | None = None) -> dict | None:
    """Dispatch to the right platform's engagement reader. Returns None for
    unconfigured/unposted channels — that's expected steady-state, not an
    error, since most channels have no working credentials yet."""
    creds = creds or {}
    channel = (channel or "").lower()

    if channel in ("x", "twitter"):
        api_key = _cred(creds, "X_API_KEY")
        api_secret = _cred(creds, "X_API_SECRET")
        access_token = _cred(creds, "X_ACCESS_TOKEN")
        access_token_secret = _cred(creds, "X_ACCESS_TOKEN_SECRET")
        if not all([api_key, api_secret, access_token, access_token_secret]):
            return None
        return get_engagement_x(platform_post_id, api_key, api_secret, access_token, access_token_secret)

    elif channel == "instagram":
        access_token = _cred(creds, "INSTAGRAM_ACCESS_TOKEN")
        if not access_token:
            return None
        return get_engagement_instagram(platform_post_id, access_token)

    elif channel == "linkedin":
        access_token = _cred(creds, "LINKEDIN_ACCESS_TOKEN")
        if not access_token:
            return None
        return get_engagement_linkedin(platform_post_id, access_token)

    return None  # tiktok/youtube/email — not implemented


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

    if mock_mode():
        logger.info("[auto-poster] MOCK_MODE — simulating post to %s for draft %s", channel, draft.get("id"))
        return f"__mock_{channel}_{draft.get('id', 'unknown')}"

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
# Single-draft posting (shared by the cron and the "Post now" button)
# ---------------------------------------------------------------------------

def _load_project_creds(supabase) -> dict:
    try:
        proj_res = supabase.table("projects").select("id, credentials").execute()
        return {p["id"]: (p.get("credentials") or {}) for p in (proj_res.data or [])}
    except Exception:
        return {}


def _post_one(draft: dict, supabase, project_creds: dict) -> dict:
    """Post one draft to its platform, record it, and mark it published.
    Returns {"status": "posted"|"skipped"|"blocked", ...}. Raises on real posting errors."""
    draft_id = draft["id"]
    channel  = draft.get("channel", "unknown")
    topic    = draft.get("topic", "")

    # Guardrail: a draft that QA explicitly failed must never post, even if
    # it was approved (by mistake or otherwise). Only blocks on an explicit
    # False — qa_passed is None for manually-authored posts (compose/schedule
    # routes) that never run QA at all, and those are a legitimate path.
    if draft.get("qa_passed") is False:
        logger.warning("[auto-poster] Blocked draft %s (%s) — QA flagged it, not posting", draft_id, channel)
        return {
            "status": "blocked", "channel": channel,
            "reason": "QA flagged this draft (see qa_issues) — fix it or regenerate before posting",
        }

    platform_post_id = _dispatch(draft, project_creds.get(draft.get("project_id"), {}))

    if platform_post_id == "__skip__":
        return {
            "status": "skipped", "channel": channel,
            "reason": f"{channel} posting isn't configured (missing credentials or not yet supported)",
        }

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
    supabase.table("generated_drafts").update({"status": "published"}).eq("id", draft_id).execute()

    logger.info("[auto-poster] Posted draft %s to %s (platform_id: %s)", draft_id, channel, platform_post_id)
    return {"status": "posted", "channel": channel, "platform_post_id": platform_post_id}


def post_single_draft(draft_id: str) -> dict:
    """Post one draft immediately by id (the 'Post now' path). Never raises —
    returns a result dict the API/UI can display."""
    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    res = supabase.table("generated_drafts").select("*").eq("id", draft_id).limit(1).execute()
    draft = (res.data or [None])[0]
    if not draft:
        return {"status": "error", "error": "Draft not found"}
    if draft.get("status") == "published":
        return {"status": "error", "error": "This draft is already published"}
    try:
        return _post_one(draft, supabase, _load_project_creds(supabase))
    except Exception as exc:  # noqa: BLE001
        logger.error("[auto-poster] Post-now failed for %s: %s", draft_id, exc, exc_info=True)
        return {"status": "error", "channel": draft.get("channel"), "error": str(exc)}


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

    posted = skipped = failed = blocked = 0
    project_creds = _load_project_creds(supabase)

    for draft in drafts:
        try:
            result = _post_one(draft, supabase, project_creds)
            if result["status"] == "posted":
                posted += 1
            elif result["status"] == "blocked":
                blocked += 1
            else:
                skipped += 1
        except Exception as exc:  # noqa: BLE001
            # Leave status unchanged so it retries next run
            logger.error("[auto-poster] Failed to post draft %s to %s: %s",
                         draft["id"], draft.get("channel"), exc, exc_info=True)
            failed += 1

    logger.info("[auto-poster] Done — posted: %d, skipped: %d, blocked: %d, failed: %d",
               posted, skipped, blocked, failed)
    return {"posted": posted, "skipped": skipped, "blocked": blocked, "failed": failed}


# ---------------------------------------------------------------------------
# Engagement sync — pulls real likes/comments/views back for posted content
# ---------------------------------------------------------------------------

def run_engagement_sync() -> dict:
    """Update the `engagement` field on published_posts for every row that
    actually has a platform_post_id (i.e. was really posted, not just
    approved). Returns {"updated": int, "unavailable": int, "checked": int}."""
    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    project_creds = _load_project_creds(supabase)

    rows = (
        supabase.table("published_posts")
        .select("id, channel, platform_post_id, project_id")
        .not_.is_("platform_post_id", "null")
        .execute()
    ).data or []

    if not rows:
        logger.info("[engagement] No posts with a platform_post_id yet — nothing to sync.")
        return {"updated": 0, "unavailable": 0, "checked": 0}

    updated = unavailable = 0
    for row in rows:
        creds = project_creds.get(row.get("project_id"), {})
        data = get_engagement(row["channel"], row["platform_post_id"], creds)
        if data is None:
            unavailable += 1
            continue
        supabase.table("published_posts").update({"engagement": data}).eq("id", row["id"]).execute()
        updated += 1

    logger.info("[engagement] Checked %d, updated %d, unavailable %d", len(rows), updated, unavailable)
    return {"updated": updated, "unavailable": unavailable, "checked": len(rows)}
