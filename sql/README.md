# SQL migrations

Every schema change lives here as a flat, **idempotent** `setup_*.sql` file.
There is no migration runner — apply them by hand: open the
**Supabase SQL editor**, paste the file, run it. Re-running any file is safe.

> Recurring root cause of "X doesn't save" bugs in this app: a feature shipped
> but its SQL was never applied. If a page errors about a missing table or
> column, check this folder first.

## Index

| File | What it adds |
|---|---|
| `setup_projects.sql` | Multi-project support: `projects` table + `project_id` on every data table |
| `setup_social_urls.sql` | Profile-URL columns for Pinterest / Reddit / Threads on `brand_profile` |
| `setup_cadence.sql` | Per-channel posting cadence (posts/week) on `brand_profile` |
| `setup_generation_frequency.sql` | Auto-generation cadence (`daily` / `every_3_days` / `weekly`) + `last_generated_at` |
| `setup_topics_per_run.sql` | Per-project topics-per-run setting for the generation cron |
| `setup_qa_rules.sql` | User-editable QA rules table (per-channel `channels TEXT[]`) folded into QA checks |
| `setup_content_pillars.sql` | Narrative briefs + content pillars with Slack approval gate |
| `setup_format_pillar_columns.sql` | Persists strategy-chosen format/pillar through drafts → published posts |
| `setup_visual_brief.sql` | Per-draft visual direction (what to shoot when no photo matches) |
| `setup_photo_library.sql` | `photo_library` table (uploads + AI descriptions for matching) |
| `setup_video_library.sql` | `video_library` table (uploads + generated videos) |
| `setup_posted_at.sql` | Manual-posting tracking: `posted_at` + engagement logging |
| `setup_linked_projects.sql` | Two projects sharing the same real social channels (topic dedupe across them) |
| `setup_competitor_intel.sql` | Competitor list + synthesized intel reports |
| `setup_audit_reports.sql` | Self-audit reports (cadence, mix, engagement percentiles) |
| `setup_research_improvements.sql` | Research candidate status lifecycle (`new` / `rejected`) |
| `setup_llm_usage.sql` | Token/cost logging for every Anthropic call (powers cost reporting) |
| `setup_voice_examples.sql` | `voice_examples` column — real posts used as few-shot voice targets |
| `setup_learning.sql` | Learning loop: `feedback_events` table + `learned_lessons` on `brand_profile` |
| `setup_ideas.sql` | Idea Board: `ideas` table + `board` position column |
| `setup_inspiration.sql` | Inspiration clippings on the Idea Board: `kind`/`source_url`/`content`/`image_url` on `ideas` |
