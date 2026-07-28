-- Lets two projects be marked as sharing the same real social channels
-- (e.g. "Jeff" content posting through "2389"'s real LinkedIn/Instagram).
-- Apply manually in the Supabase SQL editor (same as the other setup_*.sql files).
-- Safe to re-run: everything is IF NOT EXISTS / idempotent.

-- 1. Self-referencing link — a project points at the one project it shares
--    real channels with. Treated as a pair regardless of which side it's set
--    on (see agents/project_context.py get_channel_group_ids /
--    frontend/lib/project.ts getChannelGroupIds).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS linked_project_id UUID REFERENCES projects(id);

-- 2. Per-project cap on how much of a project's own recent content is
--    allowed to be about its linked project's product/company (e.g. 2389
--    capping how much of its feed is "about Jeff"). Only meaningful when
--    linked_project_id is set; a no-op otherwise.
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS linked_topic_cap_ratio FLOAT DEFAULT 0.25;
