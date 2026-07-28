-- Structured content pillars with a human approval gate, replacing ad-hoc
-- topic-by-topic selection with an explicit, durable monthly narrative.
-- One pillar can be pillar_type='product' — a way to focus content on one
-- specific product without re-running full company research or forking a
-- second `projects` row (which would fork real social channels via
-- linked_project_id, meant for genuinely separate brands).
--
-- Two tables, mirroring the existing generated_drafts -> published_posts
-- split rather than one mutable row: narrative_briefs is a proposal event,
-- content_pillars is the durable active state. Apply manually in the
-- Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS narrative_briefs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id),
  period_label TEXT,                 -- e.g. '2026-07'
  summary      TEXT,                 -- the "story" behind this cycle's pillars
  raw_pillars  JSONB DEFAULT '[]',   -- proposed pillars, pre-approval
  status       TEXT DEFAULT 'pending_approval',  -- pending_approval | approved | rejected
  slack_ts     TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  decided_at   TIMESTAMPTZ,
  decided_by   TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.narrative_briefs TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS narrative_briefs_project_idx ON narrative_briefs (project_id, created_at);

CREATE TABLE IF NOT EXISTS content_pillars (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID REFERENCES projects(id),
  brief_id        UUID REFERENCES narrative_briefs(id),
  name            TEXT NOT NULL,
  description     TEXT,
  pillar_type     TEXT DEFAULT 'theme',   -- 'theme' | 'product'
  target_ratio    FLOAT DEFAULT 0.25,     -- desired share of recent topics, same semantics as linked_topic_cap_ratio
  example_topics  JSONB DEFAULT '[]',
  status          TEXT DEFAULT 'approved', -- approved | archived
  created_at      TIMESTAMPTZ DEFAULT now(),
  approved_at     TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_pillars TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS content_pillars_project_idx ON content_pillars (project_id, status);

ALTER TABLE generated_drafts ADD COLUMN IF NOT EXISTS pillar_id UUID REFERENCES content_pillars(id);
ALTER TABLE published_posts  ADD COLUMN IF NOT EXISTS pillar_id UUID REFERENCES content_pillars(id);

ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS narrative_brief_frequency TEXT DEFAULT 'monthly';
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS last_brief_generated_at TIMESTAMPTZ;
