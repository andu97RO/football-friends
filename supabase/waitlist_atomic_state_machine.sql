-- Atomic waitlist + invitation state machine (reserved spots)
--
-- This SQL is intended to be applied in Supabase SQL Editor (or via migrations).
-- It provides:
-- - Per-match transactional locking via advisory locks
-- - Atomic join/cancel/accept/decline/expire flows
-- - Reserved spot accounting via pending invitations
-- - A safe capacity projection function for clients (reserved_count only)

-- 1) Helpers
create or replace function public._lock_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- One lock per match per transaction
  perform pg_advisory_xact_lock(hashtext(p_match_id::text));
end;
$$;

create or replace function public.normalize_waitlist_queue(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with ordered as (
    select
      id,
      row_number() over (order by queue_pos asc nulls last, created_at asc) as rn
    from public.signup
    where match_id = p_match_id
      and state = 'waitlist'
  )
  update public.signup s
  set queue_pos = o.rn
  from ordered o
  where s.id = o.id;
end;
$$;

create or replace function public._expire_pending_invitations_for_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with expired as (
    update public.waitlist_invitation
    set status = 'expired',
        responded_at = now()
    where match_id = p_match_id
      and status = 'pending'
      and expires_at < now()
    returning id, match_id, user_id
  ),
  maxpos as (
    select coalesce(max(queue_pos), 0)::int as m
    from public.signup
    where match_id = p_match_id
      and state = 'waitlist'
      and user_id not in (select user_id from expired)
  ),
  numbered as (
    select e.user_id, (maxpos.m + row_number() over (order by e.user_id))::int as new_pos
    from expired e, maxpos
  ),
  moved as (
    update public.signup s
    set queue_pos = n.new_pos
    from numbered n
    where s.match_id = p_match_id
      and s.user_id = n.user_id
      and s.state = 'waitlist'
    returning s.user_id
  )
  insert into public.audit_log(match_id, user_id, action, meta)
  select
    e.match_id,
    e.user_id,
    'invitation_expired',
    jsonb_build_object('invitation_id', e.id, 'reason', 'auto_expire')
  from expired e;

  -- Normalize once after moving any expired invitees
  perform public.normalize_waitlist_queue(p_match_id);
end;
$$;

create or replace function public._fill_open_spots_with_invitations(
  p_match_id uuid,
  p_excluded_user_ids uuid[] default '{}',
  p_reason text default 'spot_opened'
)
returns table(invitation_id uuid, invited_user_id uuid, invited_queue_pos integer, invited_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spots integer;
  v_status text;
  v_confirmed integer;
  v_reserved integer;
  v_open_spots integer;
begin
  perform public._expire_pending_invitations_for_match(p_match_id);

  select m.spots, m.status
  into v_spots, v_status
  from public.match m
  where m.id = p_match_id;

  if not found then
    return;
  end if;

  if v_status <> 'scheduled' then
    return;
  end if;

  -- Ensure queue_pos is consistent before selecting candidates
  perform public.normalize_waitlist_queue(p_match_id);

  select count(*) into v_confirmed
  from public.signup s
  where s.match_id = p_match_id
    and s.state = 'confirmed';

  select count(*) into v_reserved
  from public.waitlist_invitation wi
  where wi.match_id = p_match_id
    and wi.status = 'pending'
    and wi.expires_at > now();

  v_open_spots := v_spots - (v_confirmed + v_reserved);

  if v_open_spots <= 0 then
    return;
  end if;

  return query
  with candidates as (
    select
      s.user_id as candidate_user_id,
      s.queue_pos as candidate_queue_pos
    from public.signup s
    where s.match_id = p_match_id
      and s.state = 'waitlist'
      and (p_excluded_user_ids is null or not (s.user_id = any(p_excluded_user_ids)))
      and not exists (
        select 1
        from public.waitlist_invitation wi
        where wi.match_id = s.match_id
          and wi.user_id = s.user_id
          and wi.status = 'pending'
          and wi.expires_at > now()
      )
    order by s.queue_pos asc
    limit v_open_spots
  ),
  inserted as (
    insert into public.waitlist_invitation(match_id, user_id, status, expires_at)
    select
      p_match_id,
      c.candidate_user_id,
      'pending',
      now() + interval '10 minutes'
    from candidates c
    returning id, match_id, user_id, expires_at
  ),
  audit as (
    insert into public.audit_log(match_id, user_id, action, meta)
    select
      i.match_id,
      i.user_id,
      'invitation_sent',
      jsonb_build_object(
        'invitation_id', i.id,
        'queue_pos', c.candidate_queue_pos,
        'reason', p_reason
      )
    from inserted i
    join candidates c on c.candidate_user_id = i.user_id
    returning 1
  )
  select
    i.id as invitation_id,
    i.user_id as invited_user_id,
    c.candidate_queue_pos as invited_queue_pos,
    i.expires_at as invited_expires_at
  from inserted i
  join candidates c on c.candidate_user_id = i.user_id;
end;
$$;

-- 2) Public capacity projection (safe)
create or replace function public.get_match_capacity(match_ids uuid[])
returns table(match_id uuid, confirmed_count integer, reserved_count integer)
language sql
security definer
set search_path = public
as $$
  select
    m.id as match_id,
    coalesce(c.confirmed_count, 0) as confirmed_count,
    coalesce(r.reserved_count, 0) as reserved_count
  from public.match m
  left join (
    select match_id, count(*)::int as confirmed_count
    from public.signup
    where state = 'confirmed'
    group by match_id
  ) c on c.match_id = m.id
  left join (
    select match_id, count(*)::int as reserved_count
    from public.waitlist_invitation
    where status = 'pending'
      and expires_at > now()
    group by match_id
  ) r on r.match_id = m.id
  where m.id = any(match_ids);
$$;

-- 3) Atomic operations (service_role only)
create or replace function public.join_match_atomic(p_match_id uuid, p_user_id uuid)
returns table(state text, queue_pos integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.match%rowtype;
  v_existing public.signup%rowtype;
  v_confirmed integer;
  v_reserved integer;
  v_new_state text;
  v_new_queue_pos integer;
begin
  perform public._lock_match(p_match_id);
  perform public._expire_pending_invitations_for_match(p_match_id);

  select * into v_match
  from public.match
  where id = p_match_id;

  if not found then
    raise exception 'Match not found';
  end if;

  if now() < v_match.signup_open_at then
    raise exception 'Signup not open yet';
  end if;

  if v_match.status in ('locked','completed','cancelled') then
    raise exception 'Match is not open for signups';
  end if;

  select * into v_existing
  from public.signup
  where match_id = p_match_id
    and user_id = p_user_id;

  if found and v_existing.state <> 'cancelled' then
    raise exception 'Already signed up';
  end if;

  select count(*) into v_confirmed
  from public.signup
  where match_id = p_match_id
    and state = 'confirmed';

  select count(*) into v_reserved
  from public.waitlist_invitation
  where match_id = p_match_id
    and status = 'pending'
    and expires_at > now();

  if (v_confirmed + v_reserved) < v_match.spots then
    v_new_state := 'confirmed';
    v_new_queue_pos := null;
  else
    v_new_state := 'waitlist';
    select coalesce(max(queue_pos), 0) + 1
    into v_new_queue_pos
    from public.signup
    where match_id = p_match_id
      and state = 'waitlist';
  end if;

  if found then
    update public.signup
    set state = v_new_state,
        queue_pos = v_new_queue_pos,
        created_at = now()
    where id = v_existing.id;
  else
    insert into public.signup(match_id, user_id, state, queue_pos)
    values (p_match_id, p_user_id, v_new_state, v_new_queue_pos);
  end if;

  if v_new_state = 'waitlist' then
    perform public.normalize_waitlist_queue(p_match_id);
    select s.queue_pos
    into v_new_queue_pos
    from public.signup s
    where s.match_id = p_match_id
      and s.user_id = p_user_id;
  end if;

  insert into public.audit_log(match_id, user_id, action, meta)
  values (
    p_match_id,
    p_user_id,
    'join_match',
    jsonb_build_object('state', v_new_state, 'queue_pos', v_new_queue_pos)
  );

  return query select v_new_state::text, v_new_queue_pos;
end;
$$;

create or replace function public.cancel_signup_atomic(p_match_id uuid, p_user_id uuid)
returns table(invitation_id uuid, user_id uuid, queue_pos integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.match%rowtype;
  v_signup public.signup%rowtype;
  v_was_confirmed boolean;
begin
  perform public._lock_match(p_match_id);

  select * into v_match
  from public.match
  where id = p_match_id;

  if not found then
    raise exception 'Match not found';
  end if;

  if v_match.status = 'locked' then
    raise exception 'Match is locked';
  end if;

  select * into v_signup
  from public.signup s
  where s.match_id = p_match_id
    and s.user_id = p_user_id;

  if not found then
    raise exception 'Signup not found';
  end if;

  if v_signup.state = 'cancelled' then
    raise exception 'Already cancelled';
  end if;

  v_was_confirmed := (v_signup.state = 'confirmed');

  update public.signup
  set state = 'cancelled',
      queue_pos = null
  where id = v_signup.id;

  perform public.normalize_waitlist_queue(p_match_id);

  insert into public.audit_log(match_id, user_id, action, meta)
  values (
    p_match_id,
    p_user_id,
    'cancel_signup',
    jsonb_build_object('was_confirmed', v_was_confirmed)
  );

  if v_was_confirmed then
    return query
    select
      f.invitation_id,
      f.invited_user_id as user_id,
      f.invited_queue_pos as queue_pos,
      f.invited_expires_at as expires_at
    from public._fill_open_spots_with_invitations(p_match_id, '{}', 'cancelled') f;
  end if;

  return;
end;
$$;

create or replace function public.accept_invitation_atomic(p_invitation_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.waitlist_invitation%rowtype;
begin
  select * into v_inv
  from public.waitlist_invitation
  where id = p_invitation_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Invitation not found';
  end if;

  perform public._lock_match(v_inv.match_id);

  if v_inv.status <> 'pending' then
    raise exception 'Invitation is %', v_inv.status;
  end if;

  if v_inv.expires_at < now() then
    update public.waitlist_invitation
    set status = 'expired', responded_at = now()
    where id = p_invitation_id;

    insert into public.audit_log(match_id, user_id, action, meta)
    values (
      v_inv.match_id,
      p_user_id,
      'invitation_expired',
      jsonb_build_object('invitation_id', p_invitation_id, 'reason', 'accept_after_expiry')
    );

    -- Refill, excluding this user from immediate re-invite for this spot
    perform public._fill_open_spots_with_invitations(v_inv.match_id, array[p_user_id], 'previous_expired');

    raise exception 'Invitation has expired';
  end if;

  update public.waitlist_invitation
  set status = 'accepted', responded_at = now()
  where id = p_invitation_id;

  update public.signup
  set state = 'confirmed', queue_pos = null
  where match_id = v_inv.match_id
    and user_id = p_user_id;

  perform public.normalize_waitlist_queue(v_inv.match_id);

  insert into public.audit_log(match_id, user_id, action, meta)
  values (
    v_inv.match_id,
    p_user_id,
    'invitation_accepted',
    jsonb_build_object('invitation_id', p_invitation_id)
  );

  return v_inv.match_id;
end;
$$;

create or replace function public.decline_invitation_atomic(p_invitation_id uuid, p_user_id uuid)
returns table(invitation_id uuid, user_id uuid, queue_pos integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.waitlist_invitation%rowtype;
  v_maxpos int;
begin
  select * into v_inv
  from public.waitlist_invitation
  where id = p_invitation_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Invitation not found';
  end if;

  perform public._lock_match(v_inv.match_id);

  if v_inv.status <> 'pending' then
    raise exception 'Invitation is %', v_inv.status;
  end if;

  if v_inv.expires_at < now() then
    update public.waitlist_invitation
    set status = 'expired', responded_at = now()
    where id = p_invitation_id;

    insert into public.audit_log(match_id, user_id, action, meta)
    values (
      v_inv.match_id,
      p_user_id,
      'invitation_expired',
      jsonb_build_object('invitation_id', p_invitation_id, 'reason', 'decline_after_expiry')
    );

    -- Demote expired invitee to the end of waitlist
    select coalesce(max(queue_pos), 0)::int into v_maxpos
    from public.signup
    where match_id = v_inv.match_id
      and state = 'waitlist'
      and user_id <> p_user_id;

    update public.signup
    set queue_pos = v_maxpos + 1
    where match_id = v_inv.match_id
      and user_id = p_user_id
      and state = 'waitlist';

    perform public.normalize_waitlist_queue(v_inv.match_id);

    return query
    select
      f.invitation_id,
      f.invited_user_id as user_id,
      f.invited_queue_pos as queue_pos,
      f.invited_expires_at as expires_at
    from public._fill_open_spots_with_invitations(v_inv.match_id, array[p_user_id], 'previous_expired') f;

    return;
  end if;

  update public.waitlist_invitation
  set status = 'declined', responded_at = now()
  where id = p_invitation_id;

  -- Demote declined invitee to the end of waitlist
  select coalesce(max(queue_pos), 0)::int into v_maxpos
  from public.signup
  where match_id = v_inv.match_id
    and state = 'waitlist'
    and user_id <> p_user_id;

  update public.signup
  set queue_pos = v_maxpos + 1
  where match_id = v_inv.match_id
    and user_id = p_user_id
    and state = 'waitlist';

  perform public.normalize_waitlist_queue(v_inv.match_id);

  insert into public.audit_log(match_id, user_id, action, meta)
  values (
    v_inv.match_id,
    p_user_id,
    'invitation_declined',
    jsonb_build_object('invitation_id', p_invitation_id, 'demoted', true)
  );

  return query
  select
    f.invitation_id,
    f.invited_user_id as user_id,
    f.invited_queue_pos as queue_pos,
    f.invited_expires_at as expires_at
  from public._fill_open_spots_with_invitations(v_inv.match_id, array[p_user_id], 'previous_declined') f;
end;
$$;

create or replace function public.process_expired_invitations_atomic()
returns table(match_id uuid, invitation_id uuid, user_id uuid, queue_pos integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_excluded uuid[];
  v_maxpos int;
begin
  -- Iterate matches with expired pending invitations
  for r in
    select wi.match_id, array_agg(wi.user_id) as excluded_user_ids, array_agg(wi.id) as invitation_ids
    from public.waitlist_invitation wi
    where wi.status = 'pending'
      and wi.expires_at < now()
    group by wi.match_id
  loop
    perform public._lock_match(r.match_id);

    -- Expire them
    with expired as (
      update public.waitlist_invitation wi
      set status = 'expired', responded_at = now()
      where wi.id = any(r.invitation_ids)
      returning wi.id, wi.match_id, wi.user_id
    )
    insert into public.audit_log(match_id, user_id, action, meta)
    select
      e.match_id,
      e.user_id,
      'invitation_expired',
      jsonb_build_object('invitation_id', e.id, 'reason', 'cron_expire')
    from expired e;

    -- Demote all expired invitees to the end (preserve relative order by user_id)
    select coalesce(max(queue_pos), 0)::int into v_maxpos
    from public.signup
    where match_id = r.match_id
      and state = 'waitlist'
      and user_id <> all(r.excluded_user_ids);

    with ex as (
      select unnest(r.excluded_user_ids) as user_id
    ),
    numbered as (
      select ex.user_id, (v_maxpos + row_number() over (order by ex.user_id))::int as new_pos
      from ex
    )
    update public.signup s
    set queue_pos = n.new_pos
    from numbered n
    where s.match_id = r.match_id
      and s.user_id = n.user_id
      and s.state = 'waitlist';

    perform public.normalize_waitlist_queue(r.match_id);

    v_excluded := r.excluded_user_ids;

    return query
    select
      r.match_id,
      f.invitation_id,
      f.invited_user_id as user_id,
      f.invited_queue_pos as queue_pos,
      f.invited_expires_at as expires_at
    from public._fill_open_spots_with_invitations(r.match_id, v_excluded, 'previous_expired') f;
  end loop;
end;
$$;

-- 4) Performance
create index if not exists idx_signup_match_state_queue on public.signup(match_id, state, queue_pos);

-- 5) Privileges
-- Lock down atomic operations to service_role only
revoke all on function public.join_match_atomic(uuid, uuid) from public;
grant execute on function public.join_match_atomic(uuid, uuid) to service_role;

revoke all on function public.cancel_signup_atomic(uuid, uuid) from public;
grant execute on function public.cancel_signup_atomic(uuid, uuid) to service_role;

revoke all on function public.accept_invitation_atomic(uuid, uuid) from public;
grant execute on function public.accept_invitation_atomic(uuid, uuid) to service_role;

revoke all on function public.decline_invitation_atomic(uuid, uuid) from public;
grant execute on function public.decline_invitation_atomic(uuid, uuid) to service_role;

revoke all on function public.process_expired_invitations_atomic() from public;
grant execute on function public.process_expired_invitations_atomic() to service_role;

-- Capacity projection is safe for clients
revoke all on function public.get_match_capacity(uuid[]) from public;
grant execute on function public.get_match_capacity(uuid[]) to anon, authenticated, service_role;


