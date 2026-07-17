# syntax=docker/dockerfile:1

# ---- frontend deps ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

# ---- frontend build ----
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY --from=deps /app/frontend/node_modules ./node_modules
COPY frontend/ .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3.11 python3.11-venv ffmpeg curl ca-certificates \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 \
      libxkbcommon-dev libxfixes3 libxcomposite1 libxdamage1 \
      libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
    && rm -rf /var/lib/apt/lists/*

# Supercronic — runs a real crontab inside the "cron" process group
ARG SUPERCRONIC_VERSION=v0.2.29
RUN curl -fsSLo /usr/local/bin/supercronic \
      "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
    && chmod +x /usr/local/bin/supercronic

# Python backend (agents/, cron_*.py, cli_*.py, run.py, etc.)
COPY requirements.txt .
RUN python3.11 -m venv /app/.venv \
    && /app/.venv/bin/pip install --no-cache-dir -r requirements.txt

COPY agents/ agents/
COPY config/ config/
COPY lib/ lib/
COPY fonts/ fonts/
COPY music/ music/
COPY *.py ./
COPY deploy/crontab deploy/crontab

# Full (unpruned) frontend node_modules — the standalone build below only
# bundles what Next's tracer follows from route.ts imports, but Remotion
# also needs its own CLI + a separately-downloaded Chrome Headless Shell
# binary at runtime, so the render-template route gets a full install here
# rather than relying on standalone's pruned subset.
WORKDIR /app/frontend
COPY --from=deps /app/frontend/node_modules ./node_modules
COPY frontend/remotion ./remotion
RUN npx remotion browser ensure
WORKDIR /app

# Next.js standalone frontend (built above) — layered on top of the full
# node_modules install, not replacing it.
COPY --from=frontend-build /app/frontend/.next/standalone ./frontend
COPY --from=frontend-build /app/frontend/.next/static ./frontend/.next/static
COPY --from=frontend-build /app/frontend/public ./frontend/public

ENV BACKEND_PATH=/app
ENV BACKEND_PYTHON=/app/.venv/bin/python
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001
CMD ["node", "frontend/server.js"]
