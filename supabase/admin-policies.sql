-- Additional RLS policies for admin features
-- Run this after rls-policies.sql

-- Allow admins to update any profile (for rating management)
create policy "Admins can update any profile"
  on public.profile for update
  using (
    exists (
      select 1 from public.profile p
      where p.user_id = auth.uid()
      and p.is_admin = true
    )
  );

-- Allow organizers and admins to update team assignments (for manual team edits)
create policy "Organizers and admins can update team assignments"
  on public.team_assignment for update
  using (
    exists (
      select 1 from public.team t
      join public.match m on m.id = t.match_id
      join public.club c on c.id = m.club_id
      where t.id = team_assignment.team_id
      and c.organizer_id = auth.uid()
    )
    or exists (
      select 1 from public.profile p
      where p.user_id = auth.uid()
      and p.is_admin = true
    )
  );

-- Allow organizers and admins to delete teams (for regenerating teams)
create policy "Organizers and admins can delete teams"
  on public.team for delete
  using (
    exists (
      select 1 from public.match m
      join public.club c on c.id = m.club_id
      where m.id = team.match_id
      and c.organizer_id = auth.uid()
    )
    or exists (
      select 1 from public.profile p
      where p.user_id = auth.uid()
      and p.is_admin = true
    )
  );

-- Allow organizers and admins to delete team assignments (for regenerating teams)
create policy "Organizers and admins can delete team assignments"
  on public.team_assignment for delete
  using (
    exists (
      select 1 from public.team t
      join public.match m on m.id = t.match_id
      join public.club c on c.id = m.club_id
      where t.id = team_assignment.team_id
      and c.organizer_id = auth.uid()
    )
    or exists (
      select 1 from public.profile p
      where p.user_id = auth.uid()
      and p.is_admin = true
    )
  );

-- Allow system to insert audit logs (already covered by service role, but added for completeness)
-- Admins can also view all audit logs
create policy "Admins can view all audit logs"
  on public.audit_log for select
  using (
    exists (
      select 1 from public.profile p
      where p.user_id = auth.uid()
      and p.is_admin = true
    )
  );
