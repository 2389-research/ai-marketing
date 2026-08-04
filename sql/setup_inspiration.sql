-- Inspiration clippings on the Idea Board: save a post/video/article you liked
-- (link, pasted text, or screenshot) — the AI breaks down why it works and what
-- pattern is worth stealing (never the wording).
-- Run in the Supabase SQL editor. Idempotent.
-- ALTER-added columns inherit the table's existing grants — no GRANT needed.

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'idea';  -- idea | inspiration
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS source_url TEXT;           -- where it came from
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS content TEXT;              -- fetched or pasted source text
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS image_url TEXT;            -- screenshot (draft-media bucket)
