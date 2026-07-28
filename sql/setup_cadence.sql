-- Add posting cadence to brand profile
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS posting_cadence JSONB DEFAULT '{}';
