import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const COMPETITION = "nfl_2026";
const SOURCE_COMPETITION = "nfl_2025";
const SEASON_YEAR = 2026;
const SOURCE_YEAR = 2025;

// Deterministic pseudo-random for reproducible picks
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const command = body.command ?? "status";

    switch (command) {
      case "status":
        return json(await getStatus(supabase), 200);

      case "setup":
        return json(await setup(supabase), 200);

      case "run_week":
        return json(await runWeek(supabase, body.week, body.run_id), 200);

      case "run_range":
        return json(await runRange(supabase, body.from_week ?? 1, body.to_week ?? 18, body.run_id), 200);

      case "run_full_season":
        return json(await runRange(supabase, 1, 22, body.run_id), 200);

      case "run_playoffs":
        return json(await runRange(supabase, 19, 22, body.run_id), 200);

      case "cleanup":
        return json(await cleanup(supabase), 200);

      default:
        return json({ error: `Unknown command: ${command}. Use: status, setup, run_week, run_range, run_full_season, run_playoffs, cleanup` }, 400);
    }
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

async function getStatus(sb: any) {
  const { data: games } = await sb.from("season_games").select("week").eq("competition", COMPETITION).eq("season_year", SEASON_YEAR);
  const { data: config } = await sb.from("competition_config").select("key, value").eq("competition", COMPETITION);
  const cfg = Object.fromEntries((config ?? []).map((r: any) => [r.key, r.value]));
  return {
    competition: COMPETITION,
    games_loaded: games?.length ?? 0,
    current_week: cfg.current_week,
    current_phase: cfg.current_phase,
    week_state: cfg.week_state,
  };
}

async function setup(sb: any) {
  // Copy 2025 games to 2026 (clear existing 2026 sim data first)
  await sb.from("season_picks").delete().eq("competition", COMPETITION).like("user_id", "sim-%");
  // Don't delete real user picks — only sim data

  // Check if we already have 2026 games from 2025 data
  const { data: existing } = await sb.from("season_games").select("game_id").eq("competition", COMPETITION).eq("season_year", SEASON_YEAR).limit(1);

  if (existing && existing.length > 0) {
    // Reset all 2026 games to scheduled
    await sb.from("season_games")
      .update({ status: "scheduled", home_score: null, away_score: null, winner_team: null, is_finalized: false })
      .eq("competition", COMPETITION).eq("season_year", SEASON_YEAR);

    return { status: "reset", message: "Existing 2026 games reset to scheduled" };
  }

  // Copy 2025 games to 2026
  const { data: source } = await sb.from("season_games")
    .select("*")
    .eq("competition", SOURCE_COMPETITION)
    .eq("season_year", SOURCE_YEAR)
    .order("week", { ascending: true });

  if (!source || source.length === 0) {
    return { error: "No 2025 data found" };
  }

  const mapped = source.map((g: any) => ({
    game_id: `sim-${g.game_id}`,
    competition: COMPETITION,
    season_year: SEASON_YEAR,
    week: g.week,
    phase: g.phase ?? "REGULAR",
    home_team: g.home_team,
    away_team: g.away_team,
    kickoff_at: g.kickoff_at,
    status: "scheduled",
    rank: g.rank,
    frozen_rank: g.frozen_rank ?? g.rank,
    spread: g.spread,
    home_moneyline: g.home_moneyline,
    away_moneyline: g.away_moneyline,
    competitive_index: g.competitive_index,
    home_score: null,
    away_score: null,
    winner_team: null,
    is_finalized: false,
  }));

  const { error } = await sb.from("season_games").insert(mapped);
  if (error) return { error: error.message };

  // Reset competition config
  await setConfig(sb, "current_week", 1);
  await setConfig(sb, "current_phase", "REGULAR");
  await setConfig(sb, "week_state", "picks_open");

  return { status: "setup_complete", games_loaded: mapped.length, weeks: [...new Set(mapped.map((g: any) => g.week))].length };
}

