-- Profile URLs for the newer channels (Pinterest, Reddit, Threads) added
-- alongside the original 5 (linkedin/instagram/tiktok/youtube/x). Instagram
-- Stories and YouTube Shorts reuse their parent platform's profile, so they
-- don't get separate URL fields. Apply manually in the Supabase SQL editor.
-- Safe to re-run.

ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS pinterest_url TEXT;
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS reddit_url TEXT;
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS threads_url TEXT;
