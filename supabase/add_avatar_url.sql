-- Add avatar_url column to profile table
alter table public.profile
add column if not exists avatar_url text;
