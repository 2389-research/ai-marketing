-- Token/cost tracking for every real Anthropic API call.
-- Apply manually in the Supabase SQL editor (same as the other setup_*.sql files).
-- Safe to re-run: everything is IF NOT EXISTS / idempotent.
-- Logging in agents/llm.py fails open if this table doesn't exist yet, so
-- nothing breaks before this is applied.

CREATE TABLE IF NOT EXISTS llm_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id),
  caller      TEXT,                    -- name of the agent function that made the call
  model       TEXT,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  cache_creation_input_tokens INT DEFAULT 0,
  cache_read_input_tokens INT DEFAULT 0,
  cost_usd    NUMERIC,                 -- null if the model isn't in agents/llm.py's _PRICING table
  created_at  TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.llm_usage TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS llm_usage_project_idx ON llm_usage (project_id, created_at);
