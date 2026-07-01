// sim-operator — the single sanctioned write path for the Operator Console (Phase 2).
// Spec: 260612_HotPick_OperatorConsole_Phase2_Spec §5a.
//
// Supersedes the old `season-simulator` function (retired in this branch). One
// function, five super-admin-gated actions, SANDBOX-ONLY via a hardcoded allowlist.
//
// SECURITY / DESIGN (see CLAUDE.md + spec §7):
//   * verify_jwt = false (pinned in config.toml) because the Operator Console is a
//     browser page and a verify_jwt=true gateway rejects the unauthenticated CORS
//     preflight. The function owns its gate instead: it reads the caller's session
//     JWT via auth.getUser() and requires is_super_admin — service role never leaves
//     the server. Same hybrid pattern as compute-hardware.
//   * SIM_ALLOWLIST is HARDCODED here, not config-driven. nfl_2026 and every other
//     competition are refused 403 regardless of what the client sends.
//   * Built on the REAL weekly engine, not raw week_state writes:
//       - in-week states are produced by mutating the sandbox's own game rows
//         (kickoff -> final -> finalized); the production trigger
//         sync_week_state_from_games derives week_state from them. We also write
//         week_state explicitly because the sims run in non-cycle phases where the
//         trigger is inert.
//       - phase transitions delegate to the audited admin_advance_season_phase RPC
//         (called via the caller's JWT so its own auth.uid() super-admin check runs).
//       - complete -> next week is a SANDBOX advance (bumps the week directly); it
//         does NOT use admin_advance_week, whose production readiness gate sims fail.
//   * Reset logs to admin_audit_log BEFORE deleting anything (Hard Rule #17).
//
// Sandbox results are sourced from nfl_2025 (sim game_id is `sim_<sourceId>`).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
// Caller-client key: the PUBLISHABLE key, NOT the legacy anon JWT — Supabase has
// disabled legacy API keys, so a client using the anon key as `apikey` is rejected
// ("legacy API keys are disabled"). Publishable keys are public and RLS still
// applies via the forwarded user JWT, so auth.getUser() + the super-admin gate
// work exactly as before. Env-preferred, with the public literal as a fallback.
const PUBLISHABLE_KEY =
  Deno.env.get("SB_PUBLISHABLE_KEY") ?? "sb_publishable_AaENLNqjJ8jNVHGdTGhOnA_WnHze2CH";

// Hardcoded sandbox allowlist — defence in depth. Never config-driven (spec §2).
const SIM_ALLOWLIST = ["nfl_2025_sim", "nfl_2025_simA", "nfl_2025_simG", "nfl_demo"];
// Auto-pick is permitted for exactly one account (spec §2 / §5a auto_pick_tom).
const TOM_USER_ID = "7b4f41c8-008d-4319-98e7-8c80ec6edf69";
// Canonical results source for every NFL sim.
const SOURCE_COMPETITION = "nfl_2025";

// Sandbox bots — the 8 fake members on the nfl_2025_sim Ladder. UUIDs match
// tools/sim-runner.mjs FAKE_MEMBERS (the proven seeder). seed_bots writes ONLY
// these accounts, as hard constants — never tom, never super-admin, never a real
// user (260630_HotPick_SeedBots_Spec §3C / §7).
const SEED_BOTS = [
  { id: "11111111-1111-4111-8111-000000000001", name: "The Gunslinger" },
  { id: "11111111-1111-4111-8111-000000000002", name: "Salty Sarah" },
  { id: "11111111-1111-4111-8111-000000000003", name: "DSmiley" },
  { id: "11111111-1111-4111-8111-000000000004", name: "P-Train" },
  { id: "11111111-1111-4111-8111-000000000005", name: "BigSwingJake" },
  { id: "11111111-1111-4111-8111-000000000006", name: "The Oracle" },
  { id: "11111111-1111-4111-8111-000000000007", name: "ChrisP" },
  { id: "11111111-1111-4111-8111-000000000008", name: "LateNightMia" },
];
// seed_bots is locked to the primary sandbox ONLY — stricter than SIM_ALLOWLIST.
// The bots live in nfl_2025_sim, not the Apple/Google reviewer sims (spec §3C).
const SEED_BOTS_COMPETITION = "nfl_2025_sim";

const VALID_ACTIONS = ["advance_week_state", "advance_game_day", "advance_phase", "jump_to_week", "reset_to_off_season", "auto_pick_tom", "seed_bots", "settle_season_awards"];

