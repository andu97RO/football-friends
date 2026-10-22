-- Owners can rename a group, edit its description and delete it.
-- Deleting removes its matches (signups, teams, chat and votes cascade) and memberships;
-- the audit trail keeps the deletion with club_id null, like delete_account_data().
create or replace function private.group_action(action text, g uuid default null, target uuid default null, value text default null, description text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); caller_role text; target_member public.group_membership%rowtype; group_row public.club%rowtype;
begin
  if actor is null or not exists (select 1 from auth.users where id = actor and email_confirmed_at is not null) then raise exception 'Verified account required' using errcode = '42501'; end if;
  perform private.initialize_profile();
  if action = 'create' then
    if length(trim(value)) not between 1 and 80 or length(description) > 500 then raise exception 'Invalid group name or description'; end if;
    insert into public.club(name, description, organizer_id) values (trim(value), description, actor) returning id into g;
    insert into public.group_membership(club_id, user_id, role, status, rating) select g, actor, 'owner', 'approved', rating_base from public.profile where user_id = actor;
  elsif action = 'join_code' then
    select id into g from public.club where invite_code = upper(trim(value)) for update;
    if g is null then raise exception 'Invite code not found'; end if;
    insert into public.group_membership(club_id, user_id, status, rating) select g, actor, 'approved', rating_base from public.profile where user_id = actor
    on conflict (club_id, user_id) do update set status = 'approved' where group_membership.status <> 'approved';
  else
    -- Serialize administrative decisions within this group; clients cannot change the owner.
    select * into group_row from public.club where id = g for update;
    if not found then raise exception 'Group not found'; end if;
    caller_role := private.group_role(g);
    if action = 'request' then
      if not group_row.listed and not exists (select 1 from public.group_membership where club_id = g and user_id = actor) then
        raise exception 'This group is invite only'; end if;
      insert into public.group_membership(club_id, user_id, rating) select g, actor, rating_base from public.profile where user_id = actor
      on conflict (club_id, user_id) do update set status = 'pending' where group_membership.status = 'rejected';
    elsif action = 'withdraw' then
      delete from public.group_membership where club_id = g and user_id = actor and status = 'pending';
      if not found then raise exception 'No pending request'; end if;
    elsif action = 'leave' then
      if caller_role is null then raise exception 'Not a member'; end if;
      if caller_role = 'owner' then raise exception 'The owner cannot leave the group'; end if;
      perform private.release_upcoming(actor, g);
      delete from public.group_membership where club_id = g and user_id = actor;
    elsif action in ('update', 'delete') then
      if caller_role is distinct from 'owner' then raise exception 'Only the group owner can do this' using errcode = '42501'; end if;
      if action = 'update' then
        if length(trim(value)) not between 1 and 80 or length(coalesce(description, '')) > 500 then raise exception 'Invalid group name or description'; end if;
        update public.club set name = trim(value), description = trim(coalesce(description, '')) where id = g;
      else
        delete from public.match where club_id = g;
        delete from public.group_membership where club_id = g;
        update public.audit_log set club_id = null where club_id = g;
        delete from public.club where id = g;
        insert into public.audit_log(user_id, action, meta) values (actor, 'group_delete', jsonb_build_object('club_id', g, 'name', group_row.name));
        return g;
      end if;
    else
      if caller_role is null or caller_role not in ('owner', 'admin') then raise exception 'Group admin required' using errcode = '42501'; end if;
      if action = 'listed' then
        if value not in ('true', 'false') then raise exception 'Invalid value'; end if;
        update public.club set listed = value::boolean where id = g;
      elsif action = 'reset_code' then
        update public.club set invite_code = upper(substr(md5(gen_random_uuid()::text), 1, 8)) where id = g;
      else
        select * into target_member from public.group_membership where club_id = g and user_id = target for update;
        if not found then raise exception 'Membership not found'; end if;
        if action = 'review' then
          if target_member.status <> 'pending' or value not in ('approved', 'rejected') then raise exception 'Invalid request decision'; end if;
          update public.group_membership set status = value where club_id = g and user_id = target;
        elsif action = 'role' then
          if caller_role <> 'owner' or target_member.role = 'owner' or target_member.status <> 'approved' or value not in ('admin', 'member') then
            raise exception 'Owner required; only approved members can change role' using errcode = '42501'; end if;
          update public.group_membership set role = value where club_id = g and user_id = target;
        elsif action = 'rating' then
          if target_member.status <> 'approved' or value not in ('0', '1', '2', '3', '4', '5') then raise exception 'Invalid rating'; end if;
          update public.group_membership set rating = value::smallint where club_id = g and user_id = target;
        elsif action = 'remove' then
          if target_member.role = 'owner' or (target_member.role = 'admin' and caller_role <> 'owner') or target = actor then
            raise exception 'You cannot remove this member' using errcode = '42501'; end if;
          perform private.release_upcoming(target, g);
          delete from public.group_membership where club_id = g and user_id = target;
        else raise exception 'Unknown action'; end if;
      end if;
    end if;
  end if;
  insert into public.audit_log(club_id, user_id, action, meta) values (g, actor, 'group_' || action, jsonb_build_object('target', target, 'value', case when action = 'join_code' then null else value end));
  return g;
end $$;
