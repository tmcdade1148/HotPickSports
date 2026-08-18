-- ============================================================================
-- Picks-open push + broadcast-to-Chirps mirror
-- Spec: 260818_HotPick_PicksOpenPushBroadcastChirps_Spec v1.1 (18 August 2026)
--
-- Two independent notification additions riding pipelines that already exist.
--
--   1. When a week's picks open, queue a push to every active member of every
--      live Contest in that competition. notification_queue already permits
--      'picks_deadline' and process-notification-queue already maps it — the
--      type has simply never received a row.
--
--   2. When a Gaffer broadcasts, mirror it into that Contest's Chirps feed so
--      members without push, or who never open Message Center, still see it.
--
-- ORDER MATTERS. validate_message_type() is extended FIRST. It is a BEFORE
-- INSERT trigger, not a CHECK constraint, and its allowed array does not
-- contain 'organizer_broadcast'. Mirror the broadcast before extending it and
-- the PERFORM raises, plpgsql propagates, and the ENTIRE broadcast_to_pool
-- transaction rolls back — no notification row, no pool_events row, no push.
-- A working feature would silently stop working. Same bug class as the missing
-- WEEK_PICKS_OPENED audit value on 11 August.
--
-- The whole migration is one transaction, so there is no window where one half
-- is live without the other. The ordering below is belt-and-braces.
--
-- Delivery: [BACKEND]. No client change, no OTA, no store resubmit.
--
-- NOTE for whoever reaches for docs/OPEN_WEEK_PICKS_GUARDS_ROLLBACK.md: that
-- script restores the PRE-GUARDS open_week_picks, which predates this file. It
-- would revert the four guards AND silently remove the picks-open push added
-- here. If the guards ever need rolling back after this migration, re-add the
-- PERFORM queue_picks_open_notifications line, or accept losing the push.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend the message_type gate. FIRST — see header.
--    Additive only: no CHECK constraint is added or removed, and no existing
--    type is touched. The search_path is reproduced exactly as production has
--    it; this function runs on every Chirp insert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_message_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  allowed_types text[] := ARRAY['user','system','pick_lock','score_update',
                                'week_result','welcome','organizer_broadcast'];
BEGIN
  IF NOT (NEW.message_type = ANY(allowed_types)) THEN
    RAISE EXCEPTION 'Invalid message_type: %', NEW.message_type;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Queue the picks-open push. One aggregated INSERT…SELECT, never a loop.
--
--    The pool predicate is `is_archived = false`, character for character the
--    predicate open_week_picks uses for its Chirp fan-out. That is the point:
--    the push and the Chirp must always reach the same set of Contests, and
--    the cheapest way to guarantee that is for the two predicates to be
--    literally identical. (is_archived is NOT NULL DEFAULT false, so there is
--    no NULL case to defend against.)
--
--    A member of three Contests gets three pushes, one per Contest, each
--    titled with that Contest's name — the name is the useful part.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_picks_open_notifications(
  p_competition text,
  p_week        int
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queued int;
BEGIN
  INSERT INTO notification_queue
    (user_id, notification_type, title, body, pool_id, data)
  SELECT pm.user_id,
         'picks_deadline',
         COALESCE(NULLIF(TRIM(p.name), ''), 'Your Contest'),
         'Week ' || p_week || ' picks are open. Make your move.',
         p.id,
         jsonb_build_object('pool_id', p.id, 'competition', p_competition,
                            'week', p_week, 'kind', 'picks_open')
  FROM pools p
  JOIN pool_members pm ON pm.pool_id = p.id AND pm.status = 'active'
  WHERE p.competition = p_competition
    AND p.is_archived = false;

  GET DIAGNOSTICS v_queued = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'queued', v_queued);
END;
$function$;

