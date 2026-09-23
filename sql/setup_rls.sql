-- Row-level security lockdown.
--
-- Until this file is applied, every table grants full SELECT/INSERT/UPDATE/DELETE
-- to the `anon` role with no RLS behind it. The app's only access control lives in
-- frontend/middleware.ts, which guards the Next.js app but NOT the Supabase REST
-- API. Because NEXT_PUBLIC_SUPABASE_ANON_KEY is inlined into the browser bundle by
-- frontend/lib/supabase-browser.ts (reached from the public /signin, /signup and
-- /join routes), anyone who loads the site can read that key and then talk to
-- PostgREST directly — bypassing the middleware entirely.
--
-- This file closes that hole: it enables RLS on every table and scopes access to
-- the organizations a user actually belongs to.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️  THIS IS NOT SAFE TO PASTE AND RUN. Read sql/RLS_MIGRATION.md first.
--
-- Applying this WILL break the Python backend and the Next.js API routes as they
-- are currently configured, because both authenticate as `anon`, and `anon` has
-- no rights at all once RLS is on. Both must move to the service-role key (which
-- bypasses RLS) BEFORE this runs. RLS_MIGRATION.md has the ordering.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Idempotent and re-runnable, like every other file in this folder.

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so these can read org_members without re-triggering the
-- policies defined on org_members itself (which would recurse infinitely).

-- Orgs the calling user belongs to.
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid()
$$;

-- Projects (brands) reachable through those orgs. A project with a NULL org_id
-- is unreachable by design — it belongs to no one until it is adopted by an org.
CREATE OR REPLACE FUNCTION public.user_project_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id FROM projects p
  WHERE p.org_id IN (SELECT public.user_org_ids())
$$;

-- Does the caller hold an elevated role in this org?
CREATE OR REPLACE FUNCTION public.is_org_admin(target_org UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = target_org AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_org_ids()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_project_ids()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID)      TO authenticated;

-- ── Revoke the blanket anon grants ───────────────────────────────────────────
-- RLS alone would already deny anon (no policy names it), but dropping the
-- grants means a future table-level policy mistake can't silently re-open
-- everything to unauthenticated callers.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects','organizations','org_members','org_invitations','profiles',
    'brand_profile','brand_voice_guide','brand_files','generated_drafts',
    'published_posts','research_candidates','photo_library','video_library',
    'ideas','feedback_events','audit_reports','competitors','competitor_reports',
    'narrative_briefs','content_pillars','qa_rules','llm_usage'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- ── Org-level policies ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS org_read   ON organizations;
DROP POLICY IF EXISTS org_insert ON organizations;
DROP POLICY IF EXISTS org_update ON organizations;
DROP POLICY IF EXISTS org_delete ON organizations;

-- You can see an org you belong to.
CREATE POLICY org_read ON organizations FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_org_ids()));
-- Anyone signed in may create a company (they become its owner via the app).
CREATE POLICY org_insert ON organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY org_update ON organizations FOR UPDATE TO authenticated
  USING (public.is_org_admin(id)) WITH CHECK (public.is_org_admin(id));
CREATE POLICY org_delete ON organizations FOR DELETE TO authenticated
  USING (public.is_org_admin(id));

DROP POLICY IF EXISTS member_read   ON org_members;
DROP POLICY IF EXISTS member_insert ON org_members;
DROP POLICY IF EXISTS member_update ON org_members;
DROP POLICY IF EXISTS member_delete ON org_members;

-- You can see everyone in your own orgs (the team roster).
CREATE POLICY member_read ON org_members FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
-- Joining: you may only ever insert a membership row for yourself. The app is
-- responsible for checking the join code / invitation before calling this.
CREATE POLICY member_insert ON org_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
-- Only admins change roles, and nobody may edit their own row (no self-promotion).
CREATE POLICY member_update ON org_members FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id) AND user_id <> auth.uid())
  WITH CHECK (public.is_org_admin(org_id));
-- Admins can remove anyone; anyone can remove themselves (leave the company).
CREATE POLICY member_delete ON org_members FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS invite_read   ON org_invitations;
DROP POLICY IF EXISTS invite_write  ON org_invitations;
DROP POLICY IF EXISTS invite_update ON org_invitations;
DROP POLICY IF EXISTS invite_delete ON org_invitations;

-- An invitee needs to see the invite addressed to them before they have joined,
-- so match on their own email as well as on org membership.
CREATE POLICY invite_read ON org_invitations FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );
CREATE POLICY invite_write ON org_invitations FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(org_id));
-- Accepting an invite is an UPDATE by the invitee, so allow either party.
CREATE POLICY invite_update ON org_invitations FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(org_id)
    OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
  WITH CHECK (
    public.is_org_admin(org_id)
    OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );
CREATE POLICY invite_delete ON org_invitations FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id));

DROP POLICY IF EXISTS profile_read   ON profiles;
DROP POLICY IF EXISTS profile_update ON profiles;
DROP POLICY IF EXISTS profile_insert ON profiles;

-- You can read your own profile, plus the profiles of people you share an org
-- with (so the members list can show names instead of bare UUIDs).
CREATE POLICY profile_read ON profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR id IN (
      SELECT user_id FROM org_members WHERE org_id IN (SELECT public.user_org_ids())
    )
  );
CREATE POLICY profile_insert ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY profile_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ── Projects ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS project_read   ON projects;
DROP POLICY IF EXISTS project_insert ON projects;
DROP POLICY IF EXISTS project_update ON projects;
DROP POLICY IF EXISTS project_delete ON projects;

CREATE POLICY project_read ON projects FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY project_insert ON projects FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY project_update ON projects FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY project_delete ON projects FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id));

-- ── Every project-scoped data table ──────────────────────────────────────────
-- All of these carry a project_id (added by setup_projects.sql or by their own
-- setup file), so they share one policy shape: the row is visible exactly when
-- its project belongs to one of your orgs.
--
-- NOTE ON NULLs: a row whose project_id is NULL matches no policy and becomes
-- invisible to everyone but service_role. setup_projects.sql backfills existing
-- rows, but verify none are left before relying on this — see RLS_MIGRATION.md.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'brand_profile','brand_voice_guide','brand_files','generated_drafts',
    'published_posts','research_candidates','photo_library','video_library',
    'ideas','feedback_events','audit_reports','competitors','competitor_reports',
    'narrative_briefs','content_pillars','qa_rules','llm_usage'
  ] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_project_scope', t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING      (project_id IN (SELECT public.user_project_ids()))
        WITH CHECK (project_id IN (SELECT public.user_project_ids()))
    $p$, t || '_project_scope', t);
  END LOOP;
END $$;

-- ── Storage ──────────────────────────────────────────────────────────────────
-- Buckets are NOT covered here. draft-media and any other bucket have their own
-- policies under storage.objects and need a separate pass — tracked in BACKLOG.md.

-- ── Verify ───────────────────────────────────────────────────────────────────
-- After running, this should return zero rows. Anything listed is still open.
--
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND rowsecurity = false;
--
-- And this should show no grants to anon:
--
--   SELECT table_name, privilege_type FROM information_schema.role_table_grants
--   WHERE grantee = 'anon' AND table_schema = 'public';
