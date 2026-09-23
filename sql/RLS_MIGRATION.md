# Applying `setup_rls.sql`

`sql/setup_rls.sql` is written but **not applied**. Running it out of order takes
the app down. This file is the order.

## Why this exists

The app's access control lives in `frontend/middleware.ts`. That guards the
Next.js app. It does not guard the Supabase REST API.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is inlined into the browser bundle by
`frontend/lib/supabase-browser.ts`, which is imported by `/signin`, `/signup` and
`/join/[code]` — all listed in `PUBLIC_PATHS`. So the key is readable by anyone who
loads the site without logging in. Every table currently does:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO anon, authenticated, service_role;
```

with no RLS behind it. That combination means the anon key is not an anon key in
any meaningful sense — it is a full read/write/delete credential for the whole
database, published on the internet.

Rotating the key does not fix this. The replacement is inlined into the same
public bundle on the next build. RLS is the fix.

## What breaks, and why

Once RLS is on, `anon` has no rights to anything. Two consumers authenticate as
`anon` today and will start failing immediately:

| Consumer | How it connects | Count |
|---|---|---|
| Python backend (`agents/`, `cron_*.py`, `cli_*.py`) | `create_client(SUPABASE_URL, SUPABASE_KEY)`, where `SUPABASE_KEY` is the anon key | 34 modules |
| Next.js API routes | `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`, constructed inline per route | 38 routes |

Both are trusted server-side code, so both should be using the **service-role
key**, which bypasses RLS. Neither should ever have been on the anon key.

The browser client (`frontend/lib/supabase-browser.ts`) is the one place the anon
key is correct — it does auth only, and after this migration that is all it can do.

## Order of operations

**Steps 1–3 are safe to do now, before any SQL runs.** Service-role works
identically with RLS off, so there is no flag day.

### 1. Get the service-role key into the environments

Supabase dashboard → Project Settings → API → `service_role` secret.

```bash
# Backend (.env) — replace the anon key
SUPABASE_KEY="<service_role key>"

# Frontend (.env.local)
SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
```

On Fly:

```bash
fly secrets set --app postique \
  SUPABASE_KEY="<service_role key>" \
  SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
```

This key bypasses RLS entirely. It must never reach the browser, never be a
`NEXT_PUBLIC_*` var, and never be committed.

### 2. Point the Next.js API routes at it

38 route files under `frontend/app/api/` each build their own client. Each needs:

```diff
 const supabase = createClient(
   process.env.NEXT_PUBLIC_SUPABASE_URL!,
-  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
+  process.env.SUPABASE_SERVICE_ROLE_KEY!,
 )
```

`frontend/app/api/reset/route.ts` already reads
`SUPABASE_SERVICE_ROLE_KEY ?? NEXT_PUBLIC_SUPABASE_ANON_KEY` — drop the fallback
once the secret is set everywhere.

**This is the part that carries real risk.** Service-role bypasses RLS, so the
database stops being a backstop and each route becomes solely responsible for
checking that the caller may touch the row it is about to touch. Routes that
already scope by active brand (see `drafts/[id]/approve`, `needs-edit`, and the
video DELETE path) are the pattern to follow; anything that doesn't scope needs to
before this lands. Consider extracting one shared server client rather than
repeating the constructor 38 times.

### 3. Leave the Python backend alone

No code change — it reads `SUPABASE_KEY` from the environment, so step 1 covers
it. Verify with a dry run of one cron after the key swap and before the SQL:

```bash
.venv/bin/python cron_research.py
```

### 4. Check for orphaned rows

Any row with a NULL `project_id`, or a project with a NULL `org_id`, becomes
invisible to every signed-in user once the policies are live (service-role still
sees it). Find them first:

```sql
SELECT 'projects' AS t, count(*) FROM projects WHERE org_id IS NULL
UNION ALL SELECT 'brand_profile',      count(*) FROM brand_profile      WHERE project_id IS NULL
UNION ALL SELECT 'generated_drafts',   count(*) FROM generated_drafts   WHERE project_id IS NULL
UNION ALL SELECT 'published_posts',    count(*) FROM published_posts    WHERE project_id IS NULL
UNION ALL SELECT 'research_candidates',count(*) FROM research_candidates WHERE project_id IS NULL
UNION ALL SELECT 'ideas',              count(*) FROM ideas              WHERE project_id IS NULL
UNION ALL SELECT 'photo_library',      count(*) FROM photo_library      WHERE project_id IS NULL
UNION ALL SELECT 'video_library',      count(*) FROM video_library      WHERE project_id IS NULL;
```

Backfill anything non-zero before proceeding. `setup_projects.sql` and
`setup_auth_orgs.sql` are both idempotent and will do most of it if re-run.

### 5. Confirm every user has a membership row

A signed-in user with no `org_members` row sees an empty app after this — not an
error, just nothing. Check:

```sql
SELECT u.email FROM auth.users u
LEFT JOIN org_members m ON m.user_id = u.id
WHERE m.id IS NULL;
```

Note the legacy shared-password gate in `middleware.ts` produces sessions with no
Supabase user at all. Those sessions can reach the app but will have no database
access once RLS is on. Plan the cutover to `/signin` alongside this.

### 6. Run the migration

Supabase SQL editor → paste `setup_rls.sql` → run. It is idempotent.

### 7. Verify

Both queries must come back empty:

```sql
-- every public table has RLS on
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;

-- anon holds no table grants
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public';
```

Then the real test — prove the hole is closed from outside the app:

```bash
curl "https://<project>.supabase.co/rest/v1/generated_drafts?select=*" \
  -H "apikey: <the public anon key>"
```

Before: rows. After: `[]` or a permission error. That request is exactly what a
stranger with your published key can run today.

### 8. Storage buckets

Not covered by `setup_rls.sql`. `draft-media` and any other bucket have separate
policies under `storage.objects` and need their own pass. Tracked in `BACKLOG.md`.

## Rollback

If the app breaks and you need it back immediately:

```sql
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
```

This reopens the database to the published anon key. It is an emergency lever, not
a resting state — if you pull it, treat the exposure as live until RLS is back on.
