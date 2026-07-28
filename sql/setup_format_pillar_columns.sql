-- Persist the content format (thought-leadership, product-spotlight, etc.)
-- chosen by the strategy agent all the way through to published_posts.
-- Today content_agent.py computes strategy["format"] to write the draft but
-- never saves it, so nothing downstream (audits, reporting) can group posts
-- by format. Apply manually in the Supabase SQL editor. Safe to re-run.

ALTER TABLE generated_drafts ADD COLUMN IF NOT EXISTS format TEXT;
ALTER TABLE published_posts  ADD COLUMN IF NOT EXISTS format TEXT;
