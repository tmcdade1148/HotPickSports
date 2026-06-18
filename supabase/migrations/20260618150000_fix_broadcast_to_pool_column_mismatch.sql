-- fix_broadcast_to_pool_column_mismatch
--
-- broadcast_to_pool's notification INSERT referenced sender_id (not a column on
-- organizer_notifications — the column is organizer_id) and omitted competition
-- (NOT NULL, no default). The function threw on every call, so Gaffer broadcasts
-- have never worked: no Message Center row, no pool_events entry, raw error alert.
--
-- This is the current live function body with ONLY the organizer_notifications
-- INSERT changed (sender_id -> organizer_id; add competition). Everything else —
-- message validation, organizer role guard, 3-per-24h rate limit, recipient
-- count, and the pool_events ORGANIZER_BROADCAST log — is preserved verbatim.
-- ('ORGANIZER_BROADCAST' is already in the pool_events.event_type CHECK allow-list,
-- so the previously-unreachable second INSERT succeeds too.)

CREATE OR REPLACE FUNCTION public.broadcast_to_pool(p_pool_id uuid, p_message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_pool RECORD;
  v_caller_role TEXT;
  v_broadcasts_today INT;
  v_max_per_day INT := 3;
  v_recipient_count INT;
BEGIN
  -- Validate message
  IF p_message IS NULL OR LENGTH(TRIM(p_message)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message cannot be empty');
  END IF;

  IF LENGTH(TRIM(p_message)) > 160 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message cannot exceed 160 characters');
  END IF;

  -- Get pool
  SELECT id, competition INTO v_pool
  FROM pools
  WHERE id = p_pool_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool not found');
  END IF;

  -- Check caller is organizer
  SELECT role INTO v_caller_role
  FROM pool_members
  WHERE pool_id = p_pool_id AND user_id = v_caller_id AND status = 'active';

  IF v_caller_role IS DISTINCT FROM 'organizer' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the organizer can send broadcasts');
  END IF;

  -- Rate limit: max 3 broadcasts per 24h per pool
  SELECT COUNT(*) INTO v_broadcasts_today
  FROM organizer_notifications
  WHERE pool_id = p_pool_id
    AND notification_type = 'broadcast'
    AND sent_at > NOW() - INTERVAL '24 hours';

  IF v_broadcasts_today >= v_max_per_day THEN
    RETURN jsonb_build_object('success', false, 'error', 'rate_limited',
                              'remaining_today', 0);
  END IF;

  -- Count recipients (active members excluding sender)
  SELECT COUNT(*) INTO v_recipient_count
  FROM pool_members
  WHERE pool_id = p_pool_id AND status = 'active' AND user_id != v_caller_id;

  -- Insert notification record
  -- FIX (2026-06-18): sender_id -> organizer_id (Hard Rule #18); add NOT NULL
  -- competition. This INSERT is the only change from the prior live body.
  INSERT INTO organizer_notifications (pool_id, organizer_id, competition, message, notification_type, recipient_count)
  VALUES (p_pool_id, v_caller_id, v_pool.competition, TRIM(p_message), 'broadcast', v_recipient_count);

  -- Log event
  INSERT INTO pool_events (pool_id, competition, user_id, event_type, metadata)
  VALUES (p_pool_id, v_pool.competition, v_caller_id, 'ORGANIZER_BROADCAST',
          jsonb_build_object('recipient_count', v_recipient_count,
                             'message_length', LENGTH(TRIM(p_message))));

  RETURN jsonb_build_object(
    'success', true,
    'recipients', v_recipient_count,
    'remaining_today', v_max_per_day - v_broadcasts_today - 1
  );
END;
$function$;
