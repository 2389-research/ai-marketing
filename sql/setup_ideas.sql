-- Idea Inbox: brainstorm seeds the AI can grow into content.
-- Run in the Supabase SQL editor. Idempotent.

CREATE TABLE IF NOT EXISTS ideas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID,
  text        TEXT NOT NULL,
  enrichment  JSONB,                -- {angles: [], channels: [], hook: ''} — AI-added after capture
  status      TEXT DEFAULT 'new',   -- new | queued (in research pool) | drafted | archived
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ideas_project_created ON ideas (project_id, created_at DESC);

-- New tables don't inherit the grants the app's API keys rely on.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ideas TO anon, authenticated, service_role;