// NFL kickoff slots ("waves") derived from kickoff_at — matches tools/sim-runner.mjs.
// Ordered chronologically: the Sunday-morning international game (~9:30am ET,
// 13:30 UTC) kicks off BEFORE the 1pm slate, so "sunday_am" comes before "sunday1".
const WAVE_ORDER = ["thursday", "sunday_am", "sunday1", "sunday4", "snf", "mnf", "other"];
function detectWave(kickoffAt: string | null): string {
  if (!kickoffAt) return "other";
  const d = new Date(kickoffAt);
  const day = d.getUTCDay(), hour = d.getUTCHours();
  if (day === 4 && hour >= 17) return "thursday";
  if (day === 5 && hour < 4) return "thursday";
  // Sunday morning international game: Sunday (day 0) before the 1pm ET slate
  // (17:00 UTC). Without this it fell through to "other" (last), so the
  // earliest game of the day kicked off dead last — after MNF.
  if (day === 0 && hour >= 4 && hour < 17) return "sunday_am";
  if (day === 0 && hour >= 17 && hour < 20) return "sunday1";
  if (day === 0 && hour >= 20 && hour < 23) return "sunday4";
  if (day === 0 && hour >= 23) return "snf";
  if (day === 1 && hour < 4) return "snf";
  if (day === 1 && hour >= 17) return "mnf";
  if (day === 2 && hour < 4) return "mnf";
  if (day === 5 || day === 6) return "sunday1";
  return "other";
}

// CORS — the Operator Console is a browser page, so preflight + headers are required.
// (This is also why the function runs verify_jwt=false and checks super-admin itself:
// a verify_jwt=true gateway rejects the unauthenticated OPTIONS preflight. Same
// pattern as compute-hardware.)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Forward-only in-week order (idle is the off-cycle resting state).
const WS_ORDER = ["idle", "picks_open", "locked", "live", "settling", "complete"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Missing Authorization" }, 401);

    // Caller client carries the user JWT — used for getUser() and for SECURITY
    // DEFINER RPCs that self-check auth.uid().
    const caller = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { global: { headers: { Authorization: authHeader } } });
    // Service-role client for direct sandbox-table writes (bypasses RLS).
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: userData } = await caller.auth.getUser();
    if (!userData?.user) return json({ success: false, error: "Not authenticated" }, 401);
    const callerId = userData.user.id;

    const { data: prof } = await admin.from("profiles").select("is_super_admin").eq("id", callerId).single();
    if (!prof?.is_super_admin) return json({ success: false, error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action;
    const competition: string = body.competition;

    if (!VALID_ACTIONS.includes(action)) return json({ success: false, error: `Invalid action: ${action}` }, 400);
    if (!SIM_ALLOWLIST.includes(competition)) return json({ success: false, error: "Not a sim competition" }, 403);

    switch (action) {
      case "advance_week_state": return await advanceWeekState(caller, admin, competition, authHeader);
      case "advance_game_day":   return await advanceGameDay(admin, competition);
      case "advance_phase":      return await advancePhase(caller, admin, competition, authHeader);
      case "jump_to_week":       return await jumpToWeek(admin, competition, body.target_week);
      case "reset_to_off_season":return await resetToOffSeason(admin, competition, callerId);
      case "auto_pick_tom":      return await autoPickTom(admin, competition, callerId);
      case "seed_bots":          return await seedBots(admin, competition, body.targets);
      case "settle_season_awards": return await settleSeasonAwards(admin, competition, authHeader);
      default:                   return json({ success: false, error: "Unhandled action" }, 400);
    }
  } catch (err: unknown) {
    // Never leak raw Postgres errors to the client.
    console.error("[sim-operator]", err);
    return json({ success: false, error: "Operation failed — see function logs" }, 500);
  }
});

// ── config helpers ──────────────────────────────────────────────────────────
async function getConfig(admin: any, competition: string): Promise<Record<string, any>> {
  const { data } = await admin.from("competition_config").select("key, value").eq("competition", competition);
  return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
}
async function setConfig(admin: any, competition: string, key: string, value: any) {
  // jsonb column — pass the NATIVE JS value so PostgREST stores native jsonb
  // (number/boolean/string). JSON.stringify here would double-encode (e.g. store
  // the string "8" instead of the number 8), which breaks the app's type checks
  // and the playoff leaderboard scoping.
  await admin.from("competition_config").upsert(
    { competition, key, value, description: "Set by sim-operator" },
    { onConflict: "competition,key" },
  );
}
function phaseForWeek(week: number): string {
  return week <= 18 ? "REGULAR" : week === 22 ? "SUPERBOWL" : "PLAYOFFS";
}

