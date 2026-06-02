-- Production wiring for the regular-season winner Chirps announcement.
-- There is no code path that sets current_phase (phases are admin-initiated,
-- flipped manually), so hook directly onto the data change: when a
-- competition's current_phase transitions INTO 'REGULAR_COMPLETE', post each
-- pool's winner to its Chirps feed. Mirrors the nfl-announce-regular-winners
-- Edge Function (kept as a manual backfill tool). Idempotent + error-safe so a
-- hiccup can never block the phase transition itself.
CREATE OR REPLACE FUNCTION public.announce_regular_winners_on_phase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pool       RECORD;
  v_start_week int;
  v_winner_id  uuid;
  v_winner_nm  text;
  v_winner_pts numeric;
BEGIN
  -- Only act on a true transition INTO REGULAR_COMPLETE.
  IF (NEW.value #>> '{}') IS DISTINCT FROM 'REGULAR_COMPLETE' THEN
    RETURN NEW;
  END IF;
  IF (OLD.value #>> '{}') = 'REGULAR_COMPLETE' THEN
    RETURN NEW; -- already there; don't re-announce
  END IF;

  FOR v_pool IN
    SELECT id, pool_start_date FROM pools
    WHERE competition = NEW.competition AND is_archived = false
  LOOP
    BEGIN
      -- Idempotency: skip pools already announced.
      IF EXISTS (
        SELECT 1 FROM smack_messages
        WHERE pool_id = v_pool.id AND message_type = 'regular_season_winner'
      ) THEN
        CONTINUE;
      END IF;

      -- First week on/after the pool's start date (mid-season pools start later).
      v_start_week := 1;
      IF v_pool.pool_start_date IS NOT NULL THEN
        SELECT week INTO v_start_week FROM season_games
        WHERE competition = NEW.competition AND kickoff_at >= v_pool.pool_start_date
        ORDER BY kickoff_at ASC LIMIT 1;
        IF v_start_week IS NULL THEN v_start_week := 1; END IF;
      END IF;

      -- Winner = top regular-season points among active members; ties A→Z.
      WITH agg AS (
        SELECT t.user_id, SUM(t.week_points) AS pts
        FROM season_user_totals t
        JOIN pool_members m
          ON m.user_id = t.user_id AND m.pool_id = v_pool.id AND m.status = 'active'
        WHERE t.competition = NEW.competition
          AND t.phase = 'REGULAR'
          AND t.week >= v_start_week
        GROUP BY t.user_id
      )
      SELECT a.user_id,
             COALESCE(
               p.poolie_name,
               CASE WHEN p.first_name IS NOT NULL
                    THEN p.first_name || CASE WHEN p.last_name IS NOT NULL
                                              THEN ' ' || left(p.last_name, 1) || '.' ELSE '' END
                    ELSE 'A player' END),
             a.pts
        INTO v_winner_id, v_winner_nm, v_winner_pts
      FROM agg a
      LEFT JOIN profiles p ON p.id = a.user_id
      ORDER BY a.pts DESC,
               lower(COALESCE(p.poolie_name, p.first_name, 'a player')) ASC
      LIMIT 1;

      IF v_winner_id IS NULL THEN
        CONTINUE; -- no scored members in this pool
      END IF;

      PERFORM post_system_message(
        v_pool.id,
        '🏆 Regular season''s in the books! ' || v_winner_nm ||
        ' takes the crown with ' || v_winner_pts::text ||
        ' pts. The playoff board resets now — everyone starts fresh.',
        'regular_season_winner'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Never let an announcement error block the phase transition.
      RAISE WARNING 'announce_regular_winners: pool % failed: %', v_pool.id, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_announce_regular_winners ON public.competition_config;
CREATE TRIGGER trg_announce_regular_winners
AFTER UPDATE ON public.competition_config
FOR EACH ROW
WHEN (NEW.key = 'current_phase')
EXECUTE FUNCTION public.announce_regular_winners_on_phase();
