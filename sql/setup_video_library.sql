-- Run this in your Supabase SQL editor

create table if not exists video_library (
  id           uuid primary key default gen_random_uuid(),
  filename     text not null,
  storage_path text not null,
  public_url   text not null,
  duration_seconds float,
  created_at   timestamptz default now()
);
