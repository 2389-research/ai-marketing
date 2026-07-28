-- Competitor list + synthesized competitor intel reports.
-- Reports are built from NewsAPI/Google News RSS/Reddit mentions of each
-- competitor's name (agents/news_fetchers.py — the same fetchers
-- research_agent.py already uses), NOT a live social-profile scrape —
-- headless cron here has no browser/WebFetch tool, only LLM API calls.
-- Apply manually in the Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS competitors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id),
  name        TEXT NOT NULL,
  notes       TEXT,
  source      TEXT DEFAULT 'manual',  -- 'manual' | 'inferred'
  created_at  TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS competitors_project_idx ON competitors (project_id);

CREATE TABLE IF NOT EXISTS competitor_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects(id),
  findings      JSONB DEFAULT '{}',  -- {competitors: [{name, positioning_summary, notable_moves, audience_reaction, sources}], gaps, whitespace_angles, shared_themes}
  generated_at  TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_reports TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS competitor_reports_project_idx ON competitor_reports (project_id, generated_at);

ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS competitor_frequency TEXT DEFAULT 'weekly';
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS last_competitor_at TIMESTAMPTZ;
