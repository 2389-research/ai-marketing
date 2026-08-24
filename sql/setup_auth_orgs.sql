-- Multi-tenant auth: real user accounts (Supabase Auth) grouped into companies
-- (organizations) with roles, plus shareable join codes and email invitations.
-- Run in the Supabase SQL editor. Idempotent. Safe to run on the live app —
-- it is purely ADDITIVE (new tables + one nullable column on projects) and does
-- NOT enable row-level security yet, so the existing app keeps working unchanged
-- during the migration. RLS lockdown is a later, deliberate step.

-- ── Companies ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  -- Shareable join code (the "/join/<code>" link). Anyone with it joins as Member.
  join_code   TEXT UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Membership (user ↔ company, with a role) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS org_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS org_members_user ON org_members (user_id);
CREATE INDEX IF NOT EXISTS org_members_org  ON org_members (org_id);

-- ── Email invitations (specific person + role, pending until accepted) ────────
CREATE TABLE IF NOT EXISTS org_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  code        TEXT UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS org_invitations_org ON org_invitations (org_id);
CREATE INDEX IF NOT EXISTS org_invitations_email ON org_invitations (lower(email));

-- ── Link the existing "projects" (brands) to a company ───────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS projects_org ON projects (org_id);

-- Backfill: put every existing brand under one starter company so the current
-- data has a home. The real owner is attached on first login (see claim flow).
DO $$
DECLARE default_org UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM projects WHERE org_id IS NULL) THEN
    SELECT id INTO default_org FROM organizations WHERE name = '2389 Research' LIMIT 1;
    IF default_org IS NULL THEN
      INSERT INTO organizations (name) VALUES ('2389 Research') RETURNING id INTO default_org;
    END IF;
    UPDATE projects SET org_id = default_org WHERE org_id IS NULL;
  END IF;
END $$;

-- ── Profiles (readable mirror of auth.users) ─────────────────────────────────
-- The app's anon key cannot read the private auth.users table, so member names
-- and emails live here, kept in sync by a trigger on signup.
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  full_name   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill anyone who already exists.
INSERT INTO profiles (id, email, full_name)
SELECT id, email, raw_user_meta_data->>'full_name' FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- New tables don't inherit the grants the app's API keys rely on.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations  TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members    TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invitations TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles        TO anon, authenticated, service_role;
