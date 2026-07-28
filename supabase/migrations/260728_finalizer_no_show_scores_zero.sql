-- ---------------------------------------------------------------------------
-- A missed week scores ZERO, not a penalty.
-- Spec: 260728_HotPick_MissedWeekZero_Spec v2, Part A.
--
-- finalize_week_for_all_users is the OWNER of no-show rows. It is live:
--   nfl-finalize-week (Edge Fn) → finalize_latest_completed_week → this.
-- The scorer (nfl-calculate-scores) never writes these rows at all — it builds
-- its aggregate from season_picks, and a no-show player has none. So this is the
-- only place the rule can live, and adding a second writer in the Edge Function
-- would just be overwritten here by DO UPDATE SET week_points = EXCLUDED...
--
-- FOUR targeted corrections. The function's shape is right and is not
-- restructured; everything not listed below is byte-identical to the live
-- definition (pg_get_functiondef, 2026-07-28).
--
--   A1  Penalty → 0. It computed -MIN(COALESCE(frozen_rank, rank)), i.e. −1
--       (ranks start at 1), and wrote that as week_points. Live evidence: all 88
--       no-show rows in nfl_2026_pre sit at −1. Zero is not a penalty and not
--       negative. playoff_points took the same penalty for weeks 19–22 and is
--       zeroed with it. v_penalty_score and its query are REMOVED — nothing else
--       read them (only the startup NOTICE and this INSERT).
--
--   A2  Filter the roster by competition. The loop joined pools with no
--       p.competition = p_competition, so a member of ANY Contest in ANY
--       competition got a row written for whichever competition was being
--       finalized.
--
--   A3  Exclude super-admins, matching the hidden-member rule in
--       compute_pool_standings (20260627165654_tie_handling_standings.sql:97).
--
--   A4  Zeros begin when the player begins. A zero row is written only if the
--       player had an active membership on or before the week STARTED — first
--       kickoff, MIN(kickoff_at), the same boundary the pick lock uses
--       (get_week_lock_time / weekLock.ts). Someone joining in week 12 gets
--       nothing for weeks 1–11: absence is not failure, and eleven empty weeks
--       would read as a losing streak they never had.
--
--       The gate guards the NO-SHOW branch ONLY, never the scoring branch. Picks
--       are user+competition scoped, not pool scoped, so a player can hold picks
--       for a week predating their current membership (they were in another
--       Contest, or rejoined). Gating the whole loop would silently stop scoring
--       those real picks. If the week cannot be dated (MIN(kickoff_at) IS NULL)
--       the gate is skipped rather than excluding everyone.
--
-- THE MOAT: pool_members is read to determine WHO should have played. Nothing
-- pool-scoped is written to season_user_totals — it has no pool_id and gains
-- none here (Hard Rule #2).
--
-- NOT fixed here (deferred to September, its own spec): upsert_season_week_scores
-- overwrites phase with the current config phase on conflict, which can move a
-- week between the regular-season and playoff buckets.
--
-- Signature, LANGUAGE, and SET search_path are unchanged, so CREATE OR REPLACE
-- preserves existing grants. Note this function is deliberately NOT SECURITY
-- DEFINER — do not add it.
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
    v_week_start TIMESTAMPTZ;   -- A1/A4: replaces v_penalty_score
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

    -- A4: when the week STARTED — first kickoff. A player who joined after this
    -- could not have picked, so they get no row. Same boundary as the pick lock.
    SELECT MIN(kickoff_at) INTO v_week_start
    FROM season_games
    WHERE competition = p_competition
      AND season_year = p_season_year
      AND week = p_week;

    RAISE NOTICE '📌 Competition: %, Week: %, Phase: %, Week start: %',
        p_competition, p_week, v_phase, v_week_start;

    -- Process every active member OF THIS COMPETITION (A2), super-admins
    -- excluded (A3). first_joined_at is the earliest qualifying membership,
    -- used by the no-show gate below (A4).
    FOR v_user IN
        SELECT pm.user_id, MIN(pm.joined_at) AS first_joined_at
        FROM pool_members pm
        JOIN pools p ON p.id = pm.pool_id
        JOIN profiles pr ON pr.id = pm.user_id
        WHERE pm.status = 'active'
          AND (p.is_archived = false OR p.is_archived IS NULL)
          AND p.competition = p_competition
          AND NOT COALESCE(pr.is_super_admin, false)
        GROUP BY pm.user_id
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

            -- NO-SHOW: score ZERO
            IF NOT v_has_picks THEN
                -- A4: they weren't here yet — no row at all, not a zero.
                IF v_week_start IS NOT NULL AND v_user.first_joined_at > v_week_start THEN
                    RAISE NOTICE '⏭️  Joined after week % started — no row for user %',
                        p_week, substring(v_user.user_id::text from 1 for 8);
                    CONTINUE;
                END IF;

                RAISE NOTICE '⚠️  No-show: user % week % — scoring 0',
                    substring(v_user.user_id::text from 1 for 8), p_week;

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
                    0,   -- A1: a missed week is ZERO, never a penalty
                    0,   -- A1: and zero in the playoff bucket too (weeks 19–22)
                    0, 0,
                    NULL, NULL,   -- T1-2: no HotPick made → is_hotpick_correct is NULL, not false
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
                    -- T1-2: NULL when the user made no HotPick this week (matches
                    -- the live scorer); true/false only when a HotPick was made.
                    CASE WHEN BOOL_OR(is_hotpick)
                         THEN BOOL_OR(is_hotpick AND points > 0)
                         ELSE NULL END                                          AS is_hotpick_correct,
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
                ws.is_hotpick_correct,   -- T1-2: keep NULL for no-HotPick (was COALESCE(..., false))
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
