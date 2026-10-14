-- Redesign review (Figma, 30 Sep 2026): match logistics, invite links, private
-- ratings, results, notification preferences, onboarding and account deletion.

-- M10 M13 M20 D3: venue, pitch fee and weekly repeat belong to the match.
alter table public.match
  add column venue_name text not null default '' check (length(venue_name) <= 120),
  add column venue_url text not null default '' check (length(venue_url) <= 500),
  add column fee_amount numeric(8,2) not null default 0 check (fee_amount between 0 and 10000),
  add column fee_currency text not null default 'RON' check (fee_currency ~ '^[A-Z]{3}$'),
  add column payment_note text not null default '' check (length(payment_note) <= 300),
  add column repeat_weekly boolean not null default false,
  add column next_match_id uuid references public.match(id) on delete set null;

-- M13 M6: who paid and who showed up.
alter table public.signup
  add column paid boolean not null default false,
  add column attended boolean;
-- M6: final score per team.
alter table public.team add column score smallint check (score between 0 and 99);

-- M6: Man of the Match, one vote per player per match. Individual votes stay private.
create table public.motm_vote (
  match_id uuid not null references public.match(id) on delete cascade,
  voter_id uuid not null references public.profile(user_id) on delete cascade,
  target_id uuid not null references public.profile(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, voter_id),
  check (voter_id <> target_id)
);
alter table public.motm_vote enable row level security;
revoke all on public.motm_vote from anon, authenticated;
grant select on public.motm_vote to authenticated;
create policy motm_own on public.motm_vote for select to authenticated using (voter_id = (select auth.uid()));

-- M8: groups are joined by invite code; only listed groups appear in search.
alter table public.club
  add column invite_code text not null default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  add column listed boolean not null default false;
create unique index club_invite_code on public.club(invite_code);
drop policy if exists directory on public.club;
revoke select(id, name, description) on public.club from anon;
grant select(listed) on public.club to authenticated;
create policy club_read on public.club for select to authenticated using (
  listed or private.group_role(id) is not null or exists (
    select 1 from public.group_membership gm where gm.club_id = club.id and gm.user_id = (select auth.uid())));

-- P3 A3: notification preferences, language for pushes, and first-run onboarding.
alter table public.profile
  add column notify_waitlist boolean not null default true,
  add column notify_teams boolean not null default true,
  add column notify_chat boolean not null default true,
  add column notify_matches boolean not null default true,
  add column locale text not null default 'en' check (locale in ('en', 'ro')),
  add column onboarded boolean not null default true;
alter table public.profile alter column onboarded set default false;
grant select(notify_waitlist, notify_teams, notify_chat, notify_matches, locale, onboarded) on public.profile to authenticated;
grant update(notify_waitlist, notify_teams, notify_chat, notify_matches, locale) on public.profile to authenticated;

-- M17: individual ratings are for admins (and the player themselves) only.
revoke select on public.group_membership from authenticated;
grant select(club_id, user_id, role, status, created_at) on public.group_membership to authenticated;
drop policy snapshot_read on public.rating_snapshot;
create policy snapshot_read on public.rating_snapshot for select to authenticated using (
  user_id = (select auth.uid()) or private.match_admin(match_id));