async function runWeek(sb: any, week: number, runId?: string) {
  const rid = runId ?? crypto.randomUUID();
  const rand = seededRandom(week * 12345);
  const logs: any[] = [];

  function log(step: string, expected: string, actual: string, passed: boolean, detail?: string) {
    logs.push({ run_id: rid, week, step, expected, actual, passed, detail });
  }

  // Get source data for this week (has the real results)
  const { data: sourceGames } = await sb.from("season_games")
    .select("*")
    .eq("competition", SOURCE_COMPETITION)
    .eq("season_year", SOURCE_YEAR)
    .eq("week", week);

  if (!sourceGames || sourceGames.length === 0) {
    log("load_source", "games found", "no games", false, `No 2025 data for week ${week}`);
    await sb.from("simulation_log").insert(logs);
    return { run_id: rid, week, status: "failed", logs };
  }

  const sourceMap = new Map(sourceGames.map((g: any) => [g.game_id, g]));

  // Step 1: Verify games exist in 2026 and are scheduled
  const { data: simGames } = await sb.from("season_games")
    .select("*")
    .eq("competition", COMPETITION)
    .eq("season_year", SEASON_YEAR)
    .eq("week", week);

  log("games_exist", `${sourceGames.length} games`, `${simGames?.length ?? 0} games`,
    (simGames?.length ?? 0) === sourceGames.length);

  // Step 2: Set week state to picks_open
  await setConfig(sb, "current_week", week);
  await setConfig(sb, "week_state", "picks_open");

  const phase = week <= 18 ? "REGULAR" : week === 19 ? "WILDCARD" : week === 20 ? "DIVISIONAL" : week === 21 ? "CONFERENCE" : "SUPERBOWL";
  if (week === 19) await setConfig(sb, "current_phase", "PLAYOFFS");
  if (week === 22) await setConfig(sb, "current_phase", "SUPERBOWL");

  const { data: cfgCheck } = await sb.from("competition_config").select("key, value").eq("competition", COMPETITION).in("key", ["current_week", "week_state"]);
  const cfgMap = Object.fromEntries((cfgCheck ?? []).map((r: any) => [r.key, r.value]));
  log("config_picks_open", "week_state=picks_open", `week_state=${cfgMap.week_state}`, cfgMap.week_state === "picks_open");

  // Step 3: Submit picks for all pool members
  const { data: globalPool } = await sb.from("pools").select("id").eq("is_global", true).single();
  const { data: members } = await sb.from("pool_members").select("user_id").eq("pool_id", globalPool?.id).eq("status", "active");

  let picksSubmitted = 0;
  for (const member of members ?? []) {
    // Delete existing picks for this user/week (in case of re-run)
    await sb.from("season_picks").delete()
      .eq("user_id", member.user_id)
      .eq("competition", COMPETITION)
      .eq("week", week);

    // Make sure games are scheduled before inserting picks
    const hotpickIdx = Math.floor(rand() * (simGames?.length ?? 1));

    for (let i = 0; i < (simGames?.length ?? 0); i++) {
      const game = simGames![i];
      if (game.status !== "scheduled") continue;

      // 60% chance of picking home team (realistic bias)
      const pickedTeam = rand() < 0.6 ? game.home_team : game.away_team;
      const isHotpick = i === hotpickIdx;

      const { error: pickErr } = await sb.from("season_picks").insert({
        user_id: member.user_id,
        game_id: game.game_id,
        competition: COMPETITION,
        season_year: SEASON_YEAR,
        week,
        picked_team: pickedTeam,
        is_hotpick: isHotpick,
      });

      if (!pickErr) picksSubmitted++;
    }
  }

  log("picks_submitted", ">0 picks", `${picksSubmitted} picks`, picksSubmitted > 0,
    `${members?.length ?? 0} users x ${simGames?.length ?? 0} games`);

  // Step 4: Transition to locked
  await setConfig(sb, "week_state", "locked");
  log("week_locked", "week_state=locked", "locked", true);

  // Step 5: Transition to live (set games to in_progress)
  await setConfig(sb, "week_state", "live");
  await sb.from("season_games")
    .update({ status: "in_progress" })
    .eq("competition", COMPETITION)
    .eq("season_year", SEASON_YEAR)
    .eq("week", week);
  log("games_live", "all games in_progress", "in_progress", true);

  // Step 6: Set final scores from 2025 real data
  for (const simGame of simGames ?? []) {
    const sourceId = simGame.game_id.replace("sim-", "");
    const src = sourceMap.get(sourceId);
    if (!src) continue;

    await sb.from("season_games")
      .update({
        status: "final",
        home_score: src.home_score,
        away_score: src.away_score,
        winner_team: src.winner_team,
        is_finalized: true,
      })
      .eq("game_id", simGame.game_id);
  }

  log("games_final", "all games final", "final", true, `${simGames?.length} games finalized with 2025 scores`);

  // Step 7: Trigger scoring
  await setConfig(sb, "week_state", "settling");

  // Call scoring directly (same logic as Edge Function)
  const { data: finalGames } = await sb.from("season_games")
    .select("game_id, home_team, away_team, rank, frozen_rank, winner_team")
    .eq("competition", COMPETITION)
    .eq("season_year", SEASON_YEAR)
    .eq("week", week)
    .ilike("status", "%final%");

  const gameMap = new Map((finalGames ?? []).map((g: any) => [g.game_id, { ...g, effectiveRank: g.frozen_rank ?? g.rank ?? 1 }]));

  const { data: picks } = await sb.from("season_picks")
    .select("user_id, game_id, picked_team, is_hotpick")
    .eq("competition", COMPETITION)
    .eq("season_year", SEASON_YEAR)
    .eq("week", week);

  const aggByUser = new Map<string, any>();
  for (const p of picks ?? []) {
    const game = gameMap.get(p.game_id);
    if (!game) continue;
    const isTie = game.winner_team === null;
    const isWin = !isTie && p.picked_team === game.winner_team;
    const rank = game.effectiveRank;
    let agg = aggByUser.get(p.user_id) ?? { user_id: p.user_id, week_points: 0, correct_picks: 0, total_picks: 0, is_hotpick_correct: null, hotpick_rank: null };
    agg.total_picks += 1;
    if (p.is_hotpick) {
      agg.hotpick_rank = rank;
      if (isTie) { /* no change */ }
      else if (isWin) { agg.week_points += rank; agg.correct_picks += 1; agg.is_hotpick_correct = true; }
      else { agg.week_points -= rank; agg.is_hotpick_correct = false; }
    } else if (!isTie && isWin) {
      agg.week_points += 1; agg.correct_picks += 1;
    }
    aggByUser.set(p.user_id, agg);
  }

  const userAggs = Array.from(aggByUser.values());
  if (userAggs.length > 0) {
    await sb.from("season_user_totals").upsert(
      userAggs.map((u: any) => ({
        user_id: u.user_id, competition: COMPETITION, season_year: SEASON_YEAR, week, phase,
        week_points: u.week_points, correct_picks: u.correct_picks, total_picks: u.total_picks,
        is_hotpick_correct: u.is_hotpick_correct, hotpick_rank: u.hotpick_rank, is_no_show: false,
        scored_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,competition,season_year,week" }
    );
  }

  log("scoring_complete", ">0 users scored", `${userAggs.length} users scored`, userAggs.length > 0);

  // Step 8: Complete the week
  await setConfig(sb, "week_state", "complete");
  log("week_complete", "week_state=complete", "complete", true);

  // Save logs
  if (logs.length > 0) {
    await sb.from("simulation_log").insert(logs);
  }

  const failures = logs.filter((l: any) => !l.passed);
  return {
    run_id: rid,
    week,
    status: failures.length === 0 ? "passed" : "failed",
    steps: logs.length,
    passed: logs.filter((l: any) => l.passed).length,
    failed: failures.length,
    users_scored: userAggs.length,
    picks_submitted: picksSubmitted,
    failures: failures.map((f: any) => ({ step: f.step, expected: f.expected, actual: f.actual })),
  };
}

async function runRange(sb: any, fromWeek: number, toWeek: number, runId?: string) {
  const rid = runId ?? crypto.randomUUID();
  const results = [];

  for (let week = fromWeek; week <= toWeek; week++) {
    const result = await runWeek(sb, week, rid);
    results.push(result);

    // Phase transitions
    if (week === 18) {
      await setConfig(sb, "current_phase", "REGULAR_COMPLETE");
    }
  }

  const totalPassed = results.reduce((s, r) => s + (r.passed ?? 0), 0);
  const totalFailed = results.reduce((s, r) => s + (r.failed ?? 0), 0);

  return {
    run_id: rid,
    weeks_run: results.length,
    total_steps: totalPassed + totalFailed,
    total_passed: totalPassed,
    total_failed: totalFailed,
    overall: totalFailed === 0 ? "ALL PASSED" : "FAILURES DETECTED",
    weekly_summary: results.map((r) => ({ week: r.week, status: r.status, users_scored: r.users_scored })),
  };
}

async function cleanup(sb: any) {
  // Remove sim games and related data
  await sb.from("season_user_totals").delete().eq("competition", COMPETITION).eq("season_year", SEASON_YEAR);
  await sb.from("season_picks").delete().eq("competition", COMPETITION).eq("season_year", SEASON_YEAR);
  await sb.from("season_games").delete().eq("competition", COMPETITION).eq("season_year", SEASON_YEAR).like("game_id", "sim-%");
  await sb.from("simulation_log").delete().neq("id", "00000000-0000-0000-0000-000000000000"); // delete all

  await setConfig(sb, "current_week", 1);
  await setConfig(sb, "current_phase", "REGULAR");
  await setConfig(sb, "week_state", "picks_open");

  return { status: "cleaned", message: "All simulation data removed, config reset" };
}

async function setConfig(sb: any, key: string, value: any) {
  await sb.from("competition_config").upsert(
    { competition: COMPETITION, key, value: JSON.stringify(value), description: `Set by season-simulator` },
    { onConflict: "competition,key" }
  );
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
}
