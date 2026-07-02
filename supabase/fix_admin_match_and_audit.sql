-- Fixes two admin-flow gaps:
--
-- 1. admin.tsx's "update player rating" updates profile.rating_base from the
--    client (allowed via admin-policies.sql), then tries to insert into
--    audit_log directly from the client. audit_log has no INSERT policy for
--    regular users (rls-policies.sql: "No insert policy for regular users"),
--    so that insert always fails and the admin sees a false error even
--    though the rating update succeeded. Moving both into one
--    SECURITY DEFINER RPC (matching the pattern used by join_match_atomic /
--    cancel_signup_atomic) makes the whole operation atomic and bypasses the
--    audit_log RLS gap safely, since the function itself enforces is_admin.
--
-- 2. admin.tsx's "create match" inserts into match using whatever club is
--    returned first from the club table. The match INSERT policy only
--    allows club.organizer_id = auth.uid(), so any admin who isn't literally
--    that club's organizer gets blocked by RLS despite is_admin = true.
--    This adds an admin-bypass INSERT policy on match, mirroring the
--    existing admin-bypass UPDATE/DELETE policies in add_match_delete_policy.sql.

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

-- Allow admins to create matches for any club, not just clubs they organize.
drop policy if exists "Admins can create matches" on public.match;
create policy "Admins can create matches"
  on public.match for insert
  with check (
    exists (
      select 1 from public.profile
      where profile.user_id = auth.uid()
      and profile.is_admin = true
    )
  );
