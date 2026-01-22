-- Add DELETE policy for matches
-- Admins can delete any match
-- Club organizers can delete matches for their clubs

-- First, drop if exists to allow re-running
drop policy if exists "Admins can delete matches" on public.match;
drop policy if exists "Club organizers can delete matches" on public.match;

-- Admins can delete any match
create policy "Admins can delete matches"
  on public.match for delete
  using (
    exists (
      select 1 from public.profile
      where profile.user_id = auth.uid()
      and profile.is_admin = true
    )
  );

-- Club organizers can delete matches for their clubs
create policy "Club organizers can delete matches"
  on public.match for delete
  using (
    exists (
      select 1 from public.club
      where id = match.club_id
      and organizer_id = auth.uid()
    )
  );

-- Also add UPDATE policy for admins (for editing matches)
drop policy if exists "Admins can update matches" on public.match;

create policy "Admins can update matches"
  on public.match for update
  using (
    exists (
      select 1 from public.profile
      where profile.user_id = auth.uid()
      and profile.is_admin = true
    )
  );
