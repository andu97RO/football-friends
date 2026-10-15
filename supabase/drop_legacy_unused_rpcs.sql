-- Optional manual cleanup for legacy databases; reviewed against main 0f65d86
-- on 2026-10-15. This is not an ordered migration and does not record deployment.
--
-- No callers of these four routines exist in the current app, lib, Edge
-- Functions, or ordered migrations. Current join/cancel/generate handlers use
-- public.match_action -> private.match_action, not the older *_atomic RPCs.
-- backfill_waitlist_demotions.sql is a historical definition, not a current caller.
--
-- Before running against an existing project, inspect its deployed routines,
-- trigger dependencies, scheduled jobs, and external callers. Repository checks
-- cannot establish the absence of live-only callers. No CASCADE is used here:
-- recorded database dependencies must stop cleanup rather than be removed.
-- The transaction prevents partial cleanup if any statement fails.
--
-- docs/RELEASE_STATUS.md records that obsolete underscore-named Edge Functions
-- returned 410 on 2026-09-24. Recheck deployment inventory before deleting any;
-- this file neither deletes deployed endpoints nor asserts their current state.

begin;

drop function if exists public.join_match(uuid);
drop function if exists public.cancel_signup(uuid);
drop function if exists public.get_match_signups(uuid);
drop function if exists public.backfill_waitlist_demotions();

-- The group_access migration REMOVES on_auth_user_created_confirm on auth.users
-- and already revokes these grants when the helper exists. Keep the legacy
-- helper itself here; do not restore the trigger that bypassed verification.
-- A fresh database may never have had this function, so guard the REVOKE.
do $$ begin
  if to_regprocedure('public.auto_confirm_email()') is not null then
    execute 'revoke all on function public.auto_confirm_email() from public, anon, authenticated';
  end if;
end $$;

commit;
