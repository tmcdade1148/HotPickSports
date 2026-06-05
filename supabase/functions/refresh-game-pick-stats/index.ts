import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

/**
 * refresh-game-pick-stats
 *
 * Pre-computes aggregate pick stats per game per pool into game_pick_stats.
 * Game cards read from this table — never from season_picks directly.
 *
 * PRIVACY GATE: Only computes stats for games with status 'live' or any FINAL variant.
 * Games in status 'scheduled' are NEVER included — picks are sealed until kickoff.
 *
 * Designed to run every 60 seconds on game days via cron.
 * On non-game days, returns immediately after checking competition_config.
 */
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const competition = body.competition ?? "nfl_2026";

    // Read competition config
    const { data: configRows } = await supabase
      .from("competition_config").select("key, value").eq("competition", competition);
    const cfg = Object.fromEntries((configRows ?? []).map((r) => [r.key, r.value]));

    // Early exit: competition not active or scoring locked
    if (!cfg.is_active) return json({ success: true, reason: "competition_inactive" }, 200);
    if (cfg.scoring_locked) return json({ success: true, reason: "scoring_locked" }, 200);

    const currentWeek = Number(cfg.current_week ?? 1);
    const seasonYear = Number(cfg.season_year ?? 2026);

    // Check if any games are live or recently completed this week
    const { data: activeGames, error: gamesError } = await supabase
      .from("season_games")
      .select("game_id, home_team, away_team, status")
      .eq("competition", competition)
      .eq("season_year", seasonYear)
      .eq("week", currentWeek)
      .or("status.eq.live,status.ilike.%FINAL%");

    if (gamesError) return json({ success: false, error: gamesError.message }, 500);
    if (!activeGames || activeGames.length === 0) {
      return json({ success: true, reason: "no_active_games", week: currentWeek }, 200);
    }

    const gameIds = activeGames.map(g => g.game_id);
    const gameMap = new Map(activeGames.map(g => [g.game_id, g]));

    // Get all pools for this competition that have active members
    const { data: pools } = await supabase
      .from("pools")
      .select("id")
      .eq("competition", competition)
      .is("deleted_at", null);

    if (!pools || pools.length === 0) {
      return json({ success: true, reason: "no_pools", week: currentWeek }, 200);
    }

    const poolIds = pools.map(p => p.id);

    // Aggregate picks per game per pool.
    // PRIVACY GATE: Only includes picks for games that have kicked off.
    // No RPC for this aggregation — fetch picks + pool_members and aggregate
    // in-memory (efficient: only the current week's picks are fetched).

    const { data: picks, error: picksError } = await supabase
      .from("season_picks")
      .select("user_id, game_id, picked_team, is_hotpick")
      .eq("competition", competition)
      .eq("season_year", seasonYear)
      .eq("week", currentWeek)
      .in("game_id", gameIds);

    if (picksError) return json({ success: false, error: picksError.message }, 500);
    if (!picks || picks.length === 0) {
      return json({ success: true, reason: "no_picks_for_active_games", week: currentWeek }, 200);
    }

    // Fetch active pool memberships for all relevant pools
    const { data: members, error: membersError } = await supabase
      .from("pool_members")
      .select("user_id, pool_id")
      .in("pool_id", poolIds)
      .eq("status", "active");

    if (membersError) return json({ success: false, error: membersError.message }, 500);

    // Build user→pools mapping
    const userPools = new Map<string, Set<string>>();
    for (const m of members ?? []) {
      if (!userPools.has(m.user_id)) userPools.set(m.user_id, new Set());
      userPools.get(m.user_id)!.add(m.pool_id);
    }

    // Aggregate: for each game × pool, count picks
    // Key: "gameId|poolId"
    const stats = new Map<string, {
      game_id: string; pool_id: string;
      team_a: string; team_b: string;
      team_a_pick_count: number; team_b_pick_count: number; total_picks: number;
      hotpick_team_a_count: number; hotpick_team_b_count: number; hotpick_total: number;
    }>();

    for (const pick of picks) {
      const game = gameMap.get(pick.game_id);
      if (!game) continue;

      const pools = userPools.get(pick.user_id);
      if (!pools) continue;

      for (const poolId of pools) {
        const key = `${pick.game_id}|${poolId}`;
        if (!stats.has(key)) {
          stats.set(key, {
            game_id: pick.game_id,
            pool_id: poolId,
            team_a: game.home_team,
            team_b: game.away_team,
            team_a_pick_count: 0,
            team_b_pick_count: 0,
            total_picks: 0,
            hotpick_team_a_count: 0,
            hotpick_team_b_count: 0,
            hotpick_total: 0,
          });
        }

        const s = stats.get(key)!;
        s.total_picks += 1;

        if (pick.picked_team === game.home_team) {
          s.team_a_pick_count += 1;
          if (pick.is_hotpick) s.hotpick_team_a_count += 1;
        } else if (pick.picked_team === game.away_team) {
          s.team_b_pick_count += 1;
          if (pick.is_hotpick) s.hotpick_team_b_count += 1;
        }

        if (pick.is_hotpick) s.hotpick_total += 1;
      }
    }

    // Upsert all stats rows
    const rows = Array.from(stats.values()).map(s => ({
      ...s,
      competition,
      week: currentWeek,
      computed_at: new Date().toISOString(),
    }));

    if (rows.length === 0) {
      return json({ success: true, reason: "no_stats_to_write", week: currentWeek }, 200);
    }

    // Batch upsert in chunks of 500 to avoid payload limits
    const CHUNK_SIZE = 500;
    let totalUpserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error: upsertError } = await supabase
        .from("game_pick_stats")
        .upsert(chunk, { onConflict: "game_id,pool_id" });

      if (upsertError) {
        return json({ success: false, error: upsertError.message, upserted_so_far: totalUpserted }, 500);
      }
      totalUpserted += chunk.length;
    }

    // Clean up old weeks (keep current and previous week only)
    if (currentWeek > 2) {
      await supabase
        .from("game_pick_stats")
        .delete()
        .eq("competition", competition)
        .lt("week", currentWeek - 1);
    }

    return json({
      success: true,
      competition,
      week: currentWeek,
      active_games: activeGames.length,
      pools_computed: poolIds.length,
      stats_rows_upserted: totalUpserted,
    }, 200);

  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
