-- Low-risk cleanup, no behavior change:
-- 1) Drop the unused hold_expires_at column on signup (never read/written by
--    any Edge Function or app code — the reservation/hold system it
--    supported was superseded by remove_waitlist_invitations.sql).
-- 2) Add a missing index on signup.queue_pos, used for ORDER BY in
--    join_match_atomic / cancel_signup_atomic / normalize_waitlist_queue.
-- 3) Collapse redundant overlapping RLS policies on profile/signup down to
--    one policy per table.
--
-- IMPORTANT (3): this repo has no ordered migration system — the supabase/*.sql
-- files are applied by hand, so we cannot assume a given prior patch is live.
-- The redundant-policy cleanup below only runs if a permissive catch-all
-- SELECT policy (qual = 'true', not role-restricted) actually exists on the
-- table. Without that guard, dropping the narrower policies on a database
-- where fix-signup-visibility.sql was never applied would leave the table
-- with NO readable SELECT policy and break the app's player lists.

alter table public.signup drop column if exists hold_expires_at;

create index if not exists idx_signup_queue_pos on public.signup(queue_pos);

do $$
declare
  v_has_catchall boolean;
begin
  -- profile: only drop the narrow policy if a true catch-all SELECT policy remains.
  select exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profile'
      and cmd = 'SELECT'
      and qual = 'true'
      and policyname <> 'Users can view own profile'
      and ('public' = any(roles) or 'authenticated' = any(roles) or roles = '{0}')
  ) into v_has_catchall;

  if v_has_catchall then
    drop policy if exists "Users can view own profile" on public.profile;
    raise notice 'profile: dropped redundant "Users can view own profile"';
  else
    raise notice 'profile: SKIPPED cleanup — no catch-all SELECT policy found, keeping existing policies';
  end if;

  -- signup: same guard.
  select exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'signup'
      and cmd = 'SELECT'
      and qual = 'true'
      and policyname not in (
        'Users can view own signups',
        'Authenticated users can view all signups',
        'Organizers can view all signups for their matches'
      )
  ) into v_has_catchall;

  if v_has_catchall then
    drop policy if exists "Users can view own signups" on public.signup;
    drop policy if exists "Authenticated users can view all signups" on public.signup;
    drop policy if exists "Organizers can view all signups for their matches" on public.signup;
    raise notice 'signup: dropped 3 redundant SELECT policies';
  else
    raise notice 'signup: SKIPPED cleanup — no catch-all SELECT policy found, keeping existing policies';
  end if;
end;
$$;