-- Frees a player's place and promotes the first waitlisted group member.
-- Callers must hold the match row lock.
create function private.release_signup(m uuid, u uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare old_signup public.signup%rowtype; promoted uuid; club uuid;
begin
  select * into old_signup from public.signup where match_id = m and user_id = u;
  if old_signup.id is null or old_signup.state = 'cancelled' then return null; end if;
  select club_id into club from public.match where id = m;
  update public.signup set state = 'cancelled', queue_pos = null where id = old_signup.id;
  if old_signup.state = 'confirmed' then
    select s.user_id into promoted from public.signup s
      join public.group_membership gm on gm.user_id = s.user_id and gm.club_id = club and gm.status = 'approved'
      where s.match_id = m and s.state = 'waitlist' order by s.queue_pos, s.created_at, s.id limit 1;
    if promoted is not null then
      update public.signup set state = 'confirmed', queue_pos = null where match_id = m and user_id = promoted;
    end if;
  end if;
  with q as (select id, row_number() over (order by queue_pos, created_at, id)::integer as pos
             from public.signup where match_id = m and state = 'waitlist')
  update public.signup s set queue_pos = q.pos from q where s.id = q.id;
  return promoted;
end $$;

-- Releases every upcoming place a player holds in one group (or all groups).
create function private.release_upcoming(u uuid, g uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select s.match_id from public.signup s join public.match mt on mt.id = s.match_id
           where s.user_id = u and s.state <> 'cancelled' and mt.status = 'scheduled' and mt.kick_off > now()
             and (g is null or mt.club_id = g) loop
    perform 1 from public.match where id = r.match_id for update;
    perform private.release_signup(r.match_id, u);
  end loop;
end $$;

-- Serpentine draft by rating; `shuffle` reorders players with equal ratings (re-generate).
-- Callers must hold the match row lock.
create function private.generate_teams(m uuid, shuffle boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare game public.match%rowtype; n integer; team_ids uuid[] := '{}'; tid uuid; p record; idx integer := 0; bucket integer;
begin
  select * into game from public.match where id = m;
  select count(*) into n from public.signup where match_id = m and state = 'confirmed';
  if n = 0 then raise exception 'No confirmed signups'; end if;
  delete from public.team where match_id = m;
  delete from public.rating_snapshot where match_id = m;
  for i in 1..game.teams_count loop
    insert into public.team(match_id, name) values (m, 'Team ' || chr(64 + i)) returning id into tid;
    team_ids := array_append(team_ids, tid);
  end loop;
  for p in select s.user_id, gm.rating from public.signup s
           join public.group_membership gm on gm.club_id = game.club_id and gm.user_id = s.user_id and gm.status = 'approved'
           where s.match_id = m and s.state = 'confirmed'
           order by gm.rating desc, case when shuffle then random() else 0 end, s.created_at, s.id loop
    bucket := case when (idx / game.teams_count) % 2 = 0 then idx % game.teams_count + 1 else game.teams_count - idx % game.teams_count end;
    insert into public.team_assignment(team_id, user_id) values (team_ids[bucket], p.user_id);
    insert into public.rating_snapshot(match_id, user_id, rating_display) values (m, p.user_id, p.rating);
    idx := idx + 1;
  end loop;
  if idx <> n then raise exception 'Every participant must be an approved group member'; end if;
  update public.match set status = 'locked' where id = m;
  return n;
end $$;

-- Every match transition shares the same row lock, including team generation.
create or replace function private.match_action(action text, m uuid, player uuid default null, source_team uuid default null, destination_team uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); game public.match%rowtype; old_signup public.signup%rowtype; n integer; pos integer; new_state text;
  promoted uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into game from public.match where id = m for update;
  if not found or not coalesce(private.match_member(m), false) then raise exception 'Group membership required' using errcode = '42501'; end if;
  if action in ('generate', 'regenerate', 'move') and not coalesce(private.match_admin(m), false) then raise exception 'Group admin required' using errcode = '42501'; end if;
  if action in ('join', 'cancel') then
    if game.status <> 'scheduled' or now() >= game.kick_off then raise exception 'Match is closed'; end if;
    select * into old_signup from public.signup where match_id = m and user_id = actor;
    if action = 'join' then
      if now() < game.signup_open_at then raise exception 'Signup not open yet'; end if;
      if old_signup.id is not null and old_signup.state <> 'cancelled' then raise exception 'Already signed up'; end if;
      select count(*) into n from public.signup where match_id = m and state = 'confirmed';
      new_state := case when n < game.spots then 'confirmed' else 'waitlist' end;
      if new_state = 'waitlist' then select coalesce(max(queue_pos), 0) + 1 into pos from public.signup where match_id = m and state = 'waitlist'; end if;
      insert into public.signup(match_id, user_id, state, queue_pos) values (m, actor, new_state, pos)
      on conflict (match_id, user_id) do update set state = excluded.state, queue_pos = excluded.queue_pos, created_at = now(), paid = false, attended = null;
    else
      if old_signup.id is null or old_signup.state = 'cancelled' then raise exception 'No active signup'; end if;
      promoted := private.release_signup(m, actor);
    end if;
  elsif action in ('generate', 'regenerate') then
    if action = 'generate' and game.status <> 'scheduled' then raise exception 'Match already locked or closed'; end if;
    if action = 'regenerate' and (game.status <> 'locked' or now() >= game.kick_off) then raise exception 'Teams can only be re-generated before kick-off'; end if;
    perform private.generate_teams(m, action = 'regenerate');
  elsif action = 'move' then
    if game.status <> 'locked' or source_team = destination_team or source_team is null or destination_team is null then raise exception 'Invalid team move'; end if;
    if (select count(*) from public.team where match_id = m and id in (source_team, destination_team)) <> 2 or
       not exists (select 1 from public.signup where match_id = m and user_id = player and state = 'confirmed') or
       not exists (select 1 from public.group_membership where club_id = game.club_id and user_id = player and status = 'approved') then
      raise exception 'Teams and player must belong to this match';
    end if;
    update public.team_assignment set team_id = destination_team where team_id = source_team and user_id = player;
    if not found then raise exception 'Player is not in source team'; end if;
  else raise exception 'Unknown action'; end if;
  insert into public.audit_log(club_id, match_id, user_id, action, meta)
  values (game.club_id, m, actor, 'match_' || action, jsonb_build_object('player', player, 'promoted', promoted));
  return jsonb_build_object('success', true, 'state', new_state, 'position', pos, 'promoted', promoted);
end $$;

-- T4: swapping keeps team sizes equal.
create function private.swap_players(m uuid, a uuid, b uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare game public.match%rowtype; team_a uuid; team_b uuid;
begin
  select * into game from public.match where id = m for update;
  if not found or not coalesce(private.match_admin(m), false) then raise exception 'Group admin required' using errcode = '42501'; end if;
  if game.status <> 'locked' then raise exception 'Teams can only be edited while locked'; end if;
  select ta.team_id into team_a from public.team_assignment ta join public.team t on t.id = ta.team_id where t.match_id = m and ta.user_id = a;
  select ta.team_id into team_b from public.team_assignment ta join public.team t on t.id = ta.team_id where t.match_id = m and ta.user_id = b;
  if team_a is null or team_b is null or team_a = team_b then raise exception 'Pick two players from different teams'; end if;
  update public.team_assignment set team_id = team_b where team_id = team_a and user_id = a;
  update public.team_assignment set team_id = team_a where team_id = team_b and user_id = b;
  insert into public.audit_log(club_id, match_id, user_id, action, meta)
  values (game.club_id, m, auth.uid(), 'match_swap', jsonb_build_object('a', a, 'b', b));
end $$;

-- M13: organisers mark who has paid the pitch fee.
create function private.set_paid(m uuid, player uuid, is_paid boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(private.match_admin(m), false) then raise exception 'Group admin required' using errcode = '42501'; end if;
  update public.signup set paid = is_paid where match_id = m and user_id = player and state = 'confirmed';
  if not found then raise exception 'Player is not confirmed for this match'; end if;
end $$;

-- M6: score per team (keyed by team id) and who did not show up. Can be corrected later.
create function private.record_result(m uuid, scores jsonb, absent uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare game public.match%rowtype;
begin
  select * into game from public.match where id = m for update;
  if not found or not coalesce(private.match_admin(m), false) then raise exception 'Group admin required' using errcode = '42501'; end if;
  if game.status = 'cancelled' or now() < game.kick_off then raise exception 'Results can be recorded after kick-off'; end if;
  update public.team t set score = case when scores ? t.id::text then (scores ->> t.id::text)::smallint end where t.match_id = m;
  update public.signup set attended = not (user_id = any(coalesce(absent, '{}'))) where match_id = m and state = 'confirmed';
  update public.match set status = 'completed' where id = m;
  insert into public.audit_log(club_id, match_id, user_id, action, meta)
  values (game.club_id, m, auth.uid(), 'match_result', jsonb_build_object('scores', scores, 'absent', absent));
end $$;

-- M6: players who were there vote once for someone else who was there.
create function private.vote_motm(m uuid, target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare game public.match%rowtype; me uuid := auth.uid();
begin
  select * into game from public.match where id = m;
  if not found or not coalesce(private.match_member(m), false) then raise exception 'Group membership required' using errcode = '42501'; end if;
  if now() < game.kick_off or game.kick_off < now() - interval '14 days' or game.status = 'cancelled' then raise exception 'Voting is open for two weeks after kick-off'; end if;
  if me = target then raise exception 'Vote for a teammate, not yourself'; end if;
  if not exists (select 1 from public.signup where match_id = m and user_id = me and state = 'confirmed' and attended is distinct from false) then
    raise exception 'Only players who played can vote'; end if;
  if not exists (select 1 from public.signup where match_id = m and user_id = target and state = 'confirmed' and attended is distinct from false) then
    raise exception 'That player was not in this match'; end if;
  insert into public.motm_vote(match_id, voter_id, target_id) values (m, me, target)
  on conflict (match_id, voter_id) do update set target_id = excluded.target_id, created_at = now();
end $$;

create function private.motm_winners(m uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(target_id), '{}') from (
    select target_id, count(*) c, max(count(*)) over () mx from public.motm_vote where match_id = m group by target_id) v
  where c = mx;
$$;

-- M6: vote tallies and the caller's own vote for one match.
create function private.match_summary(m uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(private.match_member(m), false) then raise exception 'Group membership required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'motm', coalesce((select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name)) from public.profile p where p.user_id = any(private.motm_winners(m))), '[]'),
    'votes', (select count(*) from public.motm_vote where match_id = m),
    'my_vote', (select target_id from public.motm_vote where match_id = m and voter_id = (select auth.uid())));
end $$;

-- T1 M17: team averages for everyone; individual ratings stay with admins.
create function private.team_summary(m uuid) returns table(team_id uuid, avg_rating numeric, players integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(private.match_member(m), false) then raise exception 'Group membership required' using errcode = '42501'; end if;
  return query
    select t.id, round(avg(coalesce(rs.rating_display, gm.rating))::numeric, 1), count(ta.user_id)::integer
    from public.team t join public.match mt on mt.id = t.match_id
    left join public.team_assignment ta on ta.team_id = t.id
    left join public.rating_snapshot rs on rs.match_id = t.match_id and rs.user_id = ta.user_id
    left join public.group_membership gm on gm.club_id = mt.club_id and gm.user_id = ta.user_id
    where t.match_id = m group by t.id;
end $$;

-- G5 G6 M17: members with names; ratings only for admins or for yourself.
create function private.group_members(g uuid) returns table(user_id uuid, display_name text, avatar_url text, role text, status text, rating smallint, self_rating smallint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare r text := private.group_role(g);
begin
  if r is null then raise exception 'Group membership required' using errcode = '42501'; end if;
  return query
    select gm.user_id, p.display_name, p.avatar_url, gm.role, gm.status,
      case when r in ('owner', 'admin') or gm.user_id = (select auth.uid()) then gm.rating end,
      case when r in ('owner', 'admin') then p.rating_base end,
      gm.created_at
    from public.group_membership gm join public.profile p on p.user_id = gm.user_id
    where gm.club_id = g and (gm.status = 'approved' or (r in ('owner', 'admin') and gm.status = 'pending'))
    order by gm.status desc, p.display_name;
end $$;

-- G1 G2 G4: the caller's groups with their own rating and, for admins, open requests.
create function private.my_groups() returns table(club_id uuid, name text, description text, role text, status text, rating smallint, member_count integer, pending_requests integer, listed boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.description, gm.role, gm.status,
    case when gm.status = 'approved' then gm.rating end,
    (select count(*) from public.group_membership x where x.club_id = c.id and x.status = 'approved')::integer,
    case when gm.status = 'approved' and gm.role in ('owner', 'admin')
      then (select count(*) from public.group_membership x where x.club_id = c.id and x.status = 'pending')::integer else 0 end,
    c.listed
  from public.group_membership gm join public.club c on c.id = gm.club_id
  where gm.user_id = (select auth.uid()) and gm.status in ('approved', 'pending')
  order by gm.created_at;
$$;

-- M8: invite link for admins, and a preview for whoever opens it.
create function private.group_invite(g uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(private.group_role(g), '') not in ('owner', 'admin') then raise exception 'Group admin required' using errcode = '42501'; end if;
  return (select invite_code from public.club where id = g);
end $$;

create function private.group_by_code(code text) returns table(club_id uuid, name text, description text, member_count integer, my_status text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.description,
    (select count(*) from public.group_membership x where x.club_id = c.id and x.status = 'approved')::integer,
    (select gm.status from public.group_membership gm where gm.club_id = c.id and gm.user_id = (select auth.uid()))
  from public.club c where (select auth.uid()) is not null and c.invite_code = upper(trim(code));
$$;

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

-- D3: a weekly match creates next week's copy once it kicks off.
create function private.roll_weekly() returns void
language plpgsql security definer set search_path = '' as $$
declare r public.match%rowtype; weeks integer; nid uuid;
begin
  for r in select * from public.match where repeat_weekly and next_match_id is null and kick_off <= now() and status <> 'cancelled' for update skip locked loop
    weeks := greatest(1, ceil(extract(epoch from (now() - r.kick_off)) / 604800.0)::integer);
    if r.kick_off + make_interval(days => 7 * weeks) <= now() then weeks := weeks + 1; end if;
    insert into public.match(club_id, kick_off, signup_open_at, spots, teams_count, status, venue_name, venue_url, fee_amount, fee_currency, payment_note, repeat_weekly)
    values (r.club_id, r.kick_off + make_interval(days => 7 * weeks), r.signup_open_at + make_interval(days => 7 * weeks), r.spots, r.teams_count,
            'scheduled', r.venue_name, r.venue_url, r.fee_amount, r.fee_currency, r.payment_note, true)
    returning id into nid;
    update public.match set next_match_id = nid, repeat_weekly = false where id = r.id;
  end loop;
end $$;

-- "Teams at 19:00": matches still scheduled at T-60 get their teams drawn the
-- next time anyone loads matches. A match that cannot be drawn is left for an admin.
create function private.auto_lock() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select mt.id, mt.club_id from public.match mt
           where mt.status = 'scheduled' and mt.kick_off - interval '60 minutes' <= now() and mt.kick_off > now() - interval '1 day'
             and exists (select 1 from public.signup s where s.match_id = mt.id and s.state = 'confirmed')
           for update skip locked loop
    begin
      perform private.generate_teams(r.id, false);
      insert into public.audit_log(club_id, match_id, action) values (r.club_id, r.id, 'match_auto_generate');
    exception when others then
      null;
    end;
  end loop;
end $$;

create function private.sync_matches() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.roll_weekly();
  perform private.auto_lock();
end $$;

-- G1 M3 M6: every match across the caller's groups, with squad preview and results.
create function private.match_feed() returns table(
  id uuid, club_id uuid, club_name text, kick_off timestamptz, signup_open_at timestamptz, spots smallint, teams_count smallint,
  status text, venue_name text, venue_url text, fee_amount numeric, fee_currency text, repeat_weekly boolean,
  confirmed_count integer, waitlist_count integer, my_state text, my_queue_pos integer, squad jsonb, result jsonb, motm jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_matches();
  return query
    select mt.id, mt.club_id, c.name, mt.kick_off, mt.signup_open_at, mt.spots, mt.teams_count, mt.status, mt.venue_name, mt.venue_url,
      mt.fee_amount, mt.fee_currency, mt.repeat_weekly,
      (select count(*) from public.signup s where s.match_id = mt.id and s.state = 'confirmed')::integer,
      (select count(*) from public.signup s where s.match_id = mt.id and s.state = 'waitlist')::integer,
      mine.state, mine.queue_pos,
      coalesce((select jsonb_agg(jsonb_build_object('user_id', q.user_id, 'display_name', q.display_name, 'avatar_url', q.avatar_url))
        from (select p.user_id, p.display_name, p.avatar_url from public.signup s join public.profile p on p.user_id = s.user_id
              where s.match_id = mt.id and s.state = 'confirmed' order by s.created_at, s.id limit 4) q), '[]'),
      (select jsonb_agg(jsonb_build_object('name', t.name, 'score', t.score) order by t.name) from public.team t where t.match_id = mt.id and t.score is not null),
      coalesce((select jsonb_agg(p.display_name) from public.profile p where mt.status = 'completed' and p.user_id = any(private.motm_winners(mt.id))), '[]')
    from public.match mt join public.club c on c.id = mt.club_id
    left join public.signup mine on mine.match_id = mt.id and mine.user_id = (select auth.uid()) and mine.state <> 'cancelled'
    where private.group_role(mt.club_id) is not null and mt.kick_off >= now() - interval '120 days'
    order by mt.kick_off;
end $$;

-- Profile stats (games, wins, form, Man of the Match, attendance) for one group.
create function private.player_stats(g uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); result jsonb;
begin
  if private.group_role(g) is null then raise exception 'Group membership required' using errcode = '42501'; end if;
  with mine as (
    select mt.id, mt.kick_off, s.attended,
      (select t.score from public.team t join public.team_assignment ta on ta.team_id = t.id where t.match_id = mt.id and ta.user_id = me) my_score,
      (select max(t.score) from public.team t where t.match_id = mt.id and t.id not in (
         select ta.team_id from public.team_assignment ta join public.team t2 on t2.id = ta.team_id where t2.match_id = mt.id and ta.user_id = me)) best_other
    from public.match mt join public.signup s on s.match_id = mt.id and s.user_id = me and s.state = 'confirmed'
    where mt.club_id = g and mt.status = 'completed'),
  played as (select * from mine where attended is distinct from false)
  select jsonb_build_object(
    'games', (select count(*) from played),
    'wins', (select count(*) from played where my_score > best_other),
    'showed_up', (select case when count(*) filter (where attended is not null) > 0
                  then round(100.0 * count(*) filter (where attended) / count(*) filter (where attended is not null)) end from mine),
    'form', (select coalesce(jsonb_agg(r order by kick_off desc), '[]') from (
               select kick_off, case when my_score > best_other then 'W' when my_score = best_other then 'D' else 'L' end r
               from played where my_score is not null and best_other is not null order by kick_off desc limit 5) f),
    'motm', (select count(*) from public.match mt where mt.club_id = g and mt.status = 'completed' and me = any(private.motm_winners(mt.id))))
  into result;
  return result;
end $$;

-- A3: name and self-rating for players who arrived by magic link or Apple/Google.
create function private.complete_onboarding(name text, rating smallint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if length(trim(name)) not between 1 and 40 or rating not between 0 and 5 then raise exception 'Invalid name or rating'; end if;
  perform private.initialize_profile();
  update public.profile set display_name = trim(name), rating_base = rating, onboarded = true where user_id = auth.uid() and not onboarded;
end $$;

create or replace function private.initialize_profile() returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.profile(user_id, display_name, rating_base, onboarded)
  select id,
    coalesce(nullif(trim(raw_user_meta_data->>'display_name'), ''), nullif(trim(raw_user_meta_data->>'full_name'), ''),
             nullif(trim(raw_user_meta_data->>'name'), ''), nullif(split_part(email, '@', 1), ''), 'Player'),
    case when raw_user_meta_data->>'initial_rating' ~ '^[0-5]$' then (raw_user_meta_data->>'initial_rating')::smallint else 3 end,
    raw_user_meta_data ? 'display_name' and raw_user_meta_data->>'initial_rating' ~ '^[0-5]$'
  from auth.users where id = auth.uid() on conflict (user_id) do nothing;
end $$;

create or replace function private.signup_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profile(user_id, display_name, rating_base, onboarded)
  values (new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
             nullif(trim(new.raw_user_meta_data->>'name'), ''), nullif(split_part(new.email, '@', 1), ''), 'Player'),
    case when new.raw_user_meta_data->>'initial_rating' ~ '^[0-5]$' then (new.raw_user_meta_data->>'initial_rating')::smallint else 3 end,
    new.raw_user_meta_data ? 'display_name' and new.raw_user_meta_data->>'initial_rating' ~ '^[0-5]$')
  on conflict (user_id) do nothing;
  return new;
end $$;

-- P4: removes the caller's data before the auth user is deleted by the delete-account function.
-- Owned groups pass to an admin (or the longest-standing member); empty groups are deleted.
create function private.delete_account_data() returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c record; heir uuid;
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

-- Invoker wrappers keep the private schema out of the API surface.
create function public.swap_players(m uuid, a uuid, b uuid) returns void language sql security invoker set search_path = '' as $$ select private.swap_players(m, a, b); $$;
create function public.set_paid(m uuid, player uuid, is_paid boolean) returns void language sql security invoker set search_path = '' as $$ select private.set_paid(m, player, is_paid); $$;
create function public.record_result(m uuid, scores jsonb, absent uuid[]) returns void language sql security invoker set search_path = '' as $$ select private.record_result(m, scores, absent); $$;
create function public.vote_motm(m uuid, target uuid) returns void language sql security invoker set search_path = '' as $$ select private.vote_motm(m, target); $$;
create function public.match_summary(m uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.match_summary(m); $$;
create function public.team_summary(m uuid) returns table(team_id uuid, avg_rating numeric, players integer) language sql security invoker set search_path = '' as $$ select * from private.team_summary(m); $$;
create function public.group_members(g uuid) returns table(user_id uuid, display_name text, avatar_url text, role text, status text, rating smallint, self_rating smallint, created_at timestamptz) language sql security invoker set search_path = '' as $$ select * from private.group_members(g); $$;
create function public.my_groups() returns table(club_id uuid, name text, description text, role text, status text, rating smallint, member_count integer, pending_requests integer, listed boolean) language sql security invoker set search_path = '' as $$ select * from private.my_groups(); $$;
create function public.group_invite(g uuid) returns text language sql security invoker set search_path = '' as $$ select private.group_invite(g); $$;
create function public.group_by_code(code text) returns table(club_id uuid, name text, description text, member_count integer, my_status text) language sql security invoker set search_path = '' as $$ select * from private.group_by_code(code); $$;
create function public.match_feed() returns table(id uuid, club_id uuid, club_name text, kick_off timestamptz, signup_open_at timestamptz, spots smallint, teams_count smallint, status text, venue_name text, venue_url text, fee_amount numeric, fee_currency text, repeat_weekly boolean, confirmed_count integer, waitlist_count integer, my_state text, my_queue_pos integer, squad jsonb, result jsonb, motm jsonb) language sql security invoker set search_path = '' as $$ select * from private.match_feed(); $$;
create function public.player_stats(g uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.player_stats(g); $$;
create function public.complete_onboarding(name text, rating smallint) returns void language sql security invoker set search_path = '' as $$ select private.complete_onboarding(name, rating); $$;
create function public.delete_account_data() returns void language sql security invoker set search_path = '' as $$ select private.delete_account_data(); $$;
create function public.sync_matches() returns void language sql security invoker set search_path = '' as $$ select private.sync_matches(); $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.group_role(uuid), private.match_member(uuid), private.match_admin(uuid), private.chat_access(uuid), private.profile_visible(uuid),
  private.group_action(text, uuid, uuid, text, text), private.match_action(text, uuid, uuid, uuid, uuid), private.initialize_profile(),
  private.swap_players(uuid, uuid, uuid), private.set_paid(uuid, uuid, boolean), private.record_result(uuid, jsonb, uuid[]),
  private.vote_motm(uuid, uuid), private.match_summary(uuid), private.team_summary(uuid), private.group_members(uuid), private.my_groups(),
  private.group_invite(uuid), private.group_by_code(text), private.match_feed(), private.player_stats(uuid),
  private.complete_onboarding(text, smallint), private.delete_account_data(), private.sync_matches()
to authenticated;
revoke all on function
  public.swap_players(uuid, uuid, uuid), public.set_paid(uuid, uuid, boolean), public.record_result(uuid, jsonb, uuid[]), public.vote_motm(uuid, uuid),
  public.match_summary(uuid), public.team_summary(uuid), public.group_members(uuid), public.my_groups(), public.group_invite(uuid),
  public.group_by_code(text), public.match_feed(), public.player_stats(uuid), public.complete_onboarding(text, smallint), public.delete_account_data(), public.sync_matches()
from public, anon;
grant execute on function
  public.swap_players(uuid, uuid, uuid), public.set_paid(uuid, uuid, boolean), public.record_result(uuid, jsonb, uuid[]), public.vote_motm(uuid, uuid),
  public.match_summary(uuid), public.team_summary(uuid), public.group_members(uuid), public.my_groups(), public.group_invite(uuid),
  public.group_by_code(text), public.match_feed(), public.player_stats(uuid), public.complete_onboarding(text, smallint), public.delete_account_data(), public.sync_matches()
to authenticated;
