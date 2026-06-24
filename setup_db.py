# setup_db.py
# Run this once to create the required tables in your Supabase project.
# Make sure your .env is filled in before running.

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# These are the SQL statements to run in your Supabase SQL editor.
# Supabase's Python client doesn't support raw DDL — paste these into
# the SQL editor at: https://app.supabase.com > SQL Editor

SQL = """
-- Table: generated_drafts
-- Stores every draft the Content Agent produces, plus QA results.
CREATE TABLE IF NOT EXISTS generated_drafts (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at    TIMESTAMPTZ DEFAULT now(),
    topic         TEXT NOT NULL,
    channel       TEXT NOT NULL,           -- linkedin | instagram | email | tiktok | youtube | x
    draft_text    TEXT NOT NULL,
    qa_passed     BOOLEAN,                 -- null = not yet checked
    qa_issues     TEXT[],                  -- array of issue strings from QA agent
    status        TEXT DEFAULT 'pending',  -- pending | approved | rejected | needs_edit
    approved_at   TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ,             -- set by scheduler on approval
    notes         TEXT                     -- reviewer notes
);

-- Table: published_posts
-- Final record of everything that went live. Used by de-duplication later.
CREATE TABLE IF NOT EXISTS published_posts (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    published_at  TIMESTAMPTZ DEFAULT now(),
    topic         TEXT NOT NULL,
    channel       TEXT NOT NULL,
    post_text     TEXT NOT NULL,
    draft_id      UUID REFERENCES generated_drafts(id),
    engagement    JSONB                    -- filled in by Analytics Agent later
);

-- Table: research_candidates
-- Staging table for Research Agent output. Cleared and repopulated each run.
CREATE TABLE IF NOT EXISTS research_candidates (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at      TIMESTAMPTZ DEFAULT now(),
    title           TEXT NOT NULL,
    summary         TEXT,
    source          TEXT NOT NULL,        -- e.g. "Hacker News", "r/MachineLearning"
    source_url      TEXT,
    source_category TEXT,                 -- article | reddit | video | trend | company
    metadata        JSONB,                -- channel name, view count, trend data, etc.
    score           FLOAT DEFAULT 5.0,    -- average of brand_relevance + engagement_potential
    score_reason    TEXT,
    selected        BOOLEAN DEFAULT false -- true once Strategy Agent picks this topic
);

-- If upgrading an existing database, run these ALTER statements to add missing columns:
-- ALTER TABLE generated_drafts   ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
-- ALTER TABLE generated_drafts   ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT '';
-- ALTER TABLE generated_drafts   ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]';
-- ALTER TABLE research_candidates ADD COLUMN IF NOT EXISTS source_category TEXT;
-- ALTER TABLE research_candidates ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Table: brand_voice_guide
-- Stores the active brand voice rules (mirrors config/brand_voice.py).
-- Useful when you want to edit tone without redeploying code.
CREATE TABLE IF NOT EXISTS brand_voice_guide (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    updated_at    TIMESTAMPTZ DEFAULT now(),
    version       TEXT NOT NULL,
    rules         JSONB NOT NULL           -- full brand voice as JSON
);
"""

print("=" * 60)
print("Paste the following SQL into your Supabase SQL Editor:")
print("https://app.supabase.com > your project > SQL Editor")
print("=" * 60)
print()
print(SQL)
print()
print("After running the SQL, your tables will be ready.")
print("You can verify by running:")
print("  python -c \"from supabase import create_client; import os; from dotenv import load_dotenv; load_dotenv(); c = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY']); print(c.table('generated_drafts').select('id').limit(1).execute())\"")
