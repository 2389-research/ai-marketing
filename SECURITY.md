# Security Policy

## Reporting a vulnerability

Please report security issues privately, not as a public issue.

**Preferred:** use GitHub's private vulnerability reporting — the **Security** tab
on this repository → **Report a vulnerability**. That opens a private advisory
visible only to the maintainers.

**Alternative:** email <dylan@2389.ai> with "SECURITY" in the subject.

Please include what you found, how to reproduce it, and what an attacker could do
with it. We will acknowledge within a few business days. This is a small team
maintaining an internal tool in the open, so please don't expect a same-day
response or a bounty.

Do not run automated scanners, brute-force tooling, or destructive tests against
any hosted instance you do not own.

## Known issues — read before deploying

This project is opened up as-is, and it has a significant unresolved weakness. It
is documented rather than hidden, but it is real.

### Row-level security is not enabled

Every table grants full `SELECT/INSERT/UPDATE/DELETE` to the Supabase `anon` role
with no row-level security behind it. Access control lives in
`frontend/middleware.ts`, which guards the Next.js app but not the Supabase REST
API.

Because `NEXT_PUBLIC_SUPABASE_ANON_KEY` is inlined into the browser bundle and the
`/signin`, `/signup` and `/join` routes are public, anyone who loads a deployed
instance can read that key and then query the database directly, bypassing the app.

**If you deploy this without applying `sql/setup_rls.sql`, treat your database as
public.** The migration and its ordering are in
[`sql/RLS_MIGRATION.md`](sql/RLS_MIGRATION.md).

Related, and also unresolved:

- Storage buckets (`draft-media` and others) have no policy pass at all.
- The legacy shared-password gate in `middleware.ts` is still the default door,
  alongside the newer Supabase auth flow.
- Server-side code authenticates as `anon` in 38 API routes and 34 Python modules
  where it should be using the service role.

Reports about any of the above are appreciated but already known — no need to file
them. Reports of anything *else* very much are.

## Supported versions

There are no releases. `main` is the only supported branch.
