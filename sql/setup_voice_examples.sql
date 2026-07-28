-- Voice examples: real posts pasted by the user, injected into every writer
-- prompt as few-shot "match this voice exactly" examples. Descriptions of tone
-- regress to marketing-speak; real examples are what actually moves the voice.
-- Run in the Supabase SQL editor. Idempotent.

ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS voice_examples TEXT;
