-- Self-audit reports: cadence, content mix, and relative engagement computed
-- from REAL published_posts.engagement data (already collected by
-- agents/auto_poster.py::run_engagement_sync) — not simulated metrics.
-- There is no followers/reach column anywhere in this schema, so engagement
-- is benchmarked as a percentile within each channel's own history, never
-- as an absolute engagement-rate tier. Apply manually in the Supabase SQL
-- editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS audit_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id),
  period_start TIMESTAMPTZ,
  period_end   TIMESTAMPTZ,
  findings     JSONB DEFAULT '{}',   -- per-channel cadence/mix/percentile/top-bottom/recommendations
  created_at   TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_reports TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS audit_reports_project_idx ON audit_reports (project_id, created_at);

-- How often the audit should run automatically, and when it last did.
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS audit_frequency TEXT DEFAULT 'weekly';
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS last_audit_at TIMESTAMPTZ;