// ── advance_week_state ───────────────────────────────────────────────────────
// Drives the sandbox through one in-week step using real game mechanics.
async function advanceWeekState(caller: any, admin: any, competition: string, authHeader: string) {
  const cfg = await getConfig(admin, competition);
  const ws = String(cfg.week_state ?? "idle");
  const week = Number(cfg.current_week);
  const year = Number(cfg.season_year ?? 2025);
  const phase = String(cfg.current_phase ?? "REGULAR");

  switch (ws) {
    case "idle":
      // Open the current week (enter the in-week cycle).
      await setConfig(admin, competition, "week_state", "picks_open");
      break;

    case "picks_open":
      await setConfig(admin, competition, "week_state", "locked");
      break;

    case "locked":
      // Kick off: all current-week games go in_progress; trigger + explicit write -> live.
      await admin.from("season_games").update({ status: "in_progress" })
        .eq("competition", competition).eq("season_year", year).eq("week", week).eq("status", "scheduled");
      await setConfig(admin, competition, "week_state", "live");
      break;

    case "live": {
      // Finalize games with source results (FINAL, not yet finalized), then score.
      await finalizeGamesFromSource(admin, competition, year, week);
      await setConfig(admin, competition, "week_state", "settling");
      await scoreWeek(admin, competition, year, week, phase);
      break;
    }

    case "settling":
      // Mark finalized -> trigger + explicit write -> complete; weekly awards.
      await admin.from("season_games").update({ is_finalized: true })
        .eq("competition", competition).eq("season_year", year).eq("week", week);
      await setConfig(admin, competition, "week_state", "complete");
      await invokeComputeHardware(admin, authHeader, competition, "weekly_settle");
      break;

    case "complete": {
      // Next week — sandbox advance. We do NOT delegate to admin_advance_week: the
      // production weekly clock gates on a week_readiness row (the Tuesday
      // import/odds/rank prep pipeline), which sims never run, so it always returns
      // NOT_READY. The simulator owns its own clock. Bump the week, reopen picks, and
      // reset the new week's games to a clean pickable slate.
      const next = week + 1;
      if (next > 22) return json({ success: false, error: "Already at the final week (22) — advance the phase instead." }, 400);
      await admin.from("season_games")
        .update({ status: "scheduled", home_score: null, away_score: null, winner_team: null, is_finalized: false, current_period: null, game_clock: null })
        .eq("competition", competition).eq("season_year", year).eq("week", next);
      await setConfig(admin, competition, "current_week", next);
      await setConfig(admin, competition, "week_state", "picks_open");
      return json({ success: true, action: "advance_week_state", from: "complete", to_week: next, state: await getConfig(admin, competition) }, 200);
    }

    default:
      return json({ success: false, error: `Cannot advance from week_state="${ws}"` }, 400);
  }

  return json({ success: true, action: "advance_week_state", from: ws, state: await getConfig(admin, competition) }, 200);
}

async function finalizeGamesFromSource(admin: any, competition: string, year: number, week: number) {
  const { data: simGames } = await admin.from("season_games")
    .select("game_id, home_team, away_team").eq("competition", competition).eq("season_year", year).eq("week", week);
  const srcMap = await sourceScoreMap(admin, week);
  for (const g of simGames ?? []) {
    const s: any = srcFor(g.game_id, srcMap);
    const upd = s
      ? { status: "final", home_score: s.home_score, away_score: s.away_score, winner_team: s.winner_team }
      // Fallback when no source row exists (e.g. nfl_demo): deterministic home win.
      : { status: "final", home_score: 20, away_score: 17, winner_team: g.home_team };
    await admin.from("season_games").update(upd).eq("game_id", g.game_id).eq("competition", competition);
  }
}

