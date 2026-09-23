# Contributing

Thanks for taking a look. This started as an internal tool at 2389 Research and
was opened up as-is, so expect some rough edges — `BACKLOG.md` is an honest list
of them and a good place to find something worth doing.

## Reporting bugs

Open an issue with:

- what you did, what happened, what you expected
- the relevant log output (`logs/`, or the `cron_wrap.py` output for scheduled runs)
- whether you had applied every file in `sql/`

That last one matters more than it should. There is no migration runner, so the
most common failure in this app is a feature whose SQL was never applied. If a
page errors about a missing table or column, check `sql/` first.

**Do not open a public issue for a security problem.** See
[`SECURITY.md`](SECURITY.md).

## Submitting changes

1. Fork and branch off `main`.
2. Make the change. Keep it focused — one concern per PR.
3. Run the tests (`.venv/bin/python -m pytest`) and, if you touched the frontend,
   `cd frontend && npm run build`.
4. Open a PR describing what changed and why. Link the issue if there is one.

CI runs pytest and a frontend build on every PR. Be aware that test coverage is
thin, so green CI is weak evidence — say in the PR how you actually verified the
change.

## Conventions

- **Python**: standard library and the existing dependencies; match the style of
  the file you're editing. Modules start with a docstring explaining what they do.
- **TypeScript**: the frontend is Next.js App Router with Tailwind. Server logic
  belongs in `app/api/*/route.ts`; components stay thin.
- **Comments describe the code as it is**, not how it changed. No "fixed" or
  "new" in names.
- **SQL**: every schema change is a new idempotent `sql/setup_*.sql` file, added
  to the table in `sql/README.md`. Never edit an already-applied file in a way
  that changes what re-running it does.
- **No mocks.** Tests run against real dependencies. If something can't be tested
  without a mock, that usually means the seam is in the wrong place.

## Working on the database layer

Anything touching auth, tenancy, or table grants should be read alongside
[`sql/RLS_MIGRATION.md`](sql/RLS_MIGRATION.md). The security model is mid-migration:
row-level security is written but not applied, and the app still authenticates as
`anon` in places where it should be using the service role. PRs that move that
migration forward are especially welcome — just be explicit about ordering, since
applying the pieces out of order takes the app down.

## What this project isn't looking for

- Large refactors that touch the whole tree without a discussed reason
- Swapping out Anthropic or Supabase for an abstraction layer
- Mock modes or fake data fixtures
