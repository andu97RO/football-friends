-- Fix match deletion: rating_snapshot and post_match_vote referenced match_id
-- without ON DELETE CASCADE (unlike signup/team), so deleting a locked match
-- with rating history would fail with a foreign key violation.
-- This brings them in line with signup.match_id / team.match_id, allowing a
-- single `delete from match where id = ...` to cascade cleanly.

alter table public.rating_snapshot
  drop constraint if exists rating_snapshot_match_id_fkey,
  add constraint rating_snapshot_match_id_fkey
    foreign key (match_id) references public.match(id) on delete cascade;

alter table public.post_match_vote
  drop constraint if exists post_match_vote_match_id_fkey,
  add constraint post_match_vote_match_id_fkey
    foreign key (match_id) references public.match(id) on delete cascade;

-- Allow admins/organizers to delete rating_snapshot rows directly if ever needed
-- (not required for match deletion now that cascade handles it, but matches
-- the pattern used for team/team_assignment in admin-policies.sql).
drop policy if exists "Organizers and admins can delete rating snapshots" on public.rating_snapshot;
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