// ── advance_game_day ──────────────────────────────────────────────────────────
// Walks the live window one NFL wave-substep at a time so the app UI can be checked
// as the football week progresses: kickoff a wave (scheduled -> in_progress with
// partial live scores), then final that wave (-> final with the real result), then
// the next wave, etc. When every game is final, flips to settling + scores the week.
async function advanceGameDay(admin: any, competition: string) {
  const cfg = await getConfig(admin, competition);
  const week = Number(cfg.current_week);
  const year = Number(cfg.season_year ?? 2025);
  const phase = String(cfg.current_phase ?? "REGULAR");

  const { data: games } = await admin.from("season_games")
    .select("game_id, kickoff_at, status").eq("competition", competition).eq("season_year", year).eq("week", week);
  if (!games || !games.length) return json({ success: false, error: "No games for this week" }, 400);

  const norm = (s: string) => (s || "").toLowerCase();
  const inProgress = games.filter((g: any) => norm(g.status).includes("progress"));
  const scheduled = games.filter((g: any) => norm(g.status) === "scheduled");
  const earliestWave = (set: any[]) => WAVE_ORDER.find(w => set.some((g: any) => detectWave(g.kickoff_at) === w));

  const srcMap = await sourceScoreMap(admin, week);

  // 1. Finish the wave that's currently live before kicking off the next.
  if (inProgress.length) {
    const wave = earliestWave(inProgress)!;
    const ids = inProgress.filter((g: any) => detectWave(g.kickoff_at) === wave).map((g: any) => g.game_id);
    await finalizeWaveGames(admin, competition, ids, srcMap);
    // Score INCREMENTALLY after each wave — not only at all-final — so
    // season_user_totals (and the realtime-subscribed Weekly Score widget)
    // ticks up as games finalize, mirroring production's live scorer
    // (nfl-calculate-scores → upsert_season_week_scores). scoreWeek counts only
    // games already FINAL (`ilike status %final%`), so a partial week scores
    // correctly and the upsert is idempotent as later waves land.
    await scoreWeek(admin, competition, year, week, phase);
    const { data: after } = await admin.from("season_games").select("status").eq("competition", competition).eq("season_year", year).eq("week", week);
    const allFinal = (after ?? []).every((g: any) => norm(g.status).includes("final"));
    if (allFinal) { await setConfig(admin, competition, "week_state", "settling"); }
    return json({ success: true, action: "advance_game_day", did: "final", wave, allFinal, state: await getConfig(admin, competition) }, 200);
  }

  // 2. Otherwise kick off the next scheduled wave.
  if (scheduled.length) {
    const wave = earliestWave(scheduled)!;
    const ids = scheduled.filter((g: any) => detectWave(g.kickoff_at) === wave).map((g: any) => g.game_id);
    await kickoffWaveGames(admin, competition, ids, srcMap);
    await setConfig(admin, competition, "week_state", "live");
    return json({ success: true, action: "advance_game_day", did: "kickoff", wave, state: await getConfig(admin, competition) }, 200);
  }

  // 3. Everything is final already — settle + score.
  await setConfig(admin, competition, "week_state", "settling");
  await scoreWeek(admin, competition, year, week, phase);
  return json({ success: true, action: "advance_game_day", did: "settle", allFinal: true, state: await getConfig(admin, competition) }, 200);
}

async function sourceScoreMap(admin: any, week: number): Promise<Map<string, any>> {
  const { data: src } = await admin.from("season_games")
    .select("game_id, home_score, away_score, winner_team").eq("competition", SOURCE_COMPETITION).eq("week", week);
  return new Map((src ?? []).map((g: any) => [String(g.game_id), g]));
}
function srcFor(gameId: string, srcMap: Map<string, any>) {
  return srcMap.get(String(gameId).replace(/^sim[_-]/, "")) || null;
}
// Kickoff: in_progress with partial (~half) live scores so the live UI has real numbers.
async function kickoffWaveGames(admin: any, competition: string, ids: string[], srcMap: Map<string, any>) {
  for (const id of ids) {
    const s = srcFor(id, srcMap);
    const home = s ? Math.floor((s.home_score ?? 14) / 2) : 7;
    const away = s ? Math.floor((s.away_score ?? 10) / 2) : 3;
    await admin.from("season_games")
      .update({ status: "in_progress", home_score: home, away_score: away, current_period: 2, game_clock: "8:30" })
      .eq("game_id", id).eq("competition", competition);
  }
}
// Final: real result from source (fallback deterministic home win).
async function finalizeWaveGames(admin: any, competition: string, ids: string[], srcMap: Map<string, any>) {
  for (const id of ids) {
    const s = srcFor(id, srcMap);
    const upd = s
      ? { status: "final", home_score: s.home_score, away_score: s.away_score, winner_team: s.winner_team, current_period: 4, game_clock: "0:00" }
      : { status: "final", home_score: 20, away_score: 17, winner_team: null, current_period: 4, game_clock: "0:00" };
    if (!s) { // deterministic fallback winner = home team
      const { data: g } = await admin.from("season_games").select("home_team").eq("game_id", id).single();
      (upd as any).winner_team = g?.home_team ?? null;
    }
    await admin.from("season_games").update(upd).eq("game_id", id).eq("competition", competition);
  }
}

