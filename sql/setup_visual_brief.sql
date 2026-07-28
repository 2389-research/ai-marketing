-- Visual creative direction per draft — what to shoot or illustrate when no
-- existing photo_library match fits (frontend/app/api/photos/match already
-- picks the best EXISTING photo; this is for when none exists yet).
-- Generated once per topic by strategy_agent.py, persisted per-channel draft
-- by content_agent.py, same pattern as the format/pillar_id columns.
-- Apply manually in the Supabase SQL editor. Safe to re-run.

ALTER TABLE generated_drafts ADD COLUMN IF NOT EXISTS visual_brief TEXT;
