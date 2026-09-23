# AI Marketing Automation

An agent pipeline that researches what your audience is talking about, drafts
platform-native social content in your brand's voice, runs it past a QA agent,
and holds it for human approval before anything gets published.

It is a working internal tool, opened up — not a product. See
[Status and limitations](#status-and-limitations) before you rely on it.

> **⚠️ Security notice.** This project ships with row-level security disabled and
> blanket `anon` grants on every table. If you deploy it as-is, your database is
> readable and writable by anyone who loads the site. Read
> [`sql/RLS_MIGRATION.md`](sql/RLS_MIGRATION.md) first. This is the top item in
> [`BACKLOG.md`](BACKLOG.md).

## What it does

```
research → strategy → draft → QA → human approval → schedule → post → learn
```

- **Research** pulls candidate topics from RSS, Reddit, YouTube, Hacker News,
  Google Trends, and competitor activity, then scores them for brand relevance.
- **Strategy** maintains narrative briefs and content pillars so output stays on
  a theme instead of chasing whatever trended that morning.
- **Content** writes per-channel drafts (LinkedIn, X, Instagram, TikTok,
  YouTube, Threads, Reddit, Pinterest, email) against a brand voice spec.
- **QA** checks tone, brand safety, banned phrases, and user-defined rules, and
  blocks anything that fails.
- **Approval** happens in a Next.js dashboard or in Slack — nothing auto-posts.
- **Video** turns approved drafts into short-form clips via Remotion, with
  Whisper-generated captions and background music.
- **Learning** feeds approvals, edits, and rejections back into the brand
  profile so later drafts drift toward what you actually ship.

## Architecture

Two halves sharing one Supabase (Postgres) database:

| Piece | Stack | What it is |
|---|---|---|
| `agents/` | Python 3.11+ | The pipeline. One module per agent; each reads and writes Supabase directly. |
| `cron_*.py` | Python | Scheduled entry points — `research`, `generate`, `intel`, `learn`. Wrapped by `cron_wrap.py`, which exits non-zero so a failed phase actually alerts. |
| `cli_*.py`, `run.py` | Python | Manual, one-shot versions of the same work for local runs. |
| `frontend/` | Next.js 14, Tailwind | Dashboard: drafts, calendar, brand setup, research review, idea board, team management. |
| `frontend/remotion/` | Remotion | Video templates, rendered by a separate `render-server.mjs` process. |
| `slack_app.py` | slack-bolt | Socket-mode bot for the approval flow. |
| `sql/` | Flat SQL | Schema. No migration runner — files are idempotent and applied by hand. |

Deployment targets Fly.io as four process groups from one image (`web`,
`slackbot`, `cron`, `renderer`) — see `fly.toml`.

## Getting started

Requires Python 3.11+, Node 22+, and a Supabase project. `ffmpeg` is needed only
for the video pipeline.

```bash
# 1. Backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # fill in ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY

# 2. Schema — apply every file in sql/ via the Supabase SQL editor.
#    There is no runner. Start with setup_projects.sql, then the rest.
#    sql/README.md lists what each one adds.

# 3. Frontend
cd frontend
npm ci
cp .env.local.example .env.local
npm run dev                   # http://0.0.0.0:3001
```

Then open `/brand` to set up a brand profile — most of the pipeline reads from
it and will no-op without one.

To run a single pass of the pipeline without the UI:

```bash
.venv/bin/python run.py
```

### Scheduling

`deploy/crontab` is the production schedule (supercronic, inside the Fly `cron`
process group). Locally, the docstring at the top of each `cron_*.py` shows the
equivalent crontab line.

## Configuration

Everything is environment variables — see `.env.example` (backend) and
`frontend/.env.local.example` (frontend). The essentials:

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Drafting, QA, strategy, research scoring |
| `SUPABASE_URL` / `SUPABASE_KEY` | yes | See `sql/RLS_MIGRATION.md` on which key belongs here |
| `AUTH_TOKEN` | yes | Shared password for the login gate — the app is unreachable without it. Set the same value in both env files. See the collision warning in `.env.example`. |
| `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` / `SLACK_CHANNEL_ID` | no | Slack approval flow |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | no | Reddit research; RSS works without it |
| `YOUTUBE_API_KEY` / `NEWS_API_KEY` | no | Extra research sources |
| `REPLICATE_API_TOKEN` / `GROQ_API_KEY` | no | Music generation and Whisper captions |
| `OPENAI_API_KEY` | no | Image generation in the frontend |
| `RENDER_TOKEN` | no | Gates the Remotion render service; falls back to `AUTH_TOKEN` |
| `RESEND_API_KEY` / `RESEND_FROM` | no | Invitation emails; falls back to a shareable join link |
| `SCHEDULE_TIMEZONE` | no | Defaults to `America/Chicago`; must match `NEXT_PUBLIC_SCHEDULE_TIMEZONE` |

Brand voice lives in `config/brand_voice.py` as a default template; the company
name and most tuning are read from the `brand_profile` table at runtime and
edited on the `/brand` page.

## Status and limitations

Honest accounting of what you are getting:

- **Row-level security is not enabled.** See the notice above. This is the
  single biggest thing to fix before any real deployment.
- **Test coverage is thin** — two files in `tests/` against roughly 130 source
  modules. Passing CI means very little right now.
- **Schema is applied by hand.** No migration runner, no version tracking. The
  most common bug in this app is a feature shipped whose SQL was never run.
- **Single-tenant in practice.** The multi-tenant org model exists in the schema
  and UI, but the legacy shared-password gate in `frontend/middleware.ts` is
  still the default door and the cutover isn't finished.
- **Posting is mostly manual.** The pipeline drafts, schedules, and tracks, but
  most channels are marked posted by a human rather than published via API.
- **Opinionated about Anthropic and Supabase.** Neither is abstracted; swapping
  either means real work.

More detail and the current priority order in [`BACKLOG.md`](BACKLOG.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Security issues go to
[`SECURITY.md`](SECURITY.md) instead of the public issue tracker.

## License

MIT — see [`LICENSE`](LICENSE).

Bundled third-party material keeps its own terms: the fonts in `fonts/` ship
their SIL Open Font License files, `lib/last30days/` is
[mvanhorn/last30days-skill](https://github.com/mvanhorn/last30days-skill) (MIT),
and `lib/last30days/scripts/lib/vendor/bird-search/` carries its own MIT notice.
