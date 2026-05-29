-- Import nfl_2026 regular-season schedule (weeks 1-18) from ESPN.
-- Mirrors the nfl-import-schedule Edge Function's row shape but
-- runs entirely from inside Postgres via the `http` extension since
-- our sandbox can't reach Supabase functions directly. Idempotent
-- via ON CONFLICT (game_id).
--
-- frozen_rank + rank left NULL; nfl-rank-games can fill them in
-- later when we're ready to use HotPick scoring on this competition.

DO $$
DECLARE
  v_week        int;
  v_url         text;
  v_body        jsonb;
  v_event       jsonb;
  v_comp        jsonb;
  v_competitor  jsonb;
  v_home        jsonb;
  v_away        jsonb;
  v_odds        jsonb;
  v_status_name text;
  v_status      text;
  v_details     text;
  v_spread_txt  text;
BEGIN
  FOR v_week IN 1..18 LOOP
    v_url := format(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=%s&dates=2026',
      v_week
    );

    SELECT (http_get(v_url)).content::jsonb INTO v_body;

    FOR v_event IN SELECT * FROM jsonb_array_elements(v_body -> 'events') LOOP
      v_comp := v_event -> 'competitions' -> 0;
      v_home := NULL;
      v_away := NULL;

      FOR v_competitor IN SELECT * FROM jsonb_array_elements(v_comp -> 'competitors') LOOP
        IF v_competitor ->> 'homeAway' = 'home' THEN v_home := v_competitor;
        ELSE                                          v_away := v_competitor;
        END IF;
      END LOOP;

      v_odds := v_comp -> 'odds' -> 0;
      v_status_name := COALESCE(v_comp -> 'status' -> 'type' ->> 'name', '');
      v_status := CASE
        WHEN v_status_name LIKE '%FINAL%'    THEN 'FINAL'
        WHEN v_status_name LIKE '%PROGRESS%' THEN 'IN_PROGRESS'
        WHEN v_status_name = 'IN'            THEN 'IN_PROGRESS'
        ELSE 'SCHEDULED'
      END;

      -- ESPN 'details' looks like 'SEA -3.5' / 'KC -7' / 'EVEN'.
      v_details := v_odds ->> 'details';
      v_spread_txt := substring(v_details FROM '-?\d+(\.\d+)?');

      INSERT INTO public.season_games AS sg (
        game_id, competition, season_year, week, phase,
        home_team, away_team, kickoff_at, status,
        home_score, away_score,
        home_record, away_record,
        spread, home_moneyline, away_moneyline,
        is_finalized
      ) VALUES (
        v_event ->> 'id', 'nfl_2026', 2026, v_week, 'REGULAR',
        v_home -> 'team' ->> 'abbreviation',
        v_away -> 'team' ->> 'abbreviation',
        (v_event ->> 'date')::timestamptz,
        v_status,
        NULLIF(v_home ->> 'score','')::int,
        NULLIF(v_away ->> 'score','')::int,
        v_home -> 'records' -> 0 ->> 'summary',
        v_away -> 'records' -> 0 ->> 'summary',
        NULLIF(v_spread_txt,'')::numeric,
        NULLIF(v_odds -> 'homeTeamOdds' ->> 'moneyLine','')::int,
        NULLIF(v_odds -> 'awayTeamOdds' ->> 'moneyLine','')::int,
        false
      )
      ON CONFLICT (game_id) DO UPDATE
        SET competition    = EXCLUDED.competition,
            season_year    = EXCLUDED.season_year,
            week           = EXCLUDED.week,
            phase          = EXCLUDED.phase,
            home_team      = EXCLUDED.home_team,
            away_team      = EXCLUDED.away_team,
            kickoff_at     = EXCLUDED.kickoff_at,
            status         = EXCLUDED.status,
            home_score     = EXCLUDED.home_score,
            away_score     = EXCLUDED.away_score,
            home_record    = EXCLUDED.home_record,
            away_record    = EXCLUDED.away_record,
            spread         = EXCLUDED.spread,
            home_moneyline = EXCLUDED.home_moneyline,
            away_moneyline = EXCLUDED.away_moneyline,
            updated_at     = now();
    END LOOP;
  END LOOP;
END $$;
