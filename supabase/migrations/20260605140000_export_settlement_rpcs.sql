-- export_settlement_rpcs
--
-- Checkpoints the week-settlement RPCs into source control. These were
-- deployed directly (not via a migration), so they were invisible to git and
-- to review — a deployment-rule gap flagged by the scoring review. This file
-- is the EXACT deployed definition (no behavior change), captured via
-- pg_get_functiondef so the repo and DB agree and future edits are reviewable.
--
-- Hard Rule #6 note (verified here): finalize_week_for_all_users only READS
-- frozen_rank via COALESCE(frozen_rank, rank) and never overwrites it, so
-- frozen-rank immutability holds at settlement.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_week_for_all_users(p_competition text, p_season_year integer, p_week integer)
 RETURNS TABLE(users_processed integer, errors_count integer, error_details text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user RECORD;
    v_processed INT := 0;
    v_errors INT := 0;
    v_error_messages TEXT[];
    v_has_picks BOOLEAN;
    v_total_games INT;
    v_final_games INT;
    v_penalty_score INT;
    v_phase TEXT;
BEGIN
    -- Safety check: ALL games must be FINAL
    SELECT COUNT(*) INTO v_total_games
    FROM season_games
    WHERE competition = p_competition
      AND season_year = p_season_year
      AND week = p_week;

    SELECT COUNT(*) INTO v_final_games
    FROM season_games
    WHERE competition = p_competition
      AND season_year = p_season_year
      AND week = p_week
      AND status ILIKE '%FINAL%'
      AND home_score IS NOT NULL
      AND away_score IS NOT NULL;

    IF v_total_games = 0 THEN
        RAISE EXCEPTION 'No games found for competition % season % week %', p_competition, p_season_year, p_week;
    END IF;

    IF v_final_games < v_total_games THEN
        RAISE EXCEPTION 'SAFETY CHECK FAILED: Only % of % games are FINAL for % week %', v_final_games, v_total_games, p_competition, p_week;
    END IF;

    -- Determine phase from competition_config
    SELECT value::text INTO v_phase
    FROM competition_config
    WHERE competition = p_competition
      AND key = 'current_phase';

    v_phase := COALESCE(
        TRIM('"' FROM v_phase),
        CASE
            WHEN p_week = 19 THEN 'WILDCARD'
            WHEN p_week = 20 THEN 'DIVISIONAL'
            WHEN p_week = 21 THEN 'CONFERENCE'
            WHEN p_week = 22 THEN 'SUPERBOWL'
            ELSE 'REGULAR'
        END
    );

    -- No-show penalty = negative of the lowest rank game this week
    SELECT COALESCE(-MIN(COALESCE(frozen_rank, rank)), -1) INTO v_penalty_score
    FROM season_games
    WHERE competition = p_competition
      AND season_year = p_season_year
      AND week = p_week;

    RAISE NOTICE '📌 Competition: %, Week: %, Phase: %, No-show penalty: %',
        p_competition, p_week, v_phase, v_penalty_score;

    -- Process every active pool member
    FOR v_user IN
        SELECT DISTINCT pm.user_id
        FROM pool_members pm
        JOIN pools p ON p.id = pm.pool_id
        WHERE pm.status = 'active'
          AND (p.is_archived = false OR p.is_archived IS NULL)
    LOOP
        BEGIN
            -- Does this user have any picks this week?
            SELECT EXISTS(
                SELECT 1 FROM season_picks sp
                WHERE sp.user_id = v_user.user_id
                  AND sp.competition = p_competition
                  AND sp.season_year = p_season_year
                  AND sp.week = p_week
            ) INTO v_has_picks;

            -- NO-SHOW: apply penalty
            IF NOT v_has_picks THEN
                RAISE NOTICE '⚠️  No-show: user % week % — applying penalty %',
                    substring(v_user.user_id::text from 1 for 8), p_week, v_penalty_score;

                INSERT INTO season_user_totals (
                    user_id, competition, season_year, week, phase,
                    week_points, playoff_points,
                    correct_picks, total_picks,
                    is_hotpick_correct, hotpick_rank,
                    is_no_show,
                    double_down_used, double_down_delta,
                    mulligan_used, scored_at
                ) VALUES (
                    v_user.user_id, p_competition, p_season_year, p_week, v_phase,
                    v_penalty_score,
                    CASE WHEN p_week BETWEEN 19 AND 22 THEN v_penalty_score ELSE 0 END,
                    0, 0,
                    false, NULL,
                    true,
                    false, 0,
                    false, NOW()
                )
                ON CONFLICT (user_id, competition, season_year, week)
                DO UPDATE SET
                    week_points       = EXCLUDED.week_points,
                    playoff_points    = EXCLUDED.playoff_points,
                    is_no_show        = EXCLUDED.is_no_show,
                    phase             = EXCLUDED.phase,
                    scored_at         = NOW();

                v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- USER HAS PICKS — score them (pool-agnostic)
            WITH user_picks AS (
                SELECT DISTINCT ON (sp.game_id)
                    sp.game_id,
                    sp.picked_team,
                    sp.is_hotpick,
                    sp.power_up
                FROM season_picks sp
                WHERE sp.user_id = v_user.user_id
                  AND sp.competition = p_competition
                  AND sp.season_year = p_season_year
                  AND sp.week = p_week
                ORDER BY sp.game_id, sp.created_at DESC
            ),
            game_results AS (
                SELECT
                    sg.game_id,
                    COALESCE(sg.frozen_rank, sg.rank) AS rank,
                    sg.winner_team,
                    (sg.status ILIKE '%FINAL%'
                        AND sg.home_score IS NOT NULL
                        AND sg.away_score IS NOT NULL
                        AND sg.home_score != sg.away_score
                    ) AS is_final
                FROM season_games sg
                WHERE sg.competition = p_competition
                  AND sg.season_year = p_season_year
                  AND sg.week = p_week
            ),
            scored_picks AS (
                SELECT
                    up.is_hotpick,
                    up.power_up,
                    gr.rank,
                    CASE
                        WHEN NOT gr.is_final                                        THEN 0
                        WHEN up.is_hotpick AND up.picked_team = gr.winner_team
                             AND up.power_up = 'double_down'                        THEN gr.rank * 2
                        WHEN up.is_hotpick AND up.picked_team = gr.winner_team      THEN gr.rank
                        WHEN up.is_hotpick AND up.picked_team != gr.winner_team     THEN -gr.rank
                        WHEN up.picked_team = gr.winner_team                        THEN 1
                        ELSE 0
                    END AS points,
                    CASE WHEN gr.is_final AND up.picked_team = gr.winner_team
                         THEN 1 ELSE 0 END AS is_correct,
                    CASE WHEN up.is_hotpick AND up.picked_team = gr.winner_team
                              AND up.power_up = 'double_down'
                         THEN gr.rank ELSE 0 END AS dd_delta
                FROM user_picks up
                JOIN game_results gr ON up.game_id = gr.game_id
            ),
            week_summary AS (
                SELECT
                    COALESCE(SUM(points), 0)                                    AS week_points,
                    COALESCE(SUM(is_correct), 0)                                AS correct_picks,
                    COUNT(*)                                                     AS total_picks,
                    BOOL_OR(is_hotpick AND points > 0)                          AS is_hotpick_correct,
                    MAX(CASE WHEN is_hotpick THEN rank END)                     AS hotpick_rank,
                    BOOL_OR(power_up = 'double_down')                           AS double_down_used,
                    COALESCE(SUM(dd_delta), 0)                                  AS double_down_delta,
                    BOOL_OR(power_up = 'mulligan')                              AS mulligan_used
                FROM scored_picks
            )
            INSERT INTO season_user_totals (
                user_id, competition, season_year, week, phase,
                week_points, playoff_points,
                correct_picks, total_picks,
                is_hotpick_correct, hotpick_rank,
                is_no_show,
                double_down_used, double_down_delta,
                mulligan_used, scored_at
            )
            SELECT
                v_user.user_id, p_competition, p_season_year, p_week, v_phase,
                ws.week_points,
                CASE WHEN p_week BETWEEN 19 AND 22 THEN ws.week_points ELSE 0 END,
                ws.correct_picks::int, ws.total_picks::int,
                COALESCE(ws.is_hotpick_correct, false),
                ws.hotpick_rank,
                false,
                COALESCE(ws.double_down_used, false), ws.double_down_delta::int,
                COALESCE(ws.mulligan_used, false), NOW()
            FROM week_summary ws
            ON CONFLICT (user_id, competition, season_year, week)
            DO UPDATE SET
                week_points        = EXCLUDED.week_points,
                playoff_points     = EXCLUDED.playoff_points,
                correct_picks      = EXCLUDED.correct_picks,
                total_picks        = EXCLUDED.total_picks,
                is_hotpick_correct = EXCLUDED.is_hotpick_correct,
                hotpick_rank       = EXCLUDED.hotpick_rank,
                phase              = EXCLUDED.phase,
                is_no_show         = EXCLUDED.is_no_show,
                double_down_used   = EXCLUDED.double_down_used,
                double_down_delta  = EXCLUDED.double_down_delta,
                mulligan_used      = EXCLUDED.mulligan_used,
                scored_at          = NOW();

            v_processed := v_processed + 1;
            RAISE NOTICE '✅ Scored user %', substring(v_user.user_id::text from 1 for 8);

        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors + 1;
            v_error_messages := array_append(v_error_messages,
                format('User %s: %s', substring(v_user.user_id::text from 1 for 8), SQLERRM));
            RAISE NOTICE '❌ Error user %: %', substring(v_user.user_id::text from 1 for 8), SQLERRM;
        END;
    END LOOP;

    users_processed := v_processed;
    errors_count    := v_errors;
    error_details   := array_to_string(v_error_messages, ' | ');
    RETURN NEXT;

    RAISE NOTICE '✅ Finalization complete: % processed, % errors', v_processed, v_errors;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_latest_completed_week(p_competition text DEFAULT 'nfl_2026'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_season_year INT;
    v_week        INT;
    v_result      TEXT;
BEGIN
    -- Get season_year from competition_config
    SELECT (value::text)::int INTO v_season_year
    FROM competition_config
    WHERE competition = p_competition
      AND key = 'season_year';

    IF v_season_year IS NULL THEN
        RETURN format('ERROR: No season_year found in competition_config for %s', p_competition);
    END IF;

    -- Find the most recent week where:
    --   a) every game has FINAL status and kickoff has passed
    --   b) at least one game still has is_finalized = false  (i.e. not yet processed)
    SELECT MAX(sg.week) INTO v_week
    FROM season_games sg
    WHERE sg.competition  = p_competition
      AND sg.season_year  = v_season_year
      AND sg.kickoff_at   < NOW()
      AND NOT EXISTS (
          SELECT 1 FROM season_games sg_check
          WHERE sg_check.competition = p_competition
            AND sg_check.season_year = v_season_year
            AND sg_check.week        = sg.week
            AND sg_check.status NOT ILIKE '%FINAL%'
      )
      AND EXISTS (
          SELECT 1 FROM season_games sg_pending
          WHERE sg_pending.competition  = p_competition
            AND sg_pending.season_year  = v_season_year
            AND sg_pending.week         = sg.week
            AND sg_pending.is_finalized = false
      );

    IF v_week IS NULL THEN
        RETURN 'No completed unfinalized week found';
    END IF;

    RAISE NOTICE 'Auto-finalizing % season % week %', p_competition, v_season_year, v_week;

    PERFORM finalize_week_for_all_users(p_competition, v_season_year, v_week);

    -- Mark all games in this week as finalized
    UPDATE season_games
    SET is_finalized = true
    WHERE competition  = p_competition
      AND season_year  = v_season_year
      AND week         = v_week;

    v_result := format('Finalized %s season %s week %s', p_competition, v_season_year, v_week);
    RETURN v_result;
END;
$function$;
