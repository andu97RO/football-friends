-- Low-risk cleanup, no behavior change:
-- 1) Drop the unused hold_expires_at column on signup (never read/written by
--    any Edge Function or app code — the reservation/hold system it
--    supported was superseded by remove_waitlist_invitations.sql).
-- 2) Add a missing index on signup.queue_pos, used for ORDER BY in
--    join_match_atomic / cancel_signup_atomic / normalize_waitlist_queue.
-- 3) Collapse redundant overlapping RLS policies on profile/signup down to
--    one policy per table. Each table currently has multiple permissive
--    SELECT policies where a broader `using (true)` policy already
--    subsumes the narrower ones (Postgres OR's permissive policies
--    together), so dropping the narrower ones does not change effective
--    access.

alter table public.signup drop column if exists hold_expires_at;

create index if not exists idx_signup_queue_pos on public.signup(queue_pos);

-- profile: "Anyone can view all profiles" (using true) already subsumes
-- "Users can view own profile".
drop policy if exists "Users can view own profile" on public.profile;

-- signup: "Anyone can view all signups" (fix-signup-visibility.sql, using
-- true, no role restriction) already subsumes the other three SELECT
-- policies below.
drop policy if exists "Users can view own signups" on public.signup;
drop policy if exists "Authenticated users can view all signups" on public.signup;
drop policy if exists "Organizers can view all signups for their matches" on public.signup;
