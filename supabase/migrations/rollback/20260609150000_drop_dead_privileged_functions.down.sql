-- =====================================================================
-- MANUAL ROLLBACK for 20260609150000_drop_dead_privileged_functions.sql
--
-- NOT a migration. Lives in rollback/ so the Supabase CLI never auto-applies
-- it (the runner only scans supabase/migrations/*.sql, not subfolders).
--
-- Paste the relevant block into the SQL editor (or apply_migration) ONLY if you
-- need to recreate one of the dropped functions. These are the exact
-- definitions captured from production immediately before the drop.
--
-- ⚠️ All 7 reference legacy / non-existent objects (public.picks, games,
-- week_meta, app_current_week, weekly_rank_lock, v_week_rank_final,
-- frozen_matchup_ranks) — recreating them restores the function shell but it
-- will still error at call time until those objects exist. This file exists for
-- completeness/audit, not because the functions are expected to work again.
--
-- Grants are intentionally NOT included: per the prior security migration these
-- functions had all client EXECUTE revoked; recreating them re-grants nothing.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_purge_user(p_uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.picks where user_id = p_uid;
  delete from public.pool_members where user_id = p_uid;
  delete from public.smack_messages where user_id = p_uid;
  -- add any other user-scoped tables here

  perform auth.admin_delete_user(p_uid);
end;
$function$;

-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lock_week_ranks(in_season integer, in_week integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  upserted int;
begin
  insert into public.weekly_rank_lock (season, week, game_id, rank, locked_at)
  select season, week, game_id, rank, now()
  from public.v_week_rank_final
  where season = in_season and week = in_week
  on conflict (season, week, game_id)
  do update set rank = excluded.rank, locked_at = now();

  get diagnostics upserted = row_count;
  return upserted;
end;
$function$;

-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_week(p_season integer, p_week integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_next_kickoff timestamptz;
begin
  -- "Next" kickoff at the moment of publishing (usually the Thu game).
  select min(g.kickoff_at)
    into v_next_kickoff
  from public.games g
  where g.season = p_season
    and g.week   = p_week
    and g.kickoff_at >= now();

  -- Fallback: if you're publishing late (after Thu), lock immediately.
  if v_next_kickoff is null then
    select min(g.kickoff_at)
      into v_next_kickoff
    from public.games g
    where g.season = p_season
      and g.week   = p_week;

    if v_next_kickoff is null then
      raise exception 'No games found for season %, week %', p_season, p_week;
    end if;

    v_next_kickoff := now();
  end if;

  insert into public.week_meta (season, week, rank_frozen_at, picks_locked_at)
  values (p_season, p_week, now(), v_next_kickoff)
  on conflict (season, week) do update
    set rank_frozen_at  = excluded.rank_frozen_at,
        picks_locked_at = excluded.picks_locked_at;
end;
$function$;

-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_create_pool_probe(p_name text, p_passcode text DEFAULT NULL::text)
 RETURNS TABLE(pool_id uuid, invite_code text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Returns a fixed row so we can test wiring/decoding
  select '00000000-0000-0000-0000-000000000000'::uuid as pool_id,
         'probe1234'::text                         as invite_code;
$function$;

-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_current_week()
 RETURNS TABLE(season integer, week integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select season, week
  from app_current_week
  order by updated_at desc
  limit 1;
$function$;

-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_current_week_rank_readiness()
 RETURNS TABLE(season integer, week integer, games integer, ranked integer, is_ready boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with cw as (select * from rpc_current_week()),
gw as (
  select count(*)::int as games
  from games g
  join cw on g.season = cw.season and g.week = cw.week
),
rw as (
  select count(*)::int as ranked
  from frozen_matchup_ranks r
  join cw on r.season = cw.season and r.week = cw.week
)
select cw.season, cw.week, gw.games, rw.ranked, (gw.games = rw.ranked and rw.ranked > 0) as is_ready
from cw, gw, rw;
$function$;

-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_set_current_week(p_season integer, p_week integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into app_current_week(season, week)
  values (p_season, p_week)
  on conflict (season) do update
  set week = excluded.week, updated_at = now();
$function$;
