-- =============================================================================
-- Migration: broadcast_to_pool — add Gaffer push (notification_queue enqueue)
-- =============================================================================
-- broadcast_to_pool wrote the Message Center row (organizer_notifications) and
-- the pool_events audit row, but never enqueued a push — so a Gaffer broadcast
-- was in-app only. This adds the push fan-out to the pool's active members
-- (excluding the sender), using notification_type 'organizer_broadcast' so it
-- (a) passes the notification_queue CHECK and (b) is gated by the user's
-- 'organizer_broadcast' toggle in notification_preferences (the processor's
-- PREF_COLUMN_MAP only honors a type it knows — 'broadcast_received' would
-- bypass the toggle AND violate the CHECK).
--
-- Changes vs. the prior definition (20260618150000):
--   • pool lookup now also selects `name` (used as the push title).
--   • after the organizer_notifications + pool_events inserts, fan out one
--     notification_queue row per active member except the caller.
-- Everything else (validation, organizer-role gate, 3/24h rate limit, return
-- shape) is unchanged.
--
-- COALESCE on the title guards the NOT NULL notification_queue.title against a
-- null/blank pool name (which would otherwise roll back the whole broadcast).
--
-- Idempotent (CREATE OR REPLACE). Roll back by re-applying 20260618150000.
-- =============================================================================

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
  IF p_message IS NULL OR LENGTH(TRIM(p_message)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message cannot be empty');
  END IF;

  IF LENGTH(TRIM(p_message)) > 160 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message cannot exceed 160 characters');
  END IF;

  -- Also select name now — used as the push title.
  SELECT id, competition, name INTO v_pool
  FROM pools
  WHERE id = p_pool_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool not found');
  END IF;

  SELECT role INTO v_caller_role
  FROM pool_members
  WHERE pool_id = p_pool_id AND user_id = v_caller_id AND status = 'active';

  IF v_caller_role IS DISTINCT FROM 'organizer' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the organizer can send broadcasts');
  END IF;

  SELECT COUNT(*) INTO v_broadcasts_today
  FROM organizer_notifications
  WHERE pool_id = p_pool_id
    AND notification_type = 'broadcast'
    AND sent_at > NOW() - INTERVAL '24 hours';

  IF v_broadcasts_today >= v_max_per_day THEN
    RETURN jsonb_build_object('success', false, 'error', 'rate_limited',
                              'remaining_today', 0);
  END IF;

  SELECT COUNT(*) INTO v_recipient_count
  FROM pool_members
  WHERE pool_id = p_pool_id AND status = 'active' AND user_id != v_caller_id;

  -- FIX (2026-06-18): sender_id -> organizer_id (Hard Rule #18); add NOT NULL competition.
  INSERT INTO organizer_notifications (pool_id, organizer_id, competition, message, notification_type, recipient_count)
  VALUES (p_pool_id, v_caller_id, v_pool.competition, TRIM(p_message), 'broadcast', v_recipient_count);

  INSERT INTO pool_events (pool_id, competition, user_id, event_type, metadata)
  VALUES (p_pool_id, v_pool.competition, v_caller_id, 'ORGANIZER_BROADCAST',
          jsonb_build_object('recipient_count', v_recipient_count,
                             'message_length', LENGTH(TRIM(p_message))));

  -- NEW (2026-06-18): enqueue push to every active member except the sender.
  -- 'organizer_broadcast' is the only broadcast type the processor's
  -- PREF_COLUMN_MAP honors (and the only one allowed by the queue CHECK).
  INSERT INTO notification_queue (user_id, notification_type, title, body, pool_id, data)
  SELECT pm.user_id,
         'organizer_broadcast',
         COALESCE(NULLIF(TRIM(v_pool.name), ''), 'Your Contest'),
         TRIM(p_message),
         p_pool_id,
         jsonb_build_object('pool_id', p_pool_id, 'kind', 'organizer_broadcast')
  FROM pool_members pm
  WHERE pm.pool_id = p_pool_id
    AND pm.status = 'active'
    AND pm.user_id <> v_caller_id;

  RETURN jsonb_build_object(
    'success', true,
    'recipients', v_recipient_count,
    'remaining_today', v_max_per_day - v_broadcasts_today - 1
  );
END;
$function$;
