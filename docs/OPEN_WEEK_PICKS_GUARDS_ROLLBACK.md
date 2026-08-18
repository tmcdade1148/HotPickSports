# Rollback — `open_week_picks` server-side guards

Migration: `supabase/migrations/20260818120000_open_week_picks_server_side_guards.sql`
Applied: 18 August 2026 · Supabase `mzqtrpdiqhopjmxjccwy`

The migration changes two function definitions and no data. There is no data
path to restore, so the meaningful rollback is the pre-change definition of
`open_week_picks`, captured verbatim below before the change was applied.

**Use this only if a guard is refusing an open that must proceed and the cause
cannot be corrected at the source** (i.e. by setting `week_state` back to
`idle`, or by clearing an erroneous `frozen_rank`). Correcting the state is
almost always the right move — the guard refusing is the guard working.

Rolling back also removes the `p_expected_week` parameter, so the Cowork
console's `WEEK_CHANGED` binding is lost with it.

---

## Restore the previous `open_week_picks`

Run as a single statement block (it drops the guarded two-argument signature and
recreates the original one-argument version, then restores its grants).

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.open_week_picks(p_competition text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller       uuid := auth.uid();
  v_is_super     boolean;
  v_current_week int;
  v_season_year  int;
  v_phase        text;
  v_freeze       boolean;
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

  SELECT COALESCE((value)::boolean, false) INTO v_freeze
    FROM competition_config WHERE competition = p_competition AND key = 'freeze_on_open';
  v_freeze := COALESCE(v_freeze, false);

  SELECT sg.phase INTO v_phase
    FROM season_games sg
   WHERE sg.competition = p_competition AND sg.season_year = v_season_year AND sg.week = v_current_week
   GROUP BY sg.phase ORDER BY count(*) DESC, sg.phase ASC LIMIT 1;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'NO_PHASE: no games for % season % week %', p_competition, v_season_year, v_current_week
      USING ERRCODE = '23514';
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

DROP FUNCTION IF EXISTS public.open_week_picks(p_competition text, p_expected_week integer);

REVOKE ALL     ON FUNCTION public.open_week_picks(p_competition text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.open_week_picks(p_competition text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
```

## The `rpc_join_pool_by_code` pin

Not worth rolling back. The migration adds `search_path=public` to
`rpc_join_pool_by_code(text, uuid)` and changes nothing else about it; its
sibling overload has carried the same pin since June. If it ever must come off:

```sql
ALTER FUNCTION public.rpc_join_pool_by_code(p_invite_code text, p_invited_by_id uuid)
  RESET search_path;
```
