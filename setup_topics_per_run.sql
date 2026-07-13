-- Per-project generation volume: how many topics cron_generate.py writes
-- per run for a given project. Apply manually in the Supabase SQL editor
-- (same pattern as setup_generation_frequency.sql / setup_cadence.sql).
-- Safe to re-run.

ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS topics_per_run INT DEFAULT 3;

-- Deliberately defaults to 3, not the old hardcoded 5 — each topic can span
-- 1-2 channels, so 5 topics/run at daily frequency produced ~35-70 draft
-- posts/week, far more than typical organic cadence. cron_generate.py falls
-- back to this same default (or CRON_TOPICS) if this column/migration isn't
-- present yet, so nothing breaks before this is applied.
