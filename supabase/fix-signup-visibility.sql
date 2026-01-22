-- Fix RLS policy to allow everyone to view all signups
-- This is needed so that users can see the confirmed players list for any match

-- Add a policy to allow anyone to view all signups
create policy "Anyone can view all signups"
  on public.signup for select
  using (true);

