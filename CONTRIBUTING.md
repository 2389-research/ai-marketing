# Contributing

Thanks for taking a look. This is an internal tool at 2389 Research developed in
the open, so expect rough edges. They are tracked rather than hidden:
[issue #25](https://github.com/2389-research/ai-marketing/issues/25) is a
full codebase review with a recommended order of work, and it is the best place
to find something worth doing.

Note that a migration off Supabase to Firebase is underway
([epic #26](https://github.com/2389-research/ai-marketing/issues/26)). Check
whether a change you are planning lands in code that is about to move.

## Reporting bugs

Open an issue with:

- what you did, what happened, what you expected
- the relevant log output (`logs/`, or the `cron_wrap.py` output for scheduled runs)
- which files in `sql/` you had applied

That last one matters more than it should. There is no migration runner and no
record of what a given database has had run against it, so the most common
failure in this app is a feature whose SQL was never applied. If a page errors
about a missing table or column, check `sql/` first.

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

## Working on auth, tenancy, or the data layer

Read [issue #25](https://github.com/2389-research/ai-marketing/issues/25) first.
The tenancy boundary is known-open and the fixes are sequenced there for a
reason — several of them only hold once the ones before them land. Coordinate on
the issue before starting, rather than opening a PR against a piece that is
already being replaced by
[epic #26](https://github.com/2389-research/ai-marketing/issues/26).

Do not apply a schema change that enables row-level security without reading #1:
every API route and Python module currently authenticates as `anon`, so turning
RLS on ahead of that cutover takes the whole app down.

## What this project isn't looking for

- Large refactors that touch the whole tree without a discussed reason
- Swapping out Anthropic for an abstraction layer
- Mock modes or fake data fixtures
