-- FootyFriends Database Schema
-- This file contains the complete database schema for the FootyFriends app

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profile table: stores user profile information
create table if not exists public.profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  rating_base smallint not null default 3 check (rating_base between 1 and 5),
  created_at timestamptz not null default now()
);

-- Club table: stores club information (single club for MVP)
create table if not exists public.club (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organizer_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Match table: stores match information
create table if not exists public.match (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.club(id),
  kick_off timestamptz not null,
  signup_open_at timestamptz not null,
  spots smallint not null default 18 check (spots > 0),
  teams_count smallint not null default 3 check (teams_count > 0),
  status text not null default 'scheduled' check (status in ('scheduled','locked','completed','cancelled')),
  created_at timestamptz not null default now()
);

-- Signup table: stores player signups for matches
create table if not exists public.signup (
  id bigserial primary key,
  match_id uuid not null references public.match(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null check (state in ('confirmed','waitlist','cancelled')),
  queue_pos integer,
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);

-- Team table: stores team information for a match
create table if not exists public.team (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.match(id) on delete cascade,
  name text not null
);

-- Team assignment table: stores player assignments to teams
create table if not exists public.team_assignment (
  team_id uuid references public.team(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (team_id, user_id)
);

-- Rating snapshot table: stores historical ratings for each match
create table if not exists public.rating_snapshot (
  user_id uuid references auth.users(id),
  match_id uuid references public.match(id),
  rating_display smallint not null check (rating_display between 1 and 5),
  elo_before numeric,
  elo_after numeric,
  primary key (user_id, match_id)
);

-- Post match vote table: stores player ratings after a match
create table if not exists public.post_match_vote (
  match_id uuid references public.match(id),
  voter_id uuid references auth.users(id),
  target_id uuid references auth.users(id),
  stars smallint check (stars between 1 and 5),
  created_at timestamptz default now(),
  primary key (match_id, voter_id, target_id)
);

-- Audit log table: stores audit trail for actions
create table if not exists public.audit_log (
  id bigserial primary key,
  match_id uuid,
  user_id uuid,
  action text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for better query performance
create index if not exists idx_match_kick_off on public.match(kick_off);
create index if not exists idx_match_status on public.match(status);
create index if not exists idx_signup_match_id on public.signup(match_id);
create index if not exists idx_signup_user_id on public.signup(user_id);
create index if not exists idx_signup_state on public.signup(state);
create index if not exists idx_team_match_id on public.team(match_id);
create index if not exists idx_audit_log_match_id on public.audit_log(match_id);
create index if not exists idx_audit_log_created_at on public.audit_log(created_at);

-- Comments for documentation
comment on table public.profile is 'User profile information including display name and base rating';
comment on table public.club is 'Club information with organizer reference';
comment on table public.match is 'Match details including timing, capacity, and status';
comment on table public.signup is 'Player signups with FCFS state tracking';
comment on table public.team is 'Teams generated for each match';
comment on table public.team_assignment is 'Player assignments to teams';
comment on table public.rating_snapshot is 'Historical rating snapshots for each match';
comment on table public.post_match_vote is 'Post-match player ratings';
comment on table public.audit_log is 'Audit trail for important actions';