// Locked NFL scoring (REFERENCE.md §7): +1 per correct regular pick; HotPick = +/- frozen_rank.
async function scoreWeek(admin: any, competition: string, year: number, week: number, phase: string) {
  const { data: games } = await admin.from("season_games")
    .select("game_id, rank, frozen_rank, winner_team").eq("competition", competition).eq("season_year", year).eq("week", week).ilike("status", "%final%");
  const gameMap = new Map((games ?? []).map((g: any) => [g.game_id, { rank: g.frozen_rank ?? g.rank ?? 1, winner: g.winner_team }]));

  const { data: picks } = await admin.from("season_picks")
    .select("user_id, game_id, picked_team, is_hotpick").eq("competition", competition).eq("season_year", year).eq("week", week);

  const byUser = new Map<string, any>();
  // Per-pick results written back to season_picks (points + is_correct), mirroring
  // production's nfl-calculate-scores. Without this the per-game points next to
  // FINAL on the picks cards never render in the sim (season_picks.points stays null).
  const pickResults: any[] = [];
  for (const p of picks ?? []) {
    const g: any = gameMap.get(p.game_id);
    if (!g) continue;
    // gameMap holds only FINAL games. A null winner is a DRAW → PUSH, not a loss:
    // the pick does not score at all (not counted in total_picks, no result row,
    // 0 pts; a HotPick takes a 0 swing so is_hotpick_correct stays null). A draw is
    // NEVER a loss. Matches _shared/scoring.ts push branch (register 2.7 / #360).
    if (g.winner === null) continue;
    const isWin = p.picked_team === g.winner;
    const agg = byUser.get(p.user_id) ?? { user_id: p.user_id, week_points: 0, correct_picks: 0, total_picks: 0, is_hotpick_correct: null, hotpick_rank: null };
    agg.total_picks += 1;
    let pickPoints = 0;
    if (p.is_hotpick) {
      agg.hotpick_rank = g.rank;
      if (isWin) { pickPoints = g.rank; agg.week_points += g.rank; agg.correct_picks += 1; agg.is_hotpick_correct = true; }
      else { pickPoints = -g.rank; agg.week_points -= g.rank; agg.is_hotpick_correct = false; }
    } else if (isWin) {
      pickPoints = 1; agg.week_points += 1; agg.correct_picks += 1;
    }
    pickResults.push({ user_id: p.user_id, game_id: p.game_id, is_correct: isWin, points: pickPoints });
    byUser.set(p.user_id, agg);
  }

  // Write per-pick results back to season_picks via the same RPC production uses.
  if (pickResults.length) {
    await admin.rpc("apply_season_pick_results", {
      p_competition: competition, p_season_year: year, p_week: week, p_results: pickResults,
    });
  }

  const rows = Array.from(byUser.values()).map((u: any) => ({
    user_id: u.user_id, competition, season_year: year, week, phase,
    week_points: u.week_points, correct_picks: u.correct_picks, total_picks: u.total_picks,
    is_hotpick_correct: u.is_hotpick_correct, hotpick_rank: u.hotpick_rank, is_no_show: false,
    scored_at: new Date().toISOString(),
  }));
  if (rows.length) await admin.from("season_user_totals").upsert(rows, { onConflict: "user_id,competition,season_year,week" });
}

async function invokeComputeHardware(admin: any, authHeader: string, competition: string, trigger: string) {
  // Fire-and-forget — awards must never block the state transition. compute-hardware
  // authorizes a super-admin via the Authorization JWT, so forward the caller's token.
  try { await admin.functions.invoke("compute-hardware", { body: { trigger, competition }, headers: { Authorization: authHeader } }); }
  catch (e) { console.error("[sim-operator] compute-hardware invoke failed", e); }
}

// ── settle_season_awards ────────────────────────────────────────────────────────
// Fires the season-end award engine (Pool Champion + podium) ON DEMAND, in
// isolation, for the rehearsal. This does NOT walk the phase machine — a real
// walk to SEASON_COMPLETE passes through the PLAYOFFS transition, which re-scopes
// the leaderboard and would wipe the engineered week-1 tie. Instead it just marks
// the season complete (so compute-hardware's season_settle gate passes) and
// INVOKES the live compute-hardware with the caller's super-admin token. It never
// redeploys or edits compute-hardware. Re-runnable for the idempotency check.
//
// HARD-LOCKED to the primary sandbox only (same lock as seed_bots) — it can never
// fire season_settle on nfl_2026 or any other competition.
async function settleSeasonAwards(admin: any, competition: string, authHeader: string) {
  if (competition !== SEED_BOTS_COMPETITION) {
    return json({ success: false, error: `settle_season_awards is locked to ${SEED_BOTS_COMPETITION}` }, 403);
  }
  const cfg = await getConfig(admin, competition);
  const seasonYear = Number(cfg.season_year ?? 2025);

  // Season-settle gate in compute-hardware requires is_season_complete = true.
  await setConfig(admin, competition, "is_season_complete", true);

  try {
    const { data, error } = await admin.functions.invoke("compute-hardware", {
      // Pass the sandbox's own season_year so award rows are tagged 2025, not the
      // compute-hardware default (2026).
      body: { trigger: "season_settle", competition, season_year: seasonYear },
      headers: { Authorization: authHeader },
    });
    if (error) {
      console.error("[sim-operator] settle_season_awards compute-hardware", error);
      return json({ success: false, error: `compute-hardware: ${error.message ?? String(error)}` }, 400);
    }
    return json({ success: true, action: "settle_season_awards", competition, season_year: seasonYear, compute_hardware: data }, 200);
  } catch (e) {
    console.error("[sim-operator] settle_season_awards invoke failed", e);
    return json({ success: false, error: "compute-hardware invoke failed — see function logs" }, 500);
  }
}

