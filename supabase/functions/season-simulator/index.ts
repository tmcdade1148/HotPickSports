import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// SAFETY MODEL — the simulator is STRUCTURALLY incapable of touching production.
// 260606_HotPick_SimulatorRescope_Spec.
//
//   * There is NO default target. The target competition is a required input.
//   * It must appear in SANDBOX_COMPETITIONS — checked at the entry point,
//     BEFORE any database read or write, for EVERY command.
//   * Adding a production competition here would require this reviewed, deployed
//     code change — never a config row or a stray SQL UPDATE. That asymmetry is
//     the whole point: the safe state lives in the structure, not in a setting.
// ─────────────────────────────────────────────────────────────────────────────
const SANDBOX_COMPETITIONS = ["nfl_2025_sim", "nfl_2025_simA", "nfl_2025_simG"];
// nfl_2025_sim  = testers · nfl_2025_simA = Apple review · nfl_2025_simG = Google
// review. All three are driven by the simulator. A future shadow-run sandbox may
// be added here as a DELIBERATE, reviewed code change. nfl_2026 — and any live
// competition — must NEVER be added. If you are tempted to add one, stop.

// Read-only replay source: the real 2025 results the simulator copies/replays.
// Reading the source is harmless; only the TARGET is gated.
const SOURCE_COMPETITION = "nfl_2025";
const SOURCE_YEAR = 2025;

// Destructive commands wipe / re-initialise sandbox data. They are gated behind
// an explicit confirm flag so routine advancing (run_week/run_range) can NEVER
// re-initialise the sandbox and erase the testers living in it.
const DESTRUCTIVE_COMMANDS = new Set(["setup", "cleanup"]);

interface SimContext {
  competition: string; // a validated sandbox target (never production)
  seasonYear: number;  // read from competition_config — never hardcoded
}

// Typed error so the handler can map a refusal to the right status + code.
class SimError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

