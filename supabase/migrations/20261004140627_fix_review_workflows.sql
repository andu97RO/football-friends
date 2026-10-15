-- Fix the private review workflow defects without rewriting the deployed migration.
create or replace function private.release_upcoming(u uuid, g uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r record; game public.match%rowtype;
begin
  for r in select s.match_id from public.signup s join public.match mt on mt.id = s.match_id
           where s.user_id = u and s.state <> 'cancelled' and mt.status in ('scheduled', 'locked') and mt.kick_off > now()
             and (g is null or mt.club_id = g) order by s.match_id loop
    select * into game from public.match where id = r.match_id for update;
    if game.kick_off <= now() or game.status not in ('scheduled', 'locked') then continue; end if;
    if game.status = 'scheduled' then
      perform private.release_signup(r.match_id, u);
    else
      -- A locked match cannot accept new players: remove the departing player
      -- from its squad without promoting an undrafted waitlisted player.
      update public.signup set state = 'cancelled', queue_pos = null where match_id = r.match_id and user_id = u;
      delete from public.team_assignment ta using public.team t where ta.team_id = t.id and t.match_id = r.match_id and ta.user_id = u;
      delete from public.rating_snapshot where match_id = r.match_id and user_id = u;
      with q as (select id, row_number() over (order by queue_pos, created_at, id)::integer as pos
                 from public.signup where match_id = r.match_id and state = 'waitlist')
      update public.signup s set queue_pos = q.pos from q where s.id = q.id;
    end if;
  end loop;
end $$;

create function private.guard_drawn_format() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'scheduled' and (new.teams_count <> old.teams_count or new.spots <> old.spots) then
    raise exception 'The format is fixed once teams have been drawn';
  end if;
  return new;
end $$;
create trigger guard_drawn_format before update on public.match for each row execute function private.guard_drawn_format();

create function private.cleanup_account(me uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c record; heir uuid;
begin
  if me is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform private.release_upcoming(me, null);
  for c in select id from public.club where organizer_id = me
           or id in (select club_id from public.group_membership where user_id = me and role = 'owner') for update loop
    select user_id into heir from public.group_membership
      where club_id = c.id and user_id <> me and status = 'approved' order by (role = 'owner') desc, (role = 'admin') desc, created_at limit 1;
    if heir is null then
      delete from public.match where club_id = c.id;
      delete from public.group_membership where club_id = c.id;
      update public.audit_log set club_id = null where club_id = c.id;
      delete from public.club where id = c.id;
    else
      update public.group_membership set role = 'member' where club_id = c.id and user_id = me;
      update public.group_membership set role = 'owner' where club_id = c.id and user_id = heir;
      update public.club set organizer_id = heir where id = c.id;
    end if;
  end loop;
  delete from public.group_membership where user_id = me;
  delete from public.post_match_vote where voter_id = me or target_id = me;
  delete from public.rating_snapshot where user_id = me;
  insert into public.audit_log(user_id, action) values (me, 'account_deleted');
end $$;


revoke all on function private.cleanup_account(uuid) from public, anon, authenticated;
create function private.cleanup_deleted_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cleanup_account(old.id);
  return old;
end $$;
revoke all on function private.cleanup_deleted_auth_user() from public, anon, authenticated;
create trigger cleanup_deleted_auth_user before delete on auth.users for each row execute function private.cleanup_deleted_auth_user();
-- Old clients cannot destroy group data separately from deletion of the auth row.
revoke all on function public.delete_account_data() from public, anon, authenticated;
revoke all on function private.delete_account_data() from public, anon, authenticated;

-- Storage bytes must be removed via the Storage API, never by deleting metadata.
-- Support both current owner_id and legacy owner metadata.
create function public.account_storage_objects(u uuid) returns table(bucket_id text, name text)
language sql security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where coalesce(to_jsonb(o)->>'owner_id', to_jsonb(o)->>'owner') = u::text
     or (o.bucket_id = 'avatars' and split_part(o.name, '/', 1) = u::text)
  order by o.bucket_id, o.name limit 500;
$$;
revoke all on function public.account_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.account_storage_objects(uuid) to service_role;

-- Only service-role delivery can read or acknowledge this outbox.
create table public.team_notification_outbox (
  match_id uuid primary key references public.match(id) on delete cascade,
  kick_off timestamptz not null,
  user_ids uuid[] not null,
  created_at timestamptz not null default now(),
  claim_id uuid,
  claimed_until timestamptz
);
alter table public.team_notification_outbox enable row level security;
revoke all on public.team_notification_outbox from public, anon, authenticated;
grant select, update, delete on public.team_notification_outbox to service_role;

create function public.claim_team_notifications() returns setof public.team_notification_outbox
language sql security definer set search_path = '' as $$
  update public.team_notification_outbox o set claim_id = gen_random_uuid(), claimed_until = now() + interval '5 minutes'
  where o.match_id in (
    select q.match_id from public.team_notification_outbox q
    where q.claimed_until is null or q.claimed_until < now()
    order by q.created_at, q.match_id limit 20 for update skip locked
  ) returning o.*;
$$;
revoke all on function public.claim_team_notifications() from public, anon, authenticated;
grant execute on function public.claim_team_notifications() to service_role;

create or replace function private.auto_lock() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select mt.id, mt.club_id from public.match mt
           where mt.status = 'scheduled' and mt.kick_off - interval '60 minutes' <= now() and mt.kick_off > now() - interval '1 day'
             and exists (select 1 from public.signup s where s.match_id = mt.id and s.state = 'confirmed')
           for update skip locked loop
    begin
      perform private.generate_teams(r.id, false);
      insert into public.team_notification_outbox(match_id, kick_off, user_ids)
      select mt.id, mt.kick_off, array(select s.user_id from public.signup s where s.match_id = mt.id and s.state = 'confirmed')
      from public.match mt where mt.id = r.id on conflict (match_id) do nothing;
      insert into public.audit_log(club_id, match_id, action) values (r.club_id, r.id, 'match_auto_generate');
    exception when others then
      null;
    end;
  end loop;
end $$;
