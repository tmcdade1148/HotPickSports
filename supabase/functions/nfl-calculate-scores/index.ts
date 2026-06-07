import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { effectiveRank, scorePicks, weekPhase } from "../_shared/scoring.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const competition = body.competition ?? "nfl_2026";
    const autoDetect = body.auto_detect ?? false;

    const { data: configRows } = await supabase
      .from("competition_config").select("key, value").eq("competition", competition);
    const cfg = Object.fromEntries((configRows ?? []).map((r) => [r.key, r.value]));

    if (!cfg.is_active) return json({ success: true, reason: "competition_inactive" }, 200);
    if (cfg.scoring_locked) return json({ success: true, reason: "scoring_locked" }, 200);

    const seasonYear = Number(cfg.season_year ?? 2026);

    if (autoDetect || !body.week) {
      const { data: finalGames, error: detectError } = await supabase
        .from("season_games").select("week")
        .eq("competition", competition).eq("season_year", seasonYear)
        .ilike("status", "%FINAL%").order("week", { ascending: false });

      if (detectError) return json({ success: false, error: detectError.message }, 500);

      const weeks = [...new Set((finalGames ?? []).map((g) => g.week))];
      const results = [];
      for (const week of weeks) {
        const result = await scoreWeek(competition, seasonYear, week);
        results.push({ week, ...result });
      }
      return json({ success: true, auto_detect: true, weeks_scored: results.length, results }, 200);
    }

    const week = Number(body.week);
    if (!week) return json({ error: "week required or use auto_detect: true" }, 400);
    const result = await scoreWeek(competition, seasonYear, week);
    return json({ success: true, competition, season_year: seasonYear, week, ...result }, 200);

  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

async function scoreWeek(competition: string, seasonYear: number, week: number) {
  const phase = weekPhase(week);

  const { data: games, error: gamesError } = await supabase
    .from("season_games")
    .select("game_id, home_team, away_team, rank, frozen_rank, winner_team")
    .eq("competition", competition).eq("season_year", seasonYear).eq("week", week)
    .ilike("status", "%FINAL%");

  if (gamesError) return { users_scored: 0, final_games: 0, error: gamesError.message };
  if (!games || games.length === 0) return { users_scored: 0, final_games: 0 };

  const gameMap = new Map(games.map((g) => [g.game_id, { ...g, effectiveRank: effectiveRank(g) }]));

  const { data: picks, error: picksError } = await supabase
    .from("season_picks")
    .select("user_id, game_id, picked_team, is_hotpick, power_up")
    .eq("competition", competition).eq("season_year", seasonYear).eq("week", week);

  if (picksError) return { users_scored: 0, final_games: games.length, error: picksError.message };

  // Pure scoring (see ../_shared/scoring.ts — covered by __tests__/scoring.test.ts).
  // Returns per-user aggregates (incl. zero-row backfill), per-pick results, and
  // the set of users who actually scored.
  const { userAggs, pickResults, scoredUserIds } = scorePicks(gameMap, picks ?? []);
  // Lookup for the SmackTalk auto-posts below (zero-row backfills carry
  // is_hotpick_correct=null and are skipped by that loop's own guard).
  const aggByUser = new Map(userAggs.map((u) => [u.user_id, u]));

  // Write per-pick results (points, is_correct) back to season_picks in a
  // single round-trip via RPC. (Was an unguarded N+1 update loop that swallowed
  // errors → could leave season_picks inconsistent with award computation.)
  if (pickResults.length > 0) {
    const { error: pickWriteErr } = await supabase.rpc("apply_season_pick_results", {
      p_competition: competition,
      p_season_year: seasonYear,
      p_week: week,
      p_results: pickResults,
    });
    if (pickWriteErr) {
      return { users_scored: 0, final_games: games.length, error: `pick write: ${pickWriteErr.message}` };
    }
  }

  if (userAggs.length === 0) return { users_scored: 0, final_games: games.length };

  // Upsert week totals via RPC with a COLUMN-SCOPED ON CONFLICT. This preserves
  // is_no_show and mulligan_used (the old full-row .upsert() rewrote them every
  // pass, and read-then-wrote mulligan racily). The scorer now only touches the
  // columns it owns; no need to pre-read existing rows.
  const { error: upsertError } = await supabase.rpc("upsert_season_week_scores", {
    p_competition: competition,
    p_season_year: seasonYear,
    p_week: week,
    p_phase: phase,
    p_aggs: userAggs,
  });

  if (upsertError) return { users_scored: 0, final_games: games.length, error: upsertError.message };

  // ── SmackTalk: post per-user HotPick results to each pool they belong to ──
  // Suppressed for sandbox/sim competitions — the App Review sandboxes
  // (nfl_2025_sim, nfl_2025_simA, nfl_2025_simG) and Testing NFL2 should show a
  // clean human-authored feed. Production (nfl_2026) still gets the auto-posts.
  // Matches `_sim` optionally + a single suffix letter (mirrors
  // isSandboxCompetition in src/shared/utils/competition.ts).
  if (/_sim[a-z]?$/i.test(competition)) {
    return { users_scored: scoredUserIds.size, final_games: games.length };
  }
  try {
    // Find users whose HotPick game is in this batch of FINAL games
    const hotPickPicks = (picks ?? []).filter((p: any) => p.is_hotpick && gameMap.has(p.game_id));
    if (hotPickPicks.length > 0) {
      const hotPickUserIds = hotPickPicks.map((p: any) => p.user_id);

      // Fetch poolie_names
      const { data: profiles } = await supabase
        .from("profiles").select("id, poolie_name, first_name")
        .in("id", hotPickUserIds);
      const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.poolie_name || p.first_name || "Someone"]));

      // Fetch pool memberships
      const { data: pools } = await supabase
        .from("pools").select("id").eq("competition", competition).eq("is_archived", false);
      const poolIds = (pools ?? []).map((p: any) => p.id);

      const { data: memberships } = await supabase
        .from("pool_members").select("pool_id, user_id")
        .eq("status", "active").in("pool_id", poolIds).in("user_id", hotPickUserIds);

      // Group memberships: userId → [poolIds]
      const userPools = new Map<string, string[]>();
      for (const m of memberships ?? []) {
        const list = userPools.get(m.user_id) ?? [];
        list.push(m.pool_id);
        userPools.set(m.user_id, list);
      }

      // Post one message per user per pool
      const msgs: Promise<any>[] = [];
      for (const pick of hotPickPicks) {
        const game = gameMap.get(pick.game_id);
        if (!game || !game.winner_team) continue;
        const agg = aggByUser.get(pick.user_id);
        if (!agg || agg.is_hotpick_correct === null) continue;

        const name = nameMap.get(pick.user_id) ?? "Someone";
        const team = pick.picked_team;
        const rank = agg.hotpick_rank ?? game.effectiveRank;
        const hit = agg.is_hotpick_correct;
        const text = hit
          ? `${name}'s HotPick on ${team} hit ✅ — +${rank} pts`
          : `${name}'s HotPick on ${team} missed ❌ — −${rank} pts`;

        for (const poolId of userPools.get(pick.user_id) ?? []) {
          msgs.push(supabase.rpc("post_system_message", {
            p_pool_id: poolId, p_text: text, p_message_type: "score_update"
          }));
        }
      }
      await Promise.allSettled(msgs);
    }
  } catch (smackErr) {
    console.warn("[nfl-calculate-scores] SmackTalk post failed:", smackErr);
  }

  return { users_scored: scoredUserIds.size, final_games: games.length };
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
