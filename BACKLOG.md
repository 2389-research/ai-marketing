# Backlog

Known gaps, in rough priority order. This is the honest version — the same list
the maintainers work from, not a marketing roadmap.

## Security

- [ ] **Apply row-level security.** `sql/setup_rls.sql` is written but not applied.
      Until it is, the database is readable and writable by anyone with the
      published anon key. Ordering and blast radius are in
      [`sql/RLS_MIGRATION.md`](sql/RLS_MIGRATION.md) — this is the top item and
      everything else in this section depends on it.
- [ ] **Move server-side code off the anon key.** 38 Next.js API routes and the
      Python backend authenticate as `anon`. They should use the service role.
      Each route builds its own client inline; extract one shared server client
      while doing it.
- [ ] **Storage bucket policies.** `draft-media` and any other bucket have had no
      policy pass. `setup_rls.sql` deliberately does not touch `storage.objects`.
- [ ] **Finish the auth cutover.** The legacy shared-password gate in
      `frontend/middleware.ts` is still the default door alongside Supabase auth.
      Sessions from the legacy gate have no Supabase user, so they will have no
      database access once RLS is on.
- [ ] **Object-level authorization sweep.** Some routes scope by active brand
      (draft approve / needs-edit, video delete); the rest have not been audited.
      This matters more once service-role removes the database as a backstop.

## Correctness and reliability

- [ ] **No migration runner.** `sql/` is applied by hand with no version tracking,
      and the most common bug in this app is a shipped feature whose SQL was never
      run. Either adopt a runner or add a startup check that verifies the schema.
- [ ] **Backfill orphaned rows.** Rows with a NULL `project_id`, and projects with
      a NULL `org_id`, become invisible once RLS lands. Queries to find them are in
      `sql/RLS_MIGRATION.md`.
- [ ] **Multi-tenancy is incomplete.** The org model exists in schema and UI, but
      the app behaves as single-tenant in practice.

## Testing

- [ ] **Coverage is two files against ~130 modules.** `tests/test_qa_agent.py` and
      `tests/eval_content_agent.py` cover pure helpers only. CI passing is weak
      evidence that anything works.
- [ ] **No frontend tests at all.** CI builds the frontend; it does not exercise it.
- [ ] **No integration test for the pipeline.** research → draft → QA → approve has
      never been tested end to end in CI.

## Developer experience

- [ ] **No `pyproject.toml`.** Dependencies are an unpinned `requirements.txt`, so
      builds are not reproducible. No linter or formatter is configured.
- [ ] **Import-time side effects.** Several `agents/` modules construct a Supabase
      client at module import, which is why tests need placeholder env vars set
      just to collect.
- [ ] **Setup is manual.** Getting to a running instance means a venv, an npm
      install, a Supabase project, and pasting ~23 SQL files by hand in the right
      order.

## Product

- [ ] **Posting is mostly manual.** The pipeline drafts, schedules, and tracks, but
      most channels are marked posted by a human rather than published via API.
- [ ] **Anthropic and Supabase are not abstracted.** Swapping either is real work.
      Not necessarily worth fixing — noted so nobody is surprised.
- [ ] **`music/` ships one track with no stated provenance.** `upbeat.mp3` predates
      this repo going public and its license is unverified. Replace it with a
      known royalty-free track or drop it.
