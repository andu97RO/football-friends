-- SECURITY FIX: unauthenticated callers could invoke the signup RPCs directly.
--
-- join_match_atomic(p_match_id, p_user_id) and cancel_signup_atomic(...) take
-- the target user as a PARAMETER and perform no auth check of their own. That
-- is by design: they are meant to be reachable only from the Edge Functions
-- (join-match / cancel-signup), which validate the caller's JWT first and then
-- call the RPC as service_role.
--
-- However, Supabase's default privileges grant EXECUTE on newly created
-- public-schema functions to the *named* roles `anon` and `authenticated`.
-- A `REVOKE ALL ON FUNCTION ... FROM public` (as used in
-- remove_waitlist_invitations.sql) does NOT remove those named-role grants --
-- `public` is a pseudo-role, distinct from `anon`/`authenticated`.
--
-- Net effect before this fix: anyone holding the anon key -- which ships inside
-- the published mobile app and is trivially extractable -- could POST to
-- /rest/v1/rpc/cancel_signup_atomic with any match_id + user_id and cancel a
-- confirmed player's signup, or sign arbitrary users up via
-- /rest/v1/rpc/join_match_atomic. This bypassed the Edge Functions and the
-- entire "all signup writes go through server-side logic" model.
--
-- Verified with has_function_privilege() against the live database before and
-- after applying this file.

revoke execute on function public.join_match_atomic(uuid, uuid) from anon, authenticated;
revoke execute on function public.cancel_signup_atomic(uuid, uuid) from anon, authenticated;
grant execute on function public.join_match_atomic(uuid, uuid) to service_role;
grant execute on function public.cancel_signup_atomic(uuid, uuid) to service_role;

-- Internal helpers: only ever invoked from inside SECURITY DEFINER functions
-- (which execute as the definer), so no external role needs EXECUTE.
revoke execute on function public.normalize_waitlist_queue(uuid) from public, anon, authenticated;
revoke execute on function public._lock_match(uuid) from public, anon, authenticated;
grant execute on function public.normalize_waitlist_queue(uuid) to service_role;
grant execute on function public._lock_match(uuid) to service_role;

-- update_player_rating_atomic is called directly by the client as a signed-in
-- admin and enforces is_admin internally, so `authenticated` must retain
-- EXECUTE -- but an unauthenticated caller has no business reaching it.
revoke execute on function public.update_player_rating_atomic(uuid, smallint) from anon;

-- get_match_capacity is intentionally client-readable by anon + authenticated
-- (read-only capacity counts, used by the matches list) and is left untouched.