// ── advance_phase ─────────────────────────────────────────────────────────────
async function advancePhase(caller: any, admin: any, competition: string, authHeader: string) {
  const before = await getConfig(admin, competition);
  const fromPhase = String(before.current_phase);
  const seq = ["OFF_SEASON", "PRE_SEASON", "REGULAR", "REGULAR_COMPLETE", "PLAYOFFS", "SUPERBOWL_INTRO", "SUPERBOWL", "SEASON_COMPLETE"];
  const idx = seq.indexOf(fromPhase);
  if (idx < 0 || idx === seq.length - 1) return json({ success: false, error: `No next phase from "${fromPhase}"` }, 400);
  const toPhase = seq[idx + 1];

  // Delegate to the audited production owner of phase transitions.
  const { error } = await caller.rpc("admin_advance_season_phase", { p_competition: competition, p_phase: toPhase });
  if (error) { console.error("[sim-operator] admin_advance_season_phase", error); return json({ success: false, error: friendlyRpcError(error.message) }, 400); }

  // Mandatory side effects the spec requires (idempotent; applied on top of the RPC).
  if (toPhase === "PLAYOFFS") {
    await setConfig(admin, competition, "playoff_start_week", Number(before.current_week));
  }
  if (toPhase === "SEASON_COMPLETE") {
    await setConfig(admin, competition, "is_season_complete", true);
    await invokeComputeHardware(admin, authHeader, competition, "season_settle");
  }
  return json({ success: true, action: "advance_phase", from: fromPhase, to: toPhase, state: await getConfig(admin, competition) }, 200);
}

// ── jump_to_week ──────────────────────────────────────────────────────────────
async function jumpToWeek(admin: any, competition: string, targetWeek: any) {
  const cfg = await getConfig(admin, competition);
  const current = Number(cfg.current_week);
  const year = Number(cfg.season_year ?? 2025);
  const target = Number(targetWeek);
  if (!Number.isInteger(target) || target < 1 || target > 22) return json({ success: false, error: "target_week must be 1–22" }, 400);
  if (target <= current) return json({ success: false, error: "Cannot jump backward — target_week must be greater than current_week" }, 400);

  // Active members across this competition's pools.
  const { data: pools } = await admin.from("pools").select("id").eq("competition", competition);
  const poolIds = (pools ?? []).map((p: any) => p.id);
  const memberIds = new Set<string>();
  if (poolIds.length) {
    const { data: members } = await admin.from("pool_members").select("user_id").in("pool_id", poolIds).eq("status", "active");
    for (const m of members ?? []) memberIds.add(m.user_id);
  }

  // Neutral (0-pt) rows for each skipped week so the leaderboard has realistic shape.
  const rows: any[] = [];
  for (let w = current + 1; w <= target - 1; w++) {
    const phase = phaseForWeek(w);
    for (const uid of memberIds) {
      rows.push({ user_id: uid, competition, season_year: year, week: w, phase, week_points: 0, correct_picks: 0, total_picks: 0, is_no_show: true, scored_at: new Date().toISOString() });
    }
  }
  if (rows.length) await admin.from("season_user_totals").upsert(rows, { onConflict: "user_id,competition,season_year,week", ignoreDuplicates: true });

  await setConfig(admin, competition, "current_week", target);
  await setConfig(admin, competition, "week_state", "picks_open");
  return json({ success: true, action: "jump_to_week", from_week: current, to_week: target, skipped_rows: rows.length, state: await getConfig(admin, competition) }, 200);
}

// ── reset_to_off_season ───────────────────────────────────────────────────────
async function resetToOffSeason(admin: any, competition: string, callerId: string) {
  // Hard Rule #17 — audit FIRST; abort if the log write fails.
  const { error: auditErr } = await admin.from("admin_audit_log").insert({
    admin_id: callerId, action: "SIMULATOR_RESET", target_table: "competition_config", target_id: callerId,
    metadata: { competition },
  });
  if (auditErr) { console.error("[sim-operator] audit failed", auditErr); return json({ success: false, error: "Audit log write failed — reset aborted" }, 500); }

  await admin.from("season_picks").delete().eq("competition", competition);
  await admin.from("season_user_totals").delete().eq("competition", competition);
  await admin.from("user_hardware").update({ is_visible: false }).eq("competition", competition);

  // Reset every game back to a clean, pickable slate. Without this, games left
  // 'final'/'in_progress' by the prior sim run survive the reset and the next
  // week opens with un-pickable games. Mirrors the per-week reset in jumpToWeek.
  await admin.from("season_games")
    .update({ status: "scheduled", home_score: null, away_score: null, winner_team: null, is_finalized: false, current_period: null, game_clock: null })
    .eq("competition", competition);

  await setConfig(admin, competition, "current_phase", "OFF_SEASON");
  await setConfig(admin, competition, "current_week", 1);
  await setConfig(admin, competition, "week_state", "idle");
  await setConfig(admin, competition, "scoring_locked", false);
  await setConfig(admin, competition, "is_season_complete", false);

  return json({ success: true, action: "reset_to_off_season", message: `Reset complete. ${competition} is now OFF_SEASON week 1.`, state: await getConfig(admin, competition) }, 200);
}

