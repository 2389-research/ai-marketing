-- Multi-project support: projects table + project_id on every data table.
-- Apply manually in the Supabase SQL editor (same as the other setup_*.sql files).
-- Safe to re-run: everything is IF NOT EXISTS / idempotent.

-- 1. projects table
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  credentials JSONB DEFAULT '{}',   -- per-project social API tokens (falls back to env vars)
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 1b. grant app roles access (SQL-editor-created tables don't always inherit
--     the default grants that dashboard-created tables get)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO anon, authenticated, service_role;

-- 2. seed the default project from the existing brand profile
INSERT INTO projects (name)
SELECT COALESCE((SELECT company_name FROM brand_profile LIMIT 1), 'My Project')
WHERE NOT EXISTS (SELECT 1 FROM projects);

-- 3. add project_id to every data table, backfill to the default project, index it
DO $$
DECLARE
  t TEXT;
  def UUID := (SELECT id FROM projects ORDER BY created_at LIMIT 1);
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'brand_profile','generated_drafts','published_posts','research_candidates',
    'brand_voice_guide','brand_files','photo_library','video_library'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id)', t);
    EXECUTE format('UPDATE %I SET project_id = %L WHERE project_id IS NULL', t, def);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (project_id)', t || '_project_idx', t);
  END LOOP;
END $$;

-- 4. fix pre-existing bug: auto_poster.py writes platform_post_id but the column never existed
ALTER TABLE published_posts ADD COLUMN IF NOT EXISTS platform_post_id TEXT;

-- 5. OPTIONAL — run AFTER deploying the project-aware code (not before, or
--    inserts from the old code will fail):
-- ALTER TABLE brand_profile      ALTER COLUMN project_id SET NOT NULL;
-- ALTER TABLE generated_drafts   ALTER COLUMN project_id SET NOT NULL;
-- ALTER TABLE published_posts    ALTER COLUMN project_id SET NOT NULL;
-- ALTER TABLE research_candidates ALTER COLUMN project_id SET NOT NULL;
