-- ============================================================================
-- open_week_picks — server-side guards
-- Spec: 260818_HotPick_OpenWeekPicksGuards_Spec v1.0 (18 August 2026)
--
-- open_week_picks() converts provisional ranks into permanent ones and starts
-- the week for every Player. Until now the rules that stop it running on a week
-- already in flight lived in a browser console, not in the database. Nothing at
-- the data layer refused an open on a week that was already picks_open, locked,
-- live, or already frozen.
--
-- This moves those checks into the function, where every caller inherits them.
-- The logic is not new — A, B and C are ported from the console, which has run
-- every production open to date. This changes their location, not their rules.
--
--   Guard A  week binding    refuse if current_week moved since the operator
--                            confirmed (skipped when p_expected_week is NULL)
--   Guard B  week state      refuse unless the week is idle   [freeze_on_open]
--   Guard C  already frozen  refuse if any game in the phase already carries a
--                            frozen_rank                      [freeze_on_open]
--   Guard D  search_path     SECURITY DEFINER hygiene, previously missing
--
-- B and C gate on competition_config.freeze_on_open, exactly as nfl-rank-games
-- v27 does. Legacy competitions (nfl_2025_sim, demo) have frozen_rank written on
-- a timer, so it is already set before open; an unconditional Guard C would
-- break the App Review sandbox.
--
-- Every guard raises before any write. On a refusal nothing is frozen,
-- snapshotted, audited, unlocked or announced.
--
-- WHY DROP + CREATE, NOT CREATE OR REPLACE
-- Adding a defaulted parameter with REPLACE does not replace the function — it
-- creates a second overload, and the admin screen's call then fails as "function
-- is not unique". The one-argument signature must be dropped. DROP also discards
-- the grants, so they are re-issued below: a freshly created function grants
-- EXECUTE to PUBLIC, which would regress 20260608153000.
--
-- The new signature is created BEFORE the old one is dropped, so a failure
-- anywhere in this transaction leaves the existing function untouched.
--
-- Delivery: [BACKEND]. One migration. No app release, no OTA, no store resubmit.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The guarded function.
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
  -- sits after the dominant phase is derived.
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
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'competition', p_competition, 'week', v_current_week,
    'phase', v_phase, 'ranks_frozen', v_frozen_n, 'freeze_source', v_src,
    'consensus_computed_at', v_audit->>'computed_at', 'week_state', 'picks_open');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Retire the one-argument signature. Explicit argument list, so this is
--    unambiguous while both overloads momentarily exist inside this
--    transaction. No caller ever observes both.
--
--    IF EXISTS because this is the only non-idempotent statement in the file:
--    everything else here is CREATE OR REPLACE / REVOKE / GRANT / ALTER / NOTIFY
--    and re-runs clean. Once the one-argument signature is gone, a replay
--    without it aborts the whole transaction on "function does not exist".
--    DROP FUNCTION matches on argument TYPES, not parameter names, so this
--    cannot silently miss the target over a rename.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.open_week_picks(p_competition text);

-- ---------------------------------------------------------------------------
-- 3. Restore the grants DROP discarded. Must match 20260608153000 exactly:
--    postgres, authenticated, service_role — never PUBLIC, never anon.
-- ---------------------------------------------------------------------------
REVOKE ALL    ON FUNCTION public.open_week_picks(p_competition text, p_expected_week integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.open_week_picks(p_competition text, p_expected_week integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. GUARD D, elsewhere — rpc_join_pool_by_code(text, uuid) lost its
--    search_path pin when 20260811142739 rewrote it; its sibling overload
--    (uuid, text) still has one. Restore the pin only. The body is not
--    modified and 20260811142739 is not reverted.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.rpc_join_pool_by_code(p_invite_code text, p_invited_by_id uuid)
  SET search_path = public;

-- PostgREST caches the function signature; the admin screen calls this by name.
NOTIFY pgrst, 'reload schema';

COMMIT;