// ── auto_pick_tom ─────────────────────────────────────────────────────────────
async function autoPickTom(admin: any, competition: string, callerId: string) {
  if (callerId !== TOM_USER_ID) return json({ success: false, error: "Auto-pick is restricted to the designated test account" }, 403);
  const cfg = await getConfig(admin, competition);
  const week = Number(cfg.current_week);
  const year = Number(cfg.season_year ?? 2025);

  const { data: existing } = await admin.from("season_picks").select("id").eq("user_id", TOM_USER_ID).eq("competition", competition).eq("week", week).limit(1);
  if (existing && existing.length) return json({ success: false, error: "Picks already submitted for this week" }, 400);

  const { data: games } = await admin.from("season_games")
    .select("game_id, home_team, away_team").eq("competition", competition).eq("season_year", year).eq("week", week).eq("status", "scheduled");
  if (!games || !games.length) return json({ success: false, error: "No scheduled games for this week — cannot auto-pick" }, 400);

  const hotpickIdx = Math.floor(Math.random() * games.length);
  const rows = games.map((g: any, i: number) => ({
    user_id: TOM_USER_ID, game_id: g.game_id, competition, season_year: year, week,
    picked_team: Math.random() < 0.5 ? g.home_team : g.away_team, is_hotpick: i === hotpickIdx,
  }));
  // enforce_pick_lock / enforce_single_hotpick fire per row; only scheduled games are inserted.
  const { error } = await admin.from("season_picks").insert(rows);
  if (error) { console.error("[sim-operator] auto-pick insert", error); return json({ success: false, error: "Auto-pick failed — some games may have locked" }, 400); }

  return json({ success: true, action: "auto_pick_tom", picks_submitted: rows.length, hotpick_game_id: rows[hotpickIdx].game_id }, 200);
}

