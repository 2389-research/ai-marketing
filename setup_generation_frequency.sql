-- Per-project auto-generation cadence: how often cron_generate.py writes new
-- drafts for a given project. Apply manually in the Supabase SQL editor
-- (same pattern as setup_cadence.sql / setup_projects.sql). Safe to re-run.

ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS generation_frequency TEXT DEFAULT 'every_3_days';
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMPTZ;

-- generation_frequency values: 'daily' | 'every_3_days' | 'weekly'
-- last_generated_at is nullable — null means "never generated yet", which
-- cron_generate.py treats as immediately due.
