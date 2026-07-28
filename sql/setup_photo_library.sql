-- Run this in your Supabase SQL editor

create table if not exists photo_library (
  id          uuid primary key default gen_random_uuid(),
  filename    text not null,
  storage_path text not null,
  public_url  text not null,
  description text,
  created_at  timestamptz default now()
);
