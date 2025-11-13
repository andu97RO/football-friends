-- FootyFriends Row Level Security (RLS) Policies
-- This file contains all RLS policies for securing data access

-- Enable RLS on all tables
alter table public.profile enable row level security;
alter table public.club enable row level security;
alter table public.match enable row level security;
alter table public.signup enable row level security;
alter table public.team enable row level security;
alter table public.team_assignment enable row level security;
alter table public.rating_snapshot enable row level security;
alter table public.post_match_vote enable row level security;
alter table public.audit_log enable row level security;

-- Profile policies
-- Users can view their own profile
create policy "Users can view own profile"
  on public.profile for select
  using (auth.uid() = user_id);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profile for update
  using (auth.uid() = user_id);

-- Users can insert their own profile
create policy "Users can insert own profile"
  on public.profile for insert
  with check (auth.uid() = user_id);

-- Everyone can view all profiles (for displaying player names)
create policy "Anyone can view all profiles"
  on public.profile for select
  using (true);

-- Club policies
-- Everyone can view clubs
create policy "Anyone can view clubs"
  on public.club for select
  using (true);

-- Only organizers can create clubs
create policy "Authenticated users can create clubs"
  on public.club for insert
  with check (auth.uid() = organizer_id);

-- Only organizers can update their clubs
create policy "Organizers can update own clubs"
  on public.club for update
  using (auth.uid() = organizer_id);

-- Match policies
-- Everyone can view matches
create policy "Anyone can view matches"
  on public.match for select
  using (true);

-- Only club organizers can create matches
create policy "Club organizers can create matches"
  on public.match for insert
  with check (
    exists (
      select 1 from public.club
      where id = match.club_id
      and organizer_id = auth.uid()
    )
  );

-- Only club organizers can update matches
create policy "Club organizers can update matches"
  on public.match for update
  using (
    exists (
      select 1 from public.club
      where id = match.club_id
      and organizer_id = auth.uid()
    )
  );

-- Signup policies
-- Users can view their own signups
create policy "Users can view own signups"
  on public.signup for select
  using (auth.uid() = user_id);

-- Users can insert their own signups
create policy "Users can insert own signups"
  on public.signup for insert
  with check (auth.uid() = user_id);

-- Users can update their own signups
create policy "Users can update own signups"
  on public.signup for update
  using (auth.uid() = user_id);

-- Organizers can view all signups for their matches
create policy "Organizers can view all signups for their matches"
  on public.signup for select
  using (
    exists (
      select 1 from public.match m
      join public.club c on c.id = m.club_id
      where m.id = signup.match_id
      and c.organizer_id = auth.uid()
    )
  );

-- Team policies
-- Everyone can view teams
create policy "Anyone can view teams"
  on public.team for select
  using (true);

-- Only organizers can create teams
create policy "Organizers can create teams"
  on public.team for insert
  with check (
    exists (
      select 1 from public.match m
      join public.club c on c.id = m.club_id
      where m.id = team.match_id
      and c.organizer_id = auth.uid()
    )
  );

-- Team assignment policies
-- Everyone can view team assignments
create policy "Anyone can view team assignments"
  on public.team_assignment for select
  using (true);

-- Only organizers can create team assignments
create policy "Organizers can create team assignments"
  on public.team_assignment for insert
  with check (
    exists (
      select 1 from public.team t
      join public.match m on m.id = t.match_id
      join public.club c on c.id = m.club_id
      where t.id = team_assignment.team_id
      and c.organizer_id = auth.uid()
    )
  );

-- Rating snapshot policies
-- Everyone can view rating snapshots
create policy "Anyone can view rating snapshots"
  on public.rating_snapshot for select
  using (true);

-- Only system can insert rating snapshots (via service role in Edge Functions)
-- No insert policy for regular users

-- Post match vote policies
-- Users can view votes for matches they participated in
create policy "Users can view votes for their matches"
  on public.post_match_vote for select
  using (
    exists (
      select 1 from public.signup
      where signup.match_id = post_match_vote.match_id
      and signup.user_id = auth.uid()
      and signup.state = 'confirmed'
    )
  );

-- Users can insert votes for matches they participated in
create policy "Users can insert votes for their matches"
  on public.post_match_vote for insert
  with check (
    auth.uid() = voter_id
    and exists (
      select 1 from public.signup
      where signup.match_id = post_match_vote.match_id
      and signup.user_id = auth.uid()
      and signup.state = 'confirmed'
    )
  );

-- Audit log policies
-- Organizers can view audit logs for their matches
create policy "Organizers can view audit logs for their matches"
  on public.audit_log for select
  using (
    exists (
      select 1 from public.match m
      join public.club c on c.id = m.club_id
      where m.id = audit_log.match_id
      and c.organizer_id = auth.uid()
    )
  );

-- Only system can insert audit logs (via service role in Edge Functions)
-- No insert policy for regular users
