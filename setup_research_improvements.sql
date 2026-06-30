-- Add status lifecycle column to research_candidates
ALTER TABLE research_candidates ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';

-- Update any existing rows to 'new'
UPDATE research_candidates SET status = 'new' WHERE status IS NULL;