// ── seed_bots ──────────────────────────────────────────────────────────────────
// Writes a full slate of picks for the 8 sandbox bots so the Ladder populates and
// each bot's weekly finish can be steered (incl. engineering a precise tie). Writes
// PICKS ONLY (Hard Rule #3) — the existing scoreWeek turns them into points on
// Complete; this never writes season_user_totals.
//
// Outcome timing (the spec's key design question): a pick is "correct" iff
// picked_team === the game's winner_team, and the winner is the REAL nfl_2025 result
// (sourceScoreMap), known deterministically at all times. So we seed at picks_open —
// while games are still 'scheduled' (enforce_pick_lock requires it) — reading the
// intended winners from source. No need to wait for Settle.
//
// targets: { "<botUUID>": { correct: <0..N>, hotpick: "win"|"lose"|"none" }, ... }
// Only the 8 hard-constant bot UUIDs are ever written; any other key is ignored, so
// tom / super-admin / a real user can never be targeted (spec §3C / §7). Idempotent:
// a bot that already has picks for the week is skipped (matches seedFakeWeekPicks).
async function seedBots(admin: any, competition: string, targetsRaw: any) {
  // Hard lock — defence in depth on top of the allowlist (spec §3C).
  if (competition !== SEED_BOTS_COMPETITION) {
    return json({ success: false, error: `seed_bots is locked to ${SEED_BOTS_COMPETITION}` }, 403);
  }
  const targets: Record<string, any> = (targetsRaw && typeof targetsRaw === "object") ? targetsRaw : {};

  const cfg = await getConfig(admin, competition);
  const week = Number(cfg.current_week);
  const year = Number(cfg.season_year ?? 2025);

  // Pickable slate — only 'scheduled' games can take picks (enforce_pick_lock).
  const { data: games } = await admin.from("season_games")
    .select("game_id, home_team, away_team, rank, frozen_rank, status")
    .eq("competition", competition).eq("season_year", year).eq("week", week).eq("status", "scheduled");
  if (!games || !games.length) {
    return json({ success: false, error: "No scheduled games for the current week — open picks first." }, 400);
  }

  // Intended winners from the real nfl_2025 results (deterministic, fixed).
  const srcMap = await sourceScoreMap(admin, week);
  const enriched = games.map((g: any) => {
    const s: any = srcFor(g.game_id, srcMap);
    return { ...g, rank: Number(g.frozen_rank ?? g.rank ?? 1), winner: s?.winner_team ?? null };
  });
  const decisive = enriched.filter((g: any) => g.winner !== null);

  // The week's single HotPick game: highest-rank game with a decisive winner (so a
  // HotPick can be deterministically won or lost). Its rank is the ± swing.
  const hotpickGame = decisive.slice().sort((a: any, b: any) => b.rank - a.rank)[0] ?? null;
  const hotpickRank = hotpickGame ? hotpickGame.rank : 0;

  // Skip-if-present idempotency.
  const { data: have } = await admin.from("season_picks")
    .select("user_id").eq("competition", competition).eq("week", week).in("user_id", SEED_BOTS.map((b) => b.id));
  const already = new Set((have ?? []).map((p: any) => p.user_id));

  const rows: any[] = [];
  const seeded: any[] = [];
  const skipped: any[] = [];

  for (const bot of SEED_BOTS) {
    if (already.has(bot.id)) { skipped.push({ id: bot.id, name: bot.name, reason: "already has picks" }); continue; }
    const t = targets[bot.id];
    if (!t) { skipped.push({ id: bot.id, name: bot.name, reason: "no target supplied" }); continue; }

    const hotpickMode = (t.hotpick === "win" || t.hotpick === "lose") ? t.hotpick : "none";
    const useHotpick = hotpickMode !== "none" && hotpickGame !== null;

    // Regular (non-hotpick) games this bot is scored on.
    const regular = enriched.filter((g: any) => !(useHotpick && g.game_id === hotpickGame.game_id));
    const regularDecisive = regular.filter((g: any) => g.winner !== null);

    // Clamp requested correct-count to what's achievable among decisive regular games.
    const want = Number.isFinite(Number(t.correct)) ? Math.max(0, Math.floor(Number(t.correct))) : 0;
    const correctN = Math.min(want, regularDecisive.length);
    const correctIds = new Set(regularDecisive.slice(0, correctN).map((g: any) => g.game_id));

    for (const g of regular) {
      let picked: string;
      if (correctIds.has(g.game_id)) picked = g.winner;                                   // correct
      else if (g.winner !== null) picked = g.winner === g.home_team ? g.away_team : g.home_team; // deliberately wrong
      else picked = g.home_team;                                                          // tie → scored as a loss anyway
      rows.push({ user_id: bot.id, game_id: g.game_id, competition, season_year: year, week, picked_team: picked, is_hotpick: false });
    }

    if (useHotpick) {
      const hp = hotpickGame;
      const picked = hotpickMode === "win" ? hp.winner : (hp.winner === hp.home_team ? hp.away_team : hp.home_team);
      rows.push({ user_id: bot.id, game_id: hp.game_id, competition, season_year: year, week, picked_team: picked, is_hotpick: true });
    }

    const expectedPoints = correctN + (useHotpick ? (hotpickMode === "win" ? hotpickRank : -hotpickRank) : 0);
    seeded.push({ id: bot.id, name: bot.name, correct: correctN, requested_correct: want, hotpick: useHotpick ? hotpickMode : "none", expected_points: expectedPoints });
  }

  if (rows.length) {
    const { error } = await admin.from("season_picks").insert(rows);
    if (error) { console.error("[sim-operator] seed_bots insert", error); return json({ success: false, error: "Seed insert failed — some games may have locked." }, 400); }
  }

  return json({
    success: true, action: "seed_bots", competition, week, hotpick_rank: hotpickRank,
    seeded, skipped, picks_written: rows.length,
    message: `Seeded ${seeded.length} bot(s) for Week ${week}, ${skipped.length} skipped. HotPick swing = ${hotpickRank}.`,
  }, 200);
}

// ── shared ────────────────────────────────────────────────────────────────────
function friendlyRpcError(msg: string): string {
  if (/WEEK_NOT_COMPLETE/i.test(msg)) return "Current week is not fully final yet — settle and complete it before advancing.";
  if (/SEASON_ENDED/i.test(msg)) return "Already at the final week — advance the phase instead.";
  if (/not authorized|super admin/i.test(msg)) return "Not authorized.";
  if (/invalid phase|unknown competition/i.test(msg)) return "Invalid phase transition for this competition.";
  // Surface the raw engine reason — this is a super-admin-only operator tool, and
  // hiding it (the old generic string) made the real cause undiagnosable.
  return "Engine: " + (msg || "unknown error").slice(0, 200);
}
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