-- Internal helper: reached only from open_week_picks, which is SECURITY
-- DEFINER owned by postgres and therefore already holds EXECUTE. No client
-- ever calls this directly. Left grantable to PUBLIC it would let any
-- authenticated user queue a push to every member of any competition, so the
-- grants match _assert_week_ready — postgres + service_role, nothing else.
REVOKE ALL     ON FUNCTION public.queue_picks_open_notifications(text, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.queue_picks_open_notifications(text, int) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. open_week_picks — one added PERFORM, inside the existing IF v_freeze
--    branch, immediately after the Chirp post.
--
--    Edited against the 18 August definition (four server-side guards), not
--    pasted from an earlier snapshot. Same signature, so grants survive.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_week_picks(
  p_competition   text,
  p_expected_week integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public          -- GUARD D
AS $function$
DECLARE
  v_caller       uuid := auth.uid();
  v_is_super     boolean;
  v_current_week int;
  v_season_year  int;
  v_phase        text;
  v_freeze       boolean;
  v_week_state   text;
  v_already      int;
  v_frozen_n     int := 0;
  v_total        int := 0;
  v_audit        jsonb;
  v_audit_key    text;
  v_src          text := 'server_pencil';
  v_missing      int;
BEGIN
  SELECT is_super_admin INTO v_is_super FROM profiles WHERE id = v_caller;
  IF NOT COALESCE(v_is_super, false) THEN
    RAISE EXCEPTION 'Not authorized: super admin only' USING ERRCODE = '42501';
  END IF;

  SELECT (value #>> '{}')::int INTO v_current_week
    FROM competition_config WHERE competition = p_competition AND key = 'current_week';
  SELECT (value #>> '{}')::int INTO v_season_year
    FROM competition_config WHERE competition = p_competition AND key = 'season_year';
  IF v_current_week IS NULL OR v_season_year IS NULL THEN
    RAISE EXCEPTION 'Unknown or unconfigured competition: %', p_competition;
  END IF;

  -- GUARD A — week binding. The operator reviewed one week; refuse if the
  -- server has moved on between review and confirm. Skipped when the caller
  -- passes no expectation, which keeps the single-argument call site working.
  IF p_expected_week IS NOT NULL
     AND p_expected_week IS DISTINCT FROM v_current_week THEN
    RAISE EXCEPTION
      'WEEK_CHANGED: you confirmed week %, server current_week is now % - reload and re-confirm',
      p_expected_week, v_current_week
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE((value)::boolean, false) INTO v_freeze
    FROM competition_config WHERE competition = p_competition AND key = 'freeze_on_open';
  v_freeze := COALESCE(v_freeze, false);

  -- GUARD B — week state. Only an idle week may be opened. A live week cycles
  -- picks_open -> locked -> live -> settling -> complete and never returns to
  -- idle, so this cannot false-positive mid-season. 'complete' is deliberately
  -- NOT accepted: this function operates on current_week, and current_week in
  -- state 'complete' is the FINISHED week — accepting it would re-open it.
  -- Under freeze_on_open, admin_advance_week lands the new week in 'idle'.
  IF v_freeze THEN
    SELECT value #>> '{}' INTO v_week_state
      FROM competition_config WHERE competition = p_competition AND key = 'week_state';

    IF COALESCE(v_week_state, '') <> 'idle' THEN
      RAISE EXCEPTION
        'WRONG_STATE: % week % is "%" - only an idle week can be opened',
        p_competition, v_current_week, COALESCE(v_week_state, '(unset)')
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT sg.phase INTO v_phase
    FROM season_games sg
   WHERE sg.competition = p_competition AND sg.season_year = v_season_year AND sg.week = v_current_week
   GROUP BY sg.phase ORDER BY count(*) DESC, sg.phase ASC LIMIT 1;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'NO_PHASE: no games for % season % week %', p_competition, v_season_year, v_current_week
      USING ERRCODE = '23514';
  END IF;

  -- GUARD C — already frozen. frozen_rank is immutable once written (Hard Rule
  -- #6); this is that rule enforced at the open boundary. Phase-scoped, so it
  -- sits after the dominant phase is derived. This is also what makes the push
  -- below safe to queue unguarded — a second open never gets this far.
  IF v_freeze THEN
    SELECT count(*) INTO v_already
      FROM season_games
     WHERE competition  = p_competition
       AND season_year  = v_season_year
       AND week         = v_current_week
       AND phase        = v_phase
       AND frozen_rank IS NOT NULL;

    IF v_already > 0 THEN
      RAISE EXCEPTION
        'ALREADY_FROZEN: % of the games in % week % (%) already have a frozen rank - this week has been opened',
        v_already, p_competition, v_current_week, v_phase
        USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM _assert_week_ready(p_competition, v_current_week);

  IF v_freeze THEN
    v_audit_key := p_competition || '_' || v_phase || '_w' || v_current_week;
    SELECT value INTO v_audit FROM competition_config
      WHERE competition = 'rank_audit' AND key = v_audit_key LIMIT 1;

    IF v_audit IS NULL OR jsonb_array_length(COALESCE(v_audit->'rows','[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'NO_CONSENSUS: no consensus ranking (%) — run the consensus job before opening', v_audit_key
        USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO v_total FROM season_games
     WHERE competition = p_competition AND season_year = v_season_year
       AND week = v_current_week AND phase = v_phase;

    SELECT count(*) INTO v_missing
      FROM season_games sg
     WHERE sg.competition = p_competition AND sg.season_year = v_season_year
       AND sg.week = v_current_week AND sg.phase = v_phase
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_audit->'rows') r
          WHERE r->>'game_id' = sg.game_id AND (r->>'consensus_rank') IS NOT NULL);
    IF v_missing > 0 THEN
      RAISE EXCEPTION 'CONSENSUS_INCOMPLETE: % of % games have no consensus rank', v_missing, v_total
        USING ERRCODE = '23514';
    END IF;

    UPDATE season_games sg
       SET frozen_rank = (r->>'consensus_rank')::int,
           rank        = (r->>'consensus_rank')::int
      FROM jsonb_array_elements(v_audit->'rows') r
     WHERE sg.competition = p_competition AND sg.season_year = v_season_year
       AND sg.week = v_current_week AND sg.phase = v_phase
       AND r->>'game_id' = sg.game_id;
    GET DIAGNOSTICS v_frozen_n = ROW_COUNT;
    v_src := 'consensus_median';

    -- Permanent record of exactly what was frozen against. The recurring
    -- consensus job overwrites the competition_config audit row, so without
    -- this the evidence is lost within hours.
    INSERT INTO public.rank_freeze_snapshot
      (competition, season_year, week, phase, frozen_by, freeze_source,
       consensus_computed_at, games, rows)
    VALUES (p_competition, v_season_year, v_current_week, v_phase, v_caller, v_src,
            (v_audit->>'computed_at')::timestamptz, v_frozen_n, v_audit->'rows')
    ON CONFLICT (competition, season_year, week, phase) DO NOTHING;
  END IF;

  IF p_competition <> 'nfl_2025_sim' THEN
    INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
    VALUES (v_caller, 'WEEK_PICKS_OPENED', 'competition_config', v_caller,
            jsonb_build_object('competition', p_competition, 'week', v_current_week,
                               'phase', v_phase, 'ranks_frozen', v_frozen_n,
                               'freeze_source', v_src, 'audit_key', v_audit_key,
                               'consensus_computed_at', v_audit->>'computed_at'));
  END IF;

  UPDATE competition_config SET value = to_jsonb('picks_open'::text)
    WHERE competition = p_competition AND key = 'week_state';
  UPDATE competition_config SET value = to_jsonb(false)
    WHERE competition = p_competition AND key = 'picks_locked';
  UPDATE season_games SET lock_at = kickoff_at
    WHERE competition = p_competition AND season_year = v_season_year
      AND week = v_current_week AND phase = v_phase;

  IF v_freeze THEN
    PERFORM post_system_message(p.id,
      'Week ' || v_current_week || ' picks are open. Make your move.', 'pick_lock')
    FROM pools p WHERE p.competition = p_competition AND p.is_archived = false;

    -- NEW: queue the matching push to every active member of those Contests.
    -- Same IF v_freeze gate as the Chirp, so the nfl_2025_sim App Review
    -- sandbox and the demo competition are untouched. Guard C above is what
    -- prevents this running twice for one week — no idempotency guard needed
    -- here, because a second open raises before it ever reaches this line.
    PERFORM queue_picks_open_notifications(p_competition, v_current_week);
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'competition', p_competition, 'week', v_current_week,
    'phase', v_phase, 'ranks_frozen', v_frozen_n, 'freeze_source', v_src,
    'consensus_computed_at', v_audit->>'computed_at', 'week_state', 'picks_open');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. broadcast_to_pool — one added PERFORM before the final RETURN.
--    Edited against the live definition; all three explanatory comments
--    (Hard Rule #18 fix, push-title note, queue-CHECK note) are preserved.
--    Same signature, so grants survive.
-- ---------------------------------------------------------------------------
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

  -- NEW (2026-08-18): mirror the broadcast into Chirps so members without push,
  -- or who don't check Message Center, still see it where they're already
  -- looking. Renders like any system post — SmackTalkScreen branches on
  -- user_id IS NULL, not on message_type. Requires 'organizer_broadcast' in
  -- validate_message_type(), extended at the top of this migration.
  PERFORM post_system_message(p_pool_id, TRIM(p_message), 'organizer_broadcast');

  RETURN jsonb_build_object(
    'success', true,
    'recipients', v_recipient_count,
    'remaining_today', v_max_per_day - v_broadcasts_today - 1
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
