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
-- Everyone can view all profiles (for displaying player names)
create policy "Anyone can view all profiles"
  on public.profile for select
  using (true);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profile for update
  using (auth.uid() = user_id);

-- Users can insert their own profile
create policy "Users can insert own profile"
  on public.profile for insert
  with check (auth.uid() = user_id);

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

-- Admins can create matches for any club
create policy "Admins can create matches"
  on public.match for insert
  with check (
    exists (
      select 1 from public.profile
      where profile.user_id = auth.uid()
      and profile.is_admin = true
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
-- Anyone can view all signups (needed to display match player lists)
create policy "Anyone can view all signups"
  on public.signup for select
  using (true);

-- Users can insert their own signups
-- NOTE: direct client writes to `signup` are intentionally disallowed.
-- All signup state transitions should go through server-side logic (Edge Functions / atomic RPCs).

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

-- Organizers and admins can delete rating snapshots
create policy "Organizers and admins can delete rating snapshots"
  on public.rating_snapshot for delete
  using (
    exists (
      select 1 from public.match m
      join public.club c on c.id = m.club_id
      where m.id = rating_snapshot.match_id
      and c.organizer_id = auth.uid()
    )
    or exists (
      select 1 from public.profile p
      where p.user_id = auth.uid()
      and p.is_admin = true
    )
  );

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

-- Atomic admin rating update (bypasses audit_log INSERT RLS safely)
create or replace function public.update_player_rating_atomic(
  p_user_id uuid,
  p_new_rating smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  select is_admin into v_is_admin
  from public.profile
  where user_id = auth.uid();

  if not coalesce(v_is_admin, false) then
    raise exception 'Only admins can update player ratings';
  end if;

  if p_new_rating < 1 or p_new_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  update public.profile
  set rating_base = p_new_rating
  where user_id = p_user_id;

  if not found then
    raise exception 'Player not found';
  end if;

  insert into public.audit_log(user_id, action, meta)
  values (
    auth.uid(),
    'update_player_rating',
    jsonb_build_object('target_user_id', p_user_id, 'new_rating', p_new_rating)
  );
end;
$$;

revoke all on function public.update_player_rating_atomic(uuid, smallint) from public;
grant execute on function public.update_player_rating_atomic(uuid, smallint) to authenticated;
