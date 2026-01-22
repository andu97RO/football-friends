-- Fix Function Search Path Mutable warnings
-- These functions need search_path set for security

-- Drop old invitation-related function if it exists
DROP FUNCTION IF EXISTS public.expire_old_invitations();

-- Fix public.auto_confirm_email if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_confirm_email') THEN
    EXECUTE 'ALTER FUNCTION public.auto_confirm_email() SET search_path = public';
  END IF;
END $$;

-- Fix public.join_match if it exists (old version without _atomic suffix)
DROP FUNCTION IF EXISTS public.join_match(uuid, uuid);

-- Fix public.cancel_signup if it exists (old version without _atomic suffix)
DROP FUNCTION IF EXISTS public.cancel_signup(uuid, uuid);

-- Fix public.get_match_signups if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_match_signups') THEN
    EXECUTE 'ALTER FUNCTION public.get_match_signups(uuid) SET search_path = public';
  END IF;
END $$;
