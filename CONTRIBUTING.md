# Contributing

Thanks for taking a look. This is an internal tool at 2389 Research developed in
the open, so expect rough edges. They are tracked rather than hidden.

## Where to start

Issues are labelled by priority and by area. Sort by priority first:

| Label | What it means |
|---|---|
| [`P0`](https://github.com/2389-research/ai-marketing/labels/P0) | Ship blocker |
| [`P1`](https://github.com/2389-research/ai-marketing/labels/P1) | Serious correctness or reliability bug |
| [`P2`](https://github.com/2389-research/ai-marketing/labels/P2) | Hygiene and debt — usually the most self-contained work |
| [`good first issue`](https://github.com/2389-research/ai-marketing/labels/good%20first%20issue) | Scoped small enough to land without much context |

Then by area: [`agents`](https://github.com/2389-research/ai-marketing/labels/agents)
(Python pipeline), [`frontend`](https://github.com/2389-research/ai-marketing/labels/frontend)
(Next.js app), [`security`](https://github.com/2389-research/ai-marketing/labels/security)
and [`tenancy`](https://github.com/2389-research/ai-marketing/labels/tenancy)
(isolation between customers), [`reliability`](https://github.com/2389-research/ai-marketing/labels/reliability)
(jobs and crons), [`tech-debt`](https://github.com/2389-research/ai-marketing/labels/tech-debt)
(testing, migrations, tooling).

**Check for a [`migration`](https://github.com/2389-research/ai-marketing/labels/migration)
label before you start.** The data layer is being moved off Supabase, so a fix
to code carrying that label may be landing in something about to be replaced.
Say so on the issue before opening a PR against it.

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

These fixes are ordered, and several only hold once the ones before them land —
so comment on the issue before starting rather than picking one off the list.
Anything carrying both `security` and `tenancy` is part of that sequence.

One specific trap: **do not enable row-level security as part of an unrelated
change.** Every Next.js API route and every Python module currently authenticates
to Supabase as `anon`, so turning RLS on before those move to the service-role
key takes the whole app down.

## What this project isn't looking for

- Large refactors that touch the whole tree without a discussed reason
- Swapping out Anthropic for an abstraction layer
- Mock modes or fake data fixtures
