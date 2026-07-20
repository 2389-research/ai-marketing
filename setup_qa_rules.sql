-- Custom QA rules — user-editable house rules (anti-slop phrasing, style
-- bans, etc.) that get folded into agents/qa_agent.py's LLM check alongside
-- the built-in tone/credibility/clarity checks. Apply manually in the
-- Supabase SQL editor (same pattern as the other setup_*.sql files).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS qa_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  label      TEXT NOT NULL,
  rule_text  TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qa_rules_project_idx ON qa_rules (project_id);

-- SQL-editor-created tables don't always inherit the default grants that
-- dashboard-created tables get.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_rules TO anon, authenticated, service_role;
