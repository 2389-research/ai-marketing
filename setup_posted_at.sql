-- Tracks when an approved draft was actually posted, manually — separate
-- from `status`, since "approved" no longer implies "posted" now that
-- auto-posting is disabled (drafts can sit approved-but-not-yet-posted
-- for a while). Powers the Dashboard's "overdue to post" task and the
-- Mark as posted action on Drafts/PostEditModal.
-- Apply manually in the Supabase SQL editor. Safe to re-run.

ALTER TABLE generated_drafts ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
