-- Learning layer: raw feedback events + the distilled lessons memo.
-- Run in the Supabase SQL editor. Idempotent.
--
-- feedback_events is the append-only evidence log: every explicit judgment the
-- user makes (reject + reason, manual edit diff, final-version paste at
-- posting time, edit-request feedback). Derived signals (approved-but-never-
-- posted, research rejections, engagement extremes) are NOT stored here —
-- cron_learn.py queries them live from existing tables.
--
-- brand_profile.learned_lessons is the distilled memo cron_learn.py maintains;
-- it gets injected into strategy + writing prompts alongside voice examples.

CREATE TABLE IF NOT EXISTS feedback_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID,
  draft_id    UUID,
  event_type  TEXT NOT NULL,          -- 'rejected' | 'edited' | 'final_edit' | 'edit_requested'
  channel     TEXT,
  topic       TEXT,
  reason      TEXT,                   -- user's stated why (reject reason, edit-request feedback)
  before_text TEXT,                   -- for diffs: the AI's version
  after_text  TEXT,                   -- for diffs: the human's version
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_events_project_created
  ON feedback_events (project_id, created_at DESC);

ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS learned_lessons TEXT;
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS learned_lessons_updated_at TIMESTAMPTZ;

-- New tables don't inherit the grants the app's API keys rely on — without
-- this, every insert/select fails with 'permission denied' (42501).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_events TO anon, authenticated, service_role;

-- Watermark for the learning loop's DERIVED (implicit) signals so a newly stale
-- approved draft / moved engagement / quiet research rejection can trigger a memo
-- update on its own, not only when explicit feedback also exists (issue #18).
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS learned_signals_fingerprint TEXT;
