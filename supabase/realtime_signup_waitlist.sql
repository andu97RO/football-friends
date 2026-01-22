-- Enable Realtime (Postgres Changes) for tables used by the match + waitlist flows
-- Apply in Supabase SQL Editor or migrations.

alter publication supabase_realtime add table public.signup;
alter publication supabase_realtime add table public.waitlist_invitation;