Deno.serve(async (req: Request) => {
  // Service-role client for the simulator's own DB work (bypasses RLS). The
  // sandbox allowlist (gate 1) is what keeps this power away from production;
  // there is deliberately NO super-admin/JWT gate (the tool runs service-role).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const command = body.command ?? "status";
    const target = body.competition;

    // ── GATE 1 — ALLOWLIST. Pure input validation, before ANY DB I/O, for
    //    EVERY command. This is the single most important line in the file. ──
    if (!target) {
      throw new SimError(
        "MISSING_TARGET",
        "No competition supplied. Pass { competition } — there is no default target.",
        400,
      );
    }
    if (!SANDBOX_COMPETITIONS.includes(target)) {
      throw new SimError(
        "REFUSED",
        `${target} is not a sandbox. The simulator only runs against: ` +
          `${SANDBOX_COMPETITIONS.join(", ")}. It is structurally barred from production.`,
        403,
      );
    }

    // ── GATE 2 — OPTIONAL SHARED SECRET. The simulator runs service-role (the
    //    HTML tool has no user login), so there is deliberately NO super-admin /
    //    JWT check — that would lock out the only way the sandboxes are advanced.
    //    The allowlist (gate 1) is what prevents production harm. If
    //    SIMULATOR_ADMIN_SECRET is configured, require a matching x-simulator-secret
    //    header as an extra lock; if unset, allowlist + destructive-confirm stand. ──
    const requiredSecret = Deno.env.get("SIMULATOR_ADMIN_SECRET");
    if (requiredSecret && req.headers.get("x-simulator-secret") !== requiredSecret) {
      throw new SimError("BAD_SECRET", "Missing or invalid x-simulator-secret header.", 401);
    }

    // ── GATE 3 — DESTRUCTIVE CONFIRM. setup/cleanup can erase testers' data, so
    //    they need an explicit flag. Routine advancing never reaches this. ──
    if (DESTRUCTIVE_COMMANDS.has(command) && body.confirm_destructive !== true) {
      throw new SimError(
        "CONFIRM_REQUIRED",
        `'${command}' wipes / re-initialises ${target} and can erase testers' ` +
          `data. Re-send with { confirm_destructive: true } to proceed.`,
        400,
      );
    }

    // Past the gates — build the validated context (season_year from config).
    const ctx = await buildContext(supabase, target);

    switch (command) {
      case "status":
        return json(await getStatus(supabase, ctx), 200);
      case "setup":
        return json(await setup(supabase, ctx), 200);
      case "run_week":
        return json(await runWeek(supabase, ctx, body.week, body.run_id), 200);
      case "run_range":
        return json(await runRange(supabase, ctx, body.from_week ?? 1, body.to_week ?? 18, body.run_id), 200);
      case "run_full_season":
        return json(await runRange(supabase, ctx, 1, 22, body.run_id), 200);
      case "run_playoffs":
        return json(await runRange(supabase, ctx, 19, 22, body.run_id), 200);
      case "cleanup":
        return json(await cleanup(supabase, ctx), 200);
      default:
        return json({ error: `Unknown command: ${command}. Use: status, setup, run_week, run_range, run_full_season, run_playoffs, cleanup` }, 400);
    }
  } catch (err: unknown) {
    if (err instanceof SimError) {
      return json({ error: err.message, code: err.code }, err.status);
    }
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// season_year is read from config so the simulator is correct for ANY sandbox
// (nfl_2025_sim is season_year 2025, not 2026 — never hardcode it).
async function buildContext(sb: any, competition: string): Promise<SimContext> {
  const { data } = await sb
    .from("competition_config").select("value")
    .eq("competition", competition).eq("key", "season_year").maybeSingle();
  const seasonYear = Number(String(data?.value ?? "").replace(/^"|"$/g, ""));
  if (!Number.isFinite(seasonYear) || seasonYear === 0) {
    throw new SimError("NO_SEASON_YEAR", `${competition} has no season_year in competition_config.`, 400);
  }
  return { competition, seasonYear };
}

// Real testers = non-sim-prefixed picks or totals (real auth users with real
// progress). Their data is the valuable signal: the simulator must never
// fabricate over it (decision #1), and setup/cleanup must never wipe it
// (decision #2). Only ever called on an allowlisted sandbox.
async function hasRealTesters(sb: any, competition: string): Promise<boolean> {
  const { count: realPicks } = await sb.from("season_picks")
    .select("user_id", { count: "exact", head: true })
    .eq("competition", competition).not("user_id", "like", "sim-%");
  if ((realPicks ?? 0) > 0) return true;
  const { count: realTotals } = await sb.from("season_user_totals")
    .select("user_id", { count: "exact", head: true })
    .eq("competition", competition).not("user_id", "like", "sim-%");
  return (realTotals ?? 0) > 0;
}

// Deterministic pseudo-random for reproducible picks.
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

async function getStatus(sb: any, ctx: SimContext) {
  const { data: games } = await sb.from("season_games").select("week")
    .eq("competition", ctx.competition).eq("season_year", ctx.seasonYear);
  const { data: config } = await sb.from("competition_config").select("key, value")
    .eq("competition", ctx.competition);
  const cfg = Object.fromEntries((config ?? []).map((r: any) => [r.key, r.value]));
  return {
    competition: ctx.competition,
    season_year: ctx.seasonYear,
    games_loaded: games?.length ?? 0,
    current_week: cfg.current_week,
    current_phase: cfg.current_phase,
    week_state: cfg.week_state,
  };
}

// DESTRUCTIVE (confirm-gated). Reset existing sandbox games to scheduled, or seed
// them from the read-only source if the sandbox is empty.
async function setup(sb: any, ctx: SimContext) {
  // Decision #2 (extended): never reset/reseed a sandbox that holds real testers —
  // that would scrub their progress. Reseeding a live tester sandbox is a separate,
  // deliberate, backed-up operation, not a tool call.
  if (await hasRealTesters(sb, ctx.competition)) {
    throw new SimError("SANDBOX_HAS_REAL_TESTERS",
      `${ctx.competition} holds real (non-sim) testers and their progress — setup would ` +
        `reset their games and scores. Refused. Reseed only as a deliberate, backed-up op.`, 409);
  }
  // Clear only simulator-generated picks (sim-prefixed users) — never real picks.
  await sb.from("season_picks").delete().eq("competition", ctx.competition).like("user_id", "sim-%");

  const { data: existing } = await sb.from("season_games").select("game_id")
    .eq("competition", ctx.competition).eq("season_year", ctx.seasonYear).limit(1);

  if (existing && existing.length > 0) {
    // Sandbox already seeded (the nfl_2025_sim case) — reset to scheduled.
    await sb.from("season_games")
      .update({ status: "scheduled", home_score: null, away_score: null, winner_team: null, is_finalized: false })
      .eq("competition", ctx.competition).eq("season_year", ctx.seasonYear);
    return { status: "reset", competition: ctx.competition, message: "Existing sandbox games reset to scheduled" };
  }

  // Empty sandbox — seed from the read-only source.
  const { data: source } = await sb.from("season_games").select("*")
    .eq("competition", SOURCE_COMPETITION).eq("season_year", SOURCE_YEAR)
    .order("week", { ascending: true });
  if (!source || source.length === 0) {
    return { error: `No source data found in ${SOURCE_COMPETITION}/${SOURCE_YEAR}` };
  }

  const mapped = source.map((g: any) => ({
    game_id: `sim-${g.game_id}`,
    competition: ctx.competition,
    season_year: ctx.seasonYear,
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

  await setConfig(sb, ctx, "current_week", 1);
  await setConfig(sb, ctx, "current_phase", "REGULAR");
  await setConfig(sb, ctx, "week_state", "picks_open");

  return { status: "setup_complete", competition: ctx.competition, games_loaded: mapped.length, weeks: [...new Set(mapped.map((g: any) => g.week))].length };
}

async function runWeek(sb: any, ctx: SimContext, week: number, runId?: string) {
  const rid = runId ?? crypto.randomUUID();
  const rand = seededRandom(week * 12345);
  const logs: any[] = [];

  function log(step: string, expected: string, actual: string, passed: boolean, detail?: string) {
    logs.push({ run_id: rid, week, step, expected, actual, passed, detail });
  }

  // Source data for this week (the real results to replay).
  const { data: sourceGames } = await sb.from("season_games").select("*")
    .eq("competition", SOURCE_COMPETITION).eq("season_year", SOURCE_YEAR).eq("week", week);
  if (!sourceGames || sourceGames.length === 0) {
    log("load_source", "games found", "no games", false, `No ${SOURCE_COMPETITION} data for week ${week}`);
    await sb.from("simulation_log").insert(logs);
    return { run_id: rid, week, status: "failed", logs };
  }
  const sourceMap = new Map(sourceGames.map((g: any) => [g.game_id, g]));

  // Step 1: the sandbox has this week's games.
  const { data: simGames } = await sb.from("season_games").select("*")
    .eq("competition", ctx.competition).eq("season_year", ctx.seasonYear).eq("week", week);
  log("games_exist", `${sourceGames.length} games`, `${simGames?.length ?? 0} games`,
    (simGames?.length ?? 0) === sourceGames.length);

  // Step 2: open picks for the week.
  await setConfig(sb, ctx, "current_week", week);
  await setConfig(sb, ctx, "week_state", "picks_open");
  const phase = week <= 18 ? "REGULAR" : week === 19 ? "WILDCARD" : week === 20 ? "DIVISIONAL" : week === 21 ? "CONFERENCE" : "SUPERBOWL";
  if (week === 19) await setConfig(sb, ctx, "current_phase", "PLAYOFFS");
  if (week === 22) await setConfig(sb, ctx, "current_phase", "SUPERBOWL");

  const { data: cfgCheck } = await sb.from("competition_config").select("key, value")
    .eq("competition", ctx.competition).in("key", ["current_week", "week_state"]);
  const cfgMap = Object.fromEntries((cfgCheck ?? []).map((r: any) => [r.key, r.value]));
  log("config_picks_open", "week_state=picks_open", `week_state=${cfgMap.week_state}`,
    String(cfgMap.week_state).replace(/^"|"$/g, "") === "picks_open");

  // Step 3: fabricate picks — ONLY for a purely-synthetic sandbox.
  // LOCKED RULE (decision #1): never fabricate when real testers/picks are
  // present. The testers' real picks are the valuable signal — that is the proof
  // the experience works — and must never be overwritten.
  let picksSubmitted = 0;
  if (await hasRealTesters(sb, ctx.competition)) {
    log("picks_submitted", "real testers' picks preserved", "fabrication skipped", true,
      `${ctx.competition} has real (non-sim) testers — fabrication is disabled to protect their picks.`);
  } else {
    // Synthetic sandbox only. Global-pool lookup is competition-scoped (the
    // original was unscoped — would have fabricated against the wrong competition).
    const { data: globalPool } = await sb.from("pools").select("id")
      .eq("competition", ctx.competition).eq("is_global", true).maybeSingle();
    if (!globalPool) {
      log("picks_submitted", "global pool present", "no global pool", true,
        `No is_global pool for ${ctx.competition}; nothing to fabricate.`);
    } else {
      const { data: members } = await sb.from("pool_members").select("user_id")
        .eq("pool_id", globalPool.id).eq("status", "active");
      for (const member of members ?? []) {
        await sb.from("season_picks").delete()
          .eq("user_id", member.user_id).eq("competition", ctx.competition).eq("week", week);
        const hotpickIdx = Math.floor(rand() * (simGames?.length ?? 1));
        for (let i = 0; i < (simGames?.length ?? 0); i++) {
          const game = simGames![i];
          if (game.status !== "scheduled") continue;
          const pickedTeam = rand() < 0.6 ? game.home_team : game.away_team;
          const { error: pickErr } = await sb.from("season_picks").insert({
            user_id: member.user_id, game_id: game.game_id, competition: ctx.competition,
            season_year: ctx.seasonYear, week, picked_team: pickedTeam, is_hotpick: i === hotpickIdx,
          });
          if (!pickErr) picksSubmitted++;
        }
      }
      log("picks_submitted", ">0 picks", `${picksSubmitted} picks`, picksSubmitted > 0,
        `${members?.length ?? 0} users x ${simGames?.length ?? 0} games`);
    }
  }

  // Step 4 + 5: locked -> live (games in progress).
  await setConfig(sb, ctx, "week_state", "locked");
  log("week_locked", "week_state=locked", "locked", true);
  await setConfig(sb, ctx, "week_state", "live");
  await sb.from("season_games").update({ status: "in_progress" })
    .eq("competition", ctx.competition).eq("season_year", ctx.seasonYear).eq("week", week);
  log("games_live", "all games in_progress", "in_progress", true);

  // Step 6: final scores from the source. Sandbox ids may be a straight copy of
  // the source ids OR sim-prefixed — handle both.
  for (const simGame of simGames ?? []) {
    const stripped = simGame.game_id.startsWith("sim-") ? simGame.game_id.slice(4) : simGame.game_id;
    const src = sourceMap.get(stripped) ?? sourceMap.get(simGame.game_id);
    if (!src) continue;
    await sb.from("season_games").update({
      status: "final", home_score: src.home_score, away_score: src.away_score,
      winner_team: src.winner_team, is_finalized: true,
    }).eq("game_id", simGame.game_id).eq("competition", ctx.competition);
  }
  log("games_final", "all games final", "final", true, `${simGames?.length} games finalized with source scores`);

  // Step 7: scoring. NOTE: this is the simulator's OWN inline scorer (a divergent
  // path from the canonical nfl-calculate-scores / nfl-finalize-week). It is kept
  // sandbox-only. See re-scope notes — converging the sandbox onto the real
  // engine is the longer-term direction.
  await setConfig(sb, ctx, "week_state", "settling");
  const { data: finalGames } = await sb.from("season_games")
    .select("game_id, home_team, away_team, rank, frozen_rank, winner_team")
    .eq("competition", ctx.competition).eq("season_year", ctx.seasonYear).eq("week", week)
    .ilike("status", "%final%");
  const gameMap = new Map((finalGames ?? []).map((g: any) => [g.game_id, { ...g, effectiveRank: g.frozen_rank ?? g.rank ?? 1 }]));

  const { data: picks } = await sb.from("season_picks")
    .select("user_id, game_id, picked_team, is_hotpick")
    .eq("competition", ctx.competition).eq("season_year", ctx.seasonYear).eq("week", week);

  const aggByUser = new Map<string, any>();
  for (const p of picks ?? []) {
    const game = gameMap.get(p.game_id);
    if (!game) continue;
    const isTie = game.winner_team === null;
    const isWin = !isTie && p.picked_team === game.winner_team;
    const rank = game.effectiveRank;
    const agg = aggByUser.get(p.user_id) ?? { user_id: p.user_id, week_points: 0, correct_picks: 0, total_picks: 0, is_hotpick_correct: null, hotpick_rank: null };
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
        user_id: u.user_id, competition: ctx.competition, season_year: ctx.seasonYear, week, phase,
        week_points: u.week_points, correct_picks: u.correct_picks, total_picks: u.total_picks,
        is_hotpick_correct: u.is_hotpick_correct, hotpick_rank: u.hotpick_rank, is_no_show: false,
        scored_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,competition,season_year,week" },
    );
  }
  log("scoring_complete", ">0 users scored", `${userAggs.length} users scored`, userAggs.length > 0);

  // Step 8: complete.
  await setConfig(sb, ctx, "week_state", "complete");
  log("week_complete", "week_state=complete", "complete", true);

  if (logs.length > 0) await sb.from("simulation_log").insert(logs);

  const failures = logs.filter((l: any) => !l.passed);
  return {
    run_id: rid, week, competition: ctx.competition,
    status: failures.length === 0 ? "passed" : "failed",
    steps: logs.length, passed: logs.filter((l: any) => l.passed).length, failed: failures.length,
    users_scored: userAggs.length, picks_submitted: picksSubmitted,
    failures: failures.map((f: any) => ({ step: f.step, expected: f.expected, actual: f.actual })),
  };
}

async function runRange(sb: any, ctx: SimContext, fromWeek: number, toWeek: number, runId?: string) {
  const rid = runId ?? crypto.randomUUID();
  const results = [];
  for (let week = fromWeek; week <= toWeek; week++) {
    const result = await runWeek(sb, ctx, week, rid);
    results.push(result);
    if (week === 18) await setConfig(sb, ctx, "current_phase", "REGULAR_COMPLETE");
  }
  const totalPassed = results.reduce((s, r) => s + (r.passed ?? 0), 0);
  const totalFailed = results.reduce((s, r) => s + (r.failed ?? 0), 0);
  return {
    run_id: rid, competition: ctx.competition, weeks_run: results.length,
    total_steps: totalPassed + totalFailed, total_passed: totalPassed, total_failed: totalFailed,
    overall: totalFailed === 0 ? "ALL PASSED" : "FAILURES DETECTED",
    weekly_summary: results.map((r) => ({ week: r.week, status: r.status, users_scored: r.users_scored })),
  };
}

// DESTRUCTIVE (confirm-gated). Remove simulator data and reset the sandbox clock.
async function cleanup(sb: any, ctx: SimContext) {
  // Decision #2: cleanup must never nuke a live tester sandbox. Even with
  // confirm_destructive, refuse when real testers/progress are present — we do
  // not run cleanup against the live tester sandbox during the testing period.
  if (await hasRealTesters(sb, ctx.competition)) {
    throw new SimError("SANDBOX_HAS_REAL_TESTERS",
      `${ctx.competition} holds real (non-sim) testers and their progress — cleanup would ` +
        `wipe totals/picks and reset the clock. Refused. Clear it only as a deliberate, backed-up op.`, 409);
  }
  await sb.from("season_user_totals").delete().eq("competition", ctx.competition).eq("season_year", ctx.seasonYear);
  await sb.from("season_picks").delete().eq("competition", ctx.competition).eq("season_year", ctx.seasonYear);
  // Only simulator-seeded (sim-prefixed) games are removed; a straight-copy
  // sandbox keeps its games. (OPEN DECISION — see re-scope notes.)
  await sb.from("season_games").delete()
    .eq("competition", ctx.competition).eq("season_year", ctx.seasonYear).like("game_id", "sim-%");
  // simulation_log has no competition column; scope-down is a separate decision.
  await sb.from("simulation_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  await setConfig(sb, ctx, "current_week", 1);
  await setConfig(sb, ctx, "current_phase", "REGULAR");
  await setConfig(sb, ctx, "week_state", "picks_open");
  return { status: "cleaned", competition: ctx.competition, message: "Simulation data removed, config reset" };
}

async function setConfig(sb: any, ctx: SimContext, key: string, value: any) {
  await sb.from("competition_config").upsert(
    { competition: ctx.competition, key, value: JSON.stringify(value), description: `Set by season-simulator (sandbox: ${ctx.competition})` },
    { onConflict: "competition,key" },
  );
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
}
