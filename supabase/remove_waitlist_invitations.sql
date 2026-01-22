-- Migration: Remove waitlist invitation system and use automatic promotion
--
-- This migration:
-- 1. Updates cancel_signup_atomic to auto-promote waitlisted users
-- 2. Updates get_match_capacity to not include reserved_count from invitations
-- 3. Updates join_match_atomic to not consider pending invitations
-- 4. Drops invitation-related functions
-- 5. Drops the waitlist_invitation table

-- 0) Drop old cancel_signup_atomic function first (return type changed)
DROP FUNCTION IF EXISTS public.cancel_signup_atomic(uuid, uuid);

-- 1) Create new cancel_signup_atomic to auto-promote next waitlisted user
CREATE OR REPLACE FUNCTION public.cancel_signup_atomic(p_match_id uuid, p_user_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.match%rowtype;
  v_signup public.signup%rowtype;
  v_was_confirmed boolean;
  v_next_user_id uuid;
  v_spots integer;
  v_confirmed integer;
BEGIN
  PERFORM public._lock_match(p_match_id);

  SELECT * INTO v_match
  FROM public.match
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.status = 'locked' THEN
    RAISE EXCEPTION 'Match is locked';
  END IF;

  SELECT * INTO v_signup
  FROM public.signup s
  WHERE s.match_id = p_match_id
    AND s.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signup not found';
  END IF;

  IF v_signup.state = 'cancelled' THEN
    RAISE EXCEPTION 'Already cancelled';
  END IF;

  v_was_confirmed := (v_signup.state = 'confirmed');

  UPDATE public.signup
  SET state = 'cancelled',
      queue_pos = null
  WHERE id = v_signup.id;

  PERFORM public.normalize_waitlist_queue(p_match_id);

  INSERT INTO public.audit_log(match_id, user_id, action, meta)
  VALUES (
    p_match_id,
    p_user_id,
    'cancel_signup',
    jsonb_build_object('was_confirmed', v_was_confirmed)
  );

  -- If was confirmed, auto-promote next waitlisted user
  IF v_was_confirmed THEN
    v_spots := v_match.spots;

    SELECT count(*) INTO v_confirmed
    FROM public.signup
    WHERE match_id = p_match_id
      AND state = 'confirmed';

    -- If there's room and someone is waitlisted, promote them
    IF v_confirmed < v_spots THEN
      SELECT s.user_id INTO v_next_user_id
      FROM public.signup s
      WHERE s.match_id = p_match_id
        AND s.state = 'waitlist'
      ORDER BY s.queue_pos ASC
      LIMIT 1;

      IF v_next_user_id IS NOT NULL THEN
        UPDATE public.signup
        SET state = 'confirmed',
            queue_pos = null
        WHERE match_id = p_match_id
          AND user_id = v_next_user_id;

        PERFORM public.normalize_waitlist_queue(p_match_id);

        INSERT INTO public.audit_log(match_id, user_id, action, meta)
        VALUES (
          p_match_id,
          v_next_user_id,
          'auto_promoted',
          jsonb_build_object('reason', 'spot_opened')
        );

        RETURN QUERY SELECT v_next_user_id;
      END IF;
    END IF;
  END IF;

  RETURN;
END;
$$;

-- 2) Update get_match_capacity to not include reserved_count
CREATE OR REPLACE FUNCTION public.get_match_capacity(match_ids uuid[])
RETURNS TABLE(match_id uuid, confirmed_count integer, reserved_count integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id AS match_id,
    COALESCE(c.confirmed_count, 0) AS confirmed_count,
    0 AS reserved_count  -- Always 0 since we no longer use reservations
  FROM public.match m
  LEFT JOIN (
    SELECT match_id, count(*)::int AS confirmed_count
    FROM public.signup
    WHERE state = 'confirmed'
    GROUP BY match_id
  ) c ON c.match_id = m.id
  WHERE m.id = ANY(match_ids);
$$;

-- 3) Update join_match_atomic to not consider pending invitations
CREATE OR REPLACE FUNCTION public.join_match_atomic(p_match_id uuid, p_user_id uuid)
RETURNS TABLE(state text, queue_pos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.match%rowtype;
  v_existing public.signup%rowtype;
  v_confirmed integer;
  v_new_state text;
  v_new_queue_pos integer;
BEGIN
  PERFORM public._lock_match(p_match_id);

  SELECT * INTO v_match
  FROM public.match
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF now() < v_match.signup_open_at THEN
    RAISE EXCEPTION 'Signup not open yet';
  END IF;

  IF v_match.status IN ('locked','completed','cancelled') THEN
    RAISE EXCEPTION 'Match is not open for signups';
  END IF;

  SELECT * INTO v_existing
  FROM public.signup
  WHERE match_id = p_match_id
    AND user_id = p_user_id;

  IF FOUND AND v_existing.state <> 'cancelled' THEN
    RAISE EXCEPTION 'Already signed up';
  END IF;

  SELECT count(*) INTO v_confirmed
  FROM public.signup
  WHERE match_id = p_match_id
    AND state = 'confirmed';

  IF v_confirmed < v_match.spots THEN
    v_new_state := 'confirmed';
    v_new_queue_pos := null;
  ELSE
    v_new_state := 'waitlist';
    SELECT COALESCE(max(queue_pos), 0) + 1
    INTO v_new_queue_pos
    FROM public.signup
    WHERE match_id = p_match_id
      AND state = 'waitlist';
  END IF;

  IF FOUND THEN
    UPDATE public.signup
    SET state = v_new_state,
        queue_pos = v_new_queue_pos,
        created_at = now()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.signup(match_id, user_id, state, queue_pos)
    VALUES (p_match_id, p_user_id, v_new_state, v_new_queue_pos);
  END IF;

  IF v_new_state = 'waitlist' THEN
    PERFORM public.normalize_waitlist_queue(p_match_id);
    SELECT s.queue_pos
    INTO v_new_queue_pos
    FROM public.signup s
    WHERE s.match_id = p_match_id
      AND s.user_id = p_user_id;
  END IF;

  INSERT INTO public.audit_log(match_id, user_id, action, meta)
  VALUES (
    p_match_id,
    p_user_id,
    'join_match',
    jsonb_build_object('state', v_new_state, 'queue_pos', v_new_queue_pos)
  );

  RETURN QUERY SELECT v_new_state::text, v_new_queue_pos;
END;
$$;

-- 4) Drop invitation-related functions
DROP FUNCTION IF EXISTS public.accept_invitation_atomic(uuid, uuid);
DROP FUNCTION IF EXISTS public.decline_invitation_atomic(uuid, uuid);
DROP FUNCTION IF EXISTS public.process_expired_invitations_atomic();
DROP FUNCTION IF EXISTS public._fill_open_spots_with_invitations(uuid, uuid[], text);
DROP FUNCTION IF EXISTS public._expire_pending_invitations_for_match(uuid);

-- 5) Drop the waitlist_invitation table
DROP TABLE IF EXISTS public.waitlist_invitation;

-- 6) Update privileges
REVOKE ALL ON FUNCTION public.join_match_atomic(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.join_match_atomic(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_signup_atomic(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_signup_atomic(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_match_capacity(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_match_capacity(uuid[]) TO anon, authenticated, service_role;
