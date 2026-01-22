-- One-time backfill: demote waitlist users who previously expired/declined an invitation
-- but are still in state='waitlist'. This prevents UI confusion like:
-- \"I'm #1 on the waitlist but I'm not getting the invite\".

drop function if exists public.backfill_waitlist_demotions();

create function public.backfill_waitlist_demotions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int := 0;
  v_match record;
begin
  with affected as (
    select
      s.match_id,
      s.user_id,
      max(wi.responded_at) as responded_at
    from public.signup s
    join public.waitlist_invitation wi
      on wi.match_id = s.match_id
     and wi.user_id = s.user_id
    where s.state = 'waitlist'
      and wi.status in ('expired','declined')
      and wi.responded_at is not null
    group by s.match_id, s.user_id
  ),
  maxpos as (
    select
      s.match_id,
      coalesce(max(s.queue_pos), 0)::int as m
    from public.signup s
    where s.state = 'waitlist'
      and not exists (
        select 1 from affected a
        where a.match_id = s.match_id
          and a.user_id = s.user_id
      )
    group by s.match_id
  ),
  ranked as (
    select
      a.match_id,
      a.user_id,
      (coalesce(mp.m, 0) + row_number() over (partition by a.match_id order by a.responded_at asc, a.user_id))::int as new_pos
    from affected a
    left join maxpos mp on mp.match_id = a.match_id
  ),
  upd as (
    update public.signup s
    set queue_pos = rr.new_pos
    from ranked rr
    where s.match_id = rr.match_id
      and s.user_id = rr.user_id
      and s.state = 'waitlist'
    returning 1
  )
  select count(*)::int into v_updated from upd;

  for v_match in (
    select distinct a.match_id
    from public.signup s
    join public.waitlist_invitation wi
      on wi.match_id = s.match_id
     and wi.user_id = s.user_id
    join (
      select distinct match_id
      from public.waitlist_invitation
      where status in ('expired','declined')
        and responded_at is not null
    ) a on a.match_id = s.match_id
    where s.state = 'waitlist'
  ) loop
    perform public.normalize_waitlist_queue(v_match.match_id);
  end loop;

  return v_updated;
end;
$$;

-- Run it:
-- select public.backfill_waitlist_demotions();


