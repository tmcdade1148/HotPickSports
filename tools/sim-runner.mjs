#!/usr/bin/env node
// =============================================================================
// HotPick Season Simulator — Node runner (protected-environment simulator;
// supersedes the retired browser tool tools/season-simulator-v4.html).
//
// WHY THIS EXISTS
// The browser simulator did service-role REST writes straight from the page.
// Supabase's new API keys (sb_secret_…) are HARD-BLOCKED in browsers
// ("Forbidden use of secret API key in browser"), so that tool can no longer
// connect. This script runs the SAME operations from Node — a protected
// environment where the secret key is allowed — driving the nfl_2025_sim
// sandbox through its weekly lifecycle.
//
// SECRETS — never committed, never written to a file. Read from the environment:
//   SB_SECRET_KEY        (required)  the sb_secret_… key — service-role REST.
//   CRON_SHARED_SECRET   (required for scoring)  the x-cron-secret value used by
//                                    the cron-gated Edge Functions (Vault
//                                    cron_shared_secret). Only needed for
//                                    commands that call nfl-calculate-scores.
//
// Export them in your shell for the session (NOT in any tracked file):
//   export SB_SECRET_KEY='sb_secret_…'
//   export CRON_SHARED_SECRET='…64-hex…'
//   node tools/sim-runner.mjs status
//
// Optional overrides (defaults mirror the HTML's query-param defaults):
//   SIM_COMPETITION (nfl_2025_sim)  SIM_SOURCE (nfl_2025)  SIM_SEASON (2025)
//   SIM_POOL_ID     (Proving Grounds pool)   SIM_REVIEWER_ID (Mel)
//   SIM_TESTER_ID   (auto-pick test account; defaults to reviewer)
//
// USAGE
//   node tools/sim-runner.mjs <command> [args] [--tester] [--yes]
//   node tools/sim-runner.mjs help
// =============================================================================

const SUPABASE_URL = 'https://mzqtrpdiqhopjmxjccwy.supabase.co'; // public, fine to hardcode

const COMPETITION = process.env.SIM_COMPETITION || 'nfl_2025_sim';
const SOURCE_COMP = process.env.SIM_SOURCE || 'nfl_2025';
const SEASON_YEAR = Number(process.env.SIM_SEASON || 2025);
const PROVING_GROUNDS_POOL_ID = process.env.SIM_POOL_ID || '1178a95d-7689-4348-a472-1852cb8c89b8';
const REVIEWER_USER_ID = process.env.SIM_REVIEWER_ID || '55ed62e4-9fe3-45d6-b9a0-a1819d81387b';
const TESTER_USER_ID = process.env.SIM_TESTER_ID || REVIEWER_USER_ID;

const SECRET_KEY = process.env.SB_SECRET_KEY || '';
const CRON_SECRET = process.env.CRON_SHARED_SECRET || '';

// Competitions this runner may WRITE to. The simulator exists only to drive the
// sandbox; live/production competitions (nfl_2026, the real nfl_2025 source,
// world_cup_2026) are READ-ONLY here. The `status` and `monitor` commands read
// any competition; every mutating command refuses a target outside this set.
// Enforced twice (defense in depth): once at dispatch, and again per-request in
// api()/callEdgeFunction() so a future write path can't silently escape it.
// Override only to add another genuine sandbox: SIM_WRITE_ALLOWLIST=a,b,c.
const SIM_WRITE_ALLOWLIST = new Set(
  (process.env.SIM_WRITE_ALLOWLIST || 'nfl_2025_sim,nfl_2025_simA,nfl_2025_simG,nfl_demo')
    .split(',').map((s) => s.trim()).filter(Boolean)
);
function assertWritableTarget(comp) {
  if (!SIM_WRITE_ALLOWLIST.has(comp)) {
    throw new Error(
      `Refusing to WRITE to "${comp}" — not a sim sandbox. Writes are allowed only for: ` +
      `${[...SIM_WRITE_ALLOWLIST].join(', ')}. (Reads are fine: "status" / "monitor ${comp}" work read-only.)`
    );
  }
}

// ── tiny logger ──
const C = { dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', cyn: '\x1b[36m', rst: '\x1b[0m' };
function log(msg, type = 'info') {
  const t = new Date().toISOString().slice(11, 19);
  const c = type === 'error' ? C.red : type === 'success' ? C.grn : type === 'warn' ? C.yel : C.cyn;
  console.log(`${C.dim}${t}${C.rst} ${c}${msg}${C.rst}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── REST + Edge Function clients (service-role; Node, not a browser) ──
async function api(path, method = 'GET', body = null) {
  if (!SECRET_KEY) throw new Error('SB_SECRET_KEY is not set in the environment.');
  // Defense in depth: a write (PATCH/POST/DELETE) whose path names a competition
  // must target a sandbox. GET reads any competition (that's how `monitor` watches
  // nfl_2026). RPC/edge writes carry the competition in the body, not the path —
  // those are gated by the dispatch guard + callEdgeFunction().
  if (method !== 'GET') {
    const m = /[?&]competition=eq\.([^&]+)/.exec(path);
    if (m) assertWritableTarget(decodeURIComponent(m[1]));
  }
  const headers = {
    apikey: SECRET_KEY,
    Authorization: `Bearer ${SECRET_KEY}`,
    'Content-Type': 'application/json',
  };
  if (method === 'PATCH' || method === 'POST' || method === 'DELETE') headers['Prefer'] = 'return=representation';
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function callEdgeFunction(name, body) {
  // Scoring/finalize functions mutate the named competition — keep them sandbox-only.
  if (body && body.competition) assertWritableTarget(body.competition);
  if (!CRON_SECRET) {
    throw new Error(
      `CRON_SHARED_SECRET is not set — required to call ${name} (cron-gated Edge Function). ` +
      `export CRON_SHARED_SECRET='…' and retry.`
    );
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: SECRET_KEY,
      Authorization: `Bearer ${SECRET_KEY}`,
      'x-cron-secret': CRON_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${name} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ── pure helpers (ported verbatim from the HTML) ──
function detectWave(kickoffAt) {
  const d = new Date(kickoffAt);
  const day = d.getUTCDay();
  const hour = d.getUTCHours();
  if (day === 4 && hour >= 17) return 'thursday';
  if (day === 5 && hour < 4) return 'thursday';
  if (day === 0 && hour >= 17 && hour < 20) return 'sunday1';
  if (day === 0 && hour >= 20 && hour < 23) return 'sunday4';
  if (day === 0 && hour >= 23) return 'snf';
  if (day === 1 && hour < 4) return 'snf';
  if (day === 1 && hour >= 17) return 'mnf';
  if (day === 2 && hour < 4) return 'mnf';
  if (day === 5) return 'sunday1';
  if (day === 6) return 'sunday1';
  return 'sunday1';
}
const WAVE_ORDER = ['thursday', 'sunday1', 'sunday4', 'snf', 'mnf'];
const waveLabel = (w) => ({ thursday: 'Thursday', sunday1: 'Sunday 1pm', sunday4: 'Sunday 4pm', snf: 'SNF', mnf: 'MNF' }[w] || w);
function phaseForWeek(week) {
  if (week >= 22) return 'SUPERBOWL';
  if (week >= 19) return 'PLAYOFFS';
  return 'REGULAR';
}
function totalsPhaseForWeek(week) {
  if (week === 19) return 'WILDCARD';
  if (week === 20) return 'DIVISIONAL';
  if (week === 21) return 'CONFERENCE';
  if (week === 22) return 'SUPERBOWL';
  return 'REGULAR';
}

const FAKE_MEMBERS = [
  { id: '11111111-1111-4111-8111-000000000001', name: 'The Gunslinger', hpRank: 13 },
  { id: '11111111-1111-4111-8111-000000000002', name: 'Salty Sarah', hpRank: 12 },
  { id: '11111111-1111-4111-8111-000000000003', name: 'DSmiley', hpRank: 9 },
  { id: '11111111-1111-4111-8111-000000000004', name: 'P-Train', hpRank: 11 },
  { id: '11111111-1111-4111-8111-000000000005', name: 'BigSwingJake', hpRank: 8 },
  { id: '11111111-1111-4111-8111-000000000006', name: 'The Oracle', hpRank: 1 },
  { id: '11111111-1111-4111-8111-000000000007', name: 'ChrisP', hpRank: 2 },
  { id: '11111111-1111-4111-8111-000000000008', name: 'LateNightMia', hpRank: 10 },
];

// ── config read/write ──
async function readConfigFor(comp) {
  const cfg = await api(`competition_config?competition=eq.${comp}&select=key,value`);
  return Object.fromEntries((cfg || []).map((r) => [r.key, r.value]));
}
async function readConfig() {
  return readConfigFor(COMPETITION);
}
async function setConfig(key, value) {
  await api(`competition_config?competition=eq.${COMPETITION}&key=eq.${key}`, 'PATCH', { value });
}
async function currentWeek() {
  const cfg = await readConfig();
  return cfg.current_week == null ? null : Number(cfg.current_week);
}

async function loadWeekGames(wk) {
  const source = await api(
    `season_games?competition=eq.${SOURCE_COMP}&week=eq.${wk}&select=game_id,week,home_team,away_team,kickoff_at,home_score,away_score,winner_team,frozen_rank&order=kickoff_at.asc`
  );
  const sim = await api(
    `season_games?competition=eq.${COMPETITION}&week=eq.${wk}&select=game_id,home_team,away_team,kickoff_at,home_score,away_score,winner_team,status,frozen_rank,lock_at&order=kickoff_at.asc`
  );
  return { source: source || [], sim: sim || [] };
}

// ── status ──
async function cmdStatus() {
  const cfg = await readConfig();
  const wk = cfg.current_week;
  log(`Competition: ${COMPETITION}  (source ${SOURCE_COMP}, season ${SEASON_YEAR})`, 'info');
  log(`  current_week  = ${cfg.current_week ?? '—'}`, 'info');
  log(`  current_phase = ${cfg.current_phase ?? '—'}`, 'info');
  log(`  week_state    = ${cfg.week_state ?? '—'}`, 'info');
  log(`  picks_open    = ${cfg.picks_open ?? '—'}   picks_locked = ${cfg.picks_locked ?? '—'}`, 'info');
  log(`  scoring_locked = ${cfg.scoring_locked ?? '—'}`, cfg.scoring_locked ? 'warn' : 'info');
  if (wk != null) {
    const { source, sim } = await loadWeekGames(Number(wk));
    const byStatus = {};
    for (const g of sim) {
      const s = (g.status || 'scheduled').toUpperCase();
      byStatus[s] = (byStatus[s] || 0) + 1;
    }
    log(`  Week ${wk}: ${sim.length} sim games (${Object.entries(byStatus).map(([s, n]) => `${n} ${s}`).join(', ') || 'none'}), ${source.length} source games`, 'info');
  }
}

// ── monitor (READ-ONLY) — the Engine Monitor, folded into the runner ──
// Prints week state + the Tuesday-morning readiness chain for ANY competition,
// including live production (nfl_2026), read-only. Never writes. This is the
// replacement for the browser engine-monitor HTML, which can't run under the new
// keys (secret keys are hard-blocked in browsers; the publishable key is anon and
// these tables are authenticated-only). The service key works fine here in Node.
function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}
function readinessStep(label, status, detail, at, err) {
  const s = status || 'pending';
  const icon = s === 'ok' ? '✅' : s === 'failed' ? '❌' : (s === 'pending' || s == null) ? '⏳' : '•';
  const type = s === 'ok' ? 'success' : s === 'failed' ? 'error' : 'info';
  log(`  ${icon} ${label.padEnd(22)} ${String(detail).padEnd(14)} ${fmtTs(at)}`, type);
  if (err) log(`       ↳ ${err}`, 'error');
}

async function cmdMonitor(comp) {
  log(`Engine Monitor (read-only) — ${comp}`, 'info');
  const cfg = await readConfigFor(comp);
  const wk = cfg.current_week != null ? Number(cfg.current_week) : null;

  // Week state (from competition_config)
  log(`  current_week  = ${cfg.current_week ?? '—'}    current_phase = ${cfg.current_phase ?? '—'}`, 'info');
  log(`  week_state    = ${cfg.week_state ?? '—'}    picks_open = ${cfg.picks_open ?? '—'}   picks_locked = ${cfg.picks_locked ?? '—'}`, 'info');
  log(`  scoring_locked = ${cfg.scoring_locked ?? '—'}`, cfg.scoring_locked ? 'warn' : 'info');

  // Readiness chain (from week_readiness) — tolerate an unpopulated table.
  const rows = await api(`week_readiness?competition=eq.${comp}&select=*&order=week_number.desc`);
  const r = (rows && rows.length)
    ? ((wk != null && rows.find((x) => Number(x.week_number) === wk)) || rows[0])
    : null;
  log(`  ── Readiness chain${r ? ` (week ${r.week_number})` : ''} ──`, 'info');
  if (!r) {
    log('  No week_readiness row yet for this competition (prep steps have not run, or readiness is not populated here).', 'warn');
  } else {
    readinessStep('Games loaded', r.games_status, r.games_count != null ? `${r.games_count}` : 'ok', r.games_at, null);
    readinessStep('Spreads & moneylines', r.odds_status,
      r.odds_expected != null ? `${r.odds_count ?? 0}/${r.odds_expected}` : `${r.odds_count ?? 0}`, r.odds_at, r.odds_error);
    readinessStep('Ranks calculated', r.ranks_status,
      r.games_count != null ? `${r.ranks_count ?? 0}/${r.games_count}` : `${r.ranks_count ?? 0}`, r.ranks_at, r.ranks_error);
    const gateOpen = r.games_status === 'ok' && r.odds_status === 'ok' && r.ranks_status === 'ok'
      && (r.odds_expected == null || (r.odds_count ?? 0) >= r.odds_expected)
      && (r.games_count == null || (r.ranks_count ?? 0) >= r.games_count);
    log(gateOpen
      ? '  ✅ Readiness gate OPEN — safe to open picks.'
      : '  ❌ Readiness gate CLOSED — do not open picks until every step is green.',
    gateOpen ? 'success' : 'error');
  }

  // Games summary for the current week (read-only)
  if (wk != null) {
    const games = await api(`season_games?competition=eq.${comp}&week=eq.${wk}&select=status`);
    const byStatus = {};
    let final = 0;
    for (const g of (games || [])) {
      const s = (g.status || 'scheduled').toUpperCase();
      byStatus[s] = (byStatus[s] || 0) + 1;
      if (s.includes('FINAL')) final++;
    }
    const total = (games || []).length;
    const summary = Object.entries(byStatus).map(([s, n]) => `${n} ${s}`).join(', ') || 'none';
    log(`  Week ${wk} games: ${total} (${summary})${total > 0 && final === total ? '  — all FINAL' : ''}`, 'info');
  }
}

// ── pre-week reset of a single week ──
async function cpResetWeek(wk) {
  log(`Resetting Week ${wk} sim games to scheduled…`);
  await api(`season_games?competition=eq.${COMPETITION}&week=eq.${wk}`, 'PATCH', {
    status: 'scheduled', home_score: null, away_score: null, winner_team: null,
    is_finalized: false, current_period: null, game_clock: null, lock_at: null,
  });
  log(`✓ Week ${wk} reset.`, 'success');
}

// ── open picks (phase gate + seed fake picks; optional tester) ──
async function cpOpenPicks(wk, { tester } = {}) {
  log(`[Week ${wk}] Opening picks…`);
  const cfg = await readConfig();
  const targetPhase = phaseForWeek(wk);
  if (cfg.current_phase !== targetPhase) {
    log(`Phase ${cfg.current_phase} → ${targetPhase} for Week ${wk}…`);
    await setConfig('current_phase', targetPhase);
    if (targetPhase === 'PLAYOFFS' || targetPhase === 'SUPERBOWL') await setConfig('playoff_start_week', 19);
  }
  await setConfig('week_state', 'picks_open');
  await setConfig('picks_open', true);
  await setConfig('picks_locked', false);
  await api(`season_games?competition=eq.${COMPETITION}&week=eq.${wk}`, 'PATCH', { lock_at: null });
  await seedFakeWeekPicks(wk);
  if (tester) await seedTesterWeekPicks(wk);
  log(`✓ Week ${wk} picks open.`, 'success');
}

async function seedFakeWeekPicks(wk) {
  const ids = FAKE_MEMBERS.map((f) => f.id).join(',');
  const existing = await api(`season_picks?competition=eq.${COMPETITION}&week=eq.${wk}&user_id=in.(${ids})&select=user_id`);
  const have = new Set((existing || []).map((p) => p.user_id));
  const toSeed = FAKE_MEMBERS.filter((f) => !have.has(f.id));
  if (toSeed.length === 0) { log(`All fakes already have Week ${wk} picks — skipping seed.`); return; }

  const { sim } = await loadWeekGames(wk);
  const weekGames = sim.filter((g) => g.game_id && g.frozen_rank != null);
  if (weekGames.length === 0) { log(`No Week ${wk} games with frozen_rank — cannot seed fake picks.`, 'error'); return; }

  const rows = [];
  for (const fake of toSeed) {
    for (const g of weekGames) {
      const isHp = g.frozen_rank === fake.hpRank;
      const parity = (fake.id.charCodeAt(fake.id.length - 1) + g.frozen_rank) % 2;
      const pickedTeam = isHp ? g.home_team : (parity === 0 ? g.home_team : g.away_team);
      rows.push({ user_id: fake.id, game_id: g.game_id, competition: COMPETITION, season_year: SEASON_YEAR, week: wk, picked_team: pickedTeam, is_hotpick: isHp });
    }
  }
  await api('season_picks', 'POST', rows);
  log(`✓ Seeded ${rows.length} fake picks for ${toSeed.length} members (Week ${wk}).`, 'success');
}

async function seedTesterWeekPicks(wk) {
  const uid = TESTER_USER_ID;
  const existing = await api(`season_picks?competition=eq.${COMPETITION}&week=eq.${wk}&user_id=eq.${uid}&select=user_id`);
  if (existing && existing.length > 0) { log(`Test account already has Week ${wk} picks — skipping.`); return; }
  const { sim } = await loadWeekGames(wk);
  const weekGames = sim.filter((g) => g.game_id && g.frozen_rank != null);
  if (weekGames.length === 0) { log(`No Week ${wk} games with frozen_rank — cannot seed test-account picks.`, 'warn'); return; }
  const hpRank = Math.max(...weekGames.map((g) => g.frozen_rank));
  const rows = weekGames.map((g) => {
    const isHp = g.frozen_rank === hpRank;
    const parity = (wk + g.frozen_rank) % 2;
    const pickedTeam = isHp ? g.home_team : (parity === 0 ? g.home_team : g.away_team);
    return { user_id: uid, game_id: g.game_id, competition: COMPETITION, season_year: SEASON_YEAR, week: wk, picked_team: pickedTeam, is_hotpick: isHp };
  });
  await api('season_picks', 'POST', rows);
  log(`✓ Seeded test account (${uid.slice(0, 8)}…) Week ${wk} picks (HotPick rank ${hpRank}).`, 'success');
}

async function seedPlaceholderWeekTotals(wk) {
  const picks = await api(`season_picks?competition=eq.${COMPETITION}&week=eq.${wk}&select=user_id`);
  const userIds = [...new Set((picks || []).map((p) => p.user_id))];
  if (userIds.length === 0) return;
  const existing = await api(`season_user_totals?competition=eq.${COMPETITION}&week=eq.${wk}&select=user_id`);
  const have = new Set((existing || []).map((r) => r.user_id));
  const toInsert = userIds.filter((id) => !have.has(id));
  if (toInsert.length === 0) return;
  const rows = toInsert.map((uid) => ({
    user_id: uid, competition: COMPETITION, season_year: SEASON_YEAR, week: wk, phase: totalsPhaseForWeek(wk),
    week_points: 0, playoff_points: 0, correct_picks: 0, total_picks: 0, is_hotpick_correct: null, hotpick_rank: null,
    is_no_show: false, double_down_used: false, double_down_delta: 0, mulligan_used: false, scored_at: new Date().toISOString(),
  }));
  await api('season_user_totals', 'POST', rows);
  log(`✓ Seeded ${rows.length} placeholder totals rows for Week ${wk}.`, 'success');
}

// ── wave kickoff / finalize ──
async function cpKickoffWave(wk, wave, weekStateBefore) {
  const { sim } = await loadWeekGames(wk);
  const matching = sim.filter((g) => detectWave(g.kickoff_at) === wave);
  if (matching.length === 0) { log(`No ${waveLabel(wave)} games this week — skipping.`); return weekStateBefore; }
  const thisIdx = WAVE_ORDER.indexOf(wave);
  const PAST = '2020-01-01T00:00:00Z';
  const FAR = '2099-01-01T00:00:00Z';
  for (const g of sim) {
    const gIdx = WAVE_ORDER.indexOf(detectWave(g.kickoff_at));
    if (gIdx === thisIdx) await api(`season_games?competition=eq.${COMPETITION}&game_id=eq.${g.game_id}`, 'PATCH', { lock_at: PAST });
    else if (gIdx > thisIdx) await api(`season_games?competition=eq.${COMPETITION}&game_id=eq.${g.game_id}`, 'PATCH', { lock_at: FAR });
  }
  for (const g of matching) {
    await api(`season_games?competition=eq.${COMPETITION}&game_id=eq.${g.game_id}`, 'PATCH',
      { status: 'IN_PROGRESS', current_period: 1, game_clock: '15:00', home_score: 0, away_score: 0 });
  }
  let ws = weekStateBefore;
  if (weekStateBefore !== 'live') {
    await setConfig('week_state', 'live');
    await seedPlaceholderWeekTotals(wk);
    ws = 'live';
  }
  log(`🏈 ${waveLabel(wave)} kicked off (${matching.length} game${matching.length !== 1 ? 's' : ''}).`, 'success');
  return ws;
}

async function cpFinalizeWave(wk, wave) {
  const { source, sim } = await loadWeekGames(wk);
  const matching = sim.filter((g) => detectWave(g.kickoff_at) === wave);
  if (matching.length === 0) { log(`No ${waveLabel(wave)} games — skipping.`); return; }
  const srcById = Object.fromEntries(source.map((sg) => ['sim_' + sg.game_id, sg]));
  for (const g of matching) {
    const src = srcById[g.game_id];
    if (!src) continue;
    await api(`season_games?competition=eq.${COMPETITION}&game_id=eq.${g.game_id}`, 'PATCH', {
      status: 'FINAL', home_score: src.home_score, away_score: src.away_score, winner_team: src.winner_team,
      is_finalized: true, current_period: null, game_clock: null,
    });
  }
  log(`✅ ${waveLabel(wave)} finalized (${matching.length} games).`, 'success');
  try {
    const r = await callEdgeFunction('nfl-calculate-scores', { competition: COMPETITION, week: wk });
    log(`🧮 Partial score: ${r.users_scored ?? 0} users, ${r.final_games ?? 0} final games.`);
  } catch (e) { log(`Partial scoring failed: ${e.message}`, 'warn'); }
}

// ── end week (force ALL final + full scoring) + complete + next ──
async function cpEndWeek(wk) {
  log(`[Week ${wk}] Forcing all games FINAL and scoring…`);
  const { source, sim } = await loadWeekGames(wk);
  const srcById = Object.fromEntries(source.map((sg) => ['sim_' + sg.game_id, sg]));
  for (const g of sim) {
    const src = srcById[g.game_id];
    if (!src) continue;
    await api(`season_games?competition=eq.${COMPETITION}&game_id=eq.${g.game_id}`, 'PATCH', {
      status: 'FINAL', home_score: src.home_score, away_score: src.away_score, winner_team: src.winner_team, is_finalized: true,
    });
  }
  try {
    const r = await callEdgeFunction('nfl-calculate-scores', { competition: COMPETITION, week: wk });
    log(`🧮 Full scoring: ${r.users_scored ?? 0} users, ${r.final_games ?? 0} final games.`, 'success');
  } catch (e) { log(`Full scoring failed: ${e.message}`, 'error'); throw e; }
  await setConfig('week_state', 'settling');
  log('Week state → settling.');
}

async function cpCompleteWeek(wk) {
  await setConfig('week_state', 'complete');
  log(`🏁 Week ${wk} complete.`, 'success');
}

async function cpNextWeek(wk) {
  const next = (wk || 0) + 1;
  await setConfig('current_week', next);
  await setConfig('week_state', 'picks_open');
  await setConfig('picks_open', true);
  await setConfig('picks_locked', false);
  const targetPhase = phaseForWeek(next);
  await setConfig('current_phase', targetPhase);
  if (targetPhase === 'PLAYOFFS' || targetPhase === 'SUPERBOWL') await setConfig('playoff_start_week', 19);
  log(`🔓 Advanced to Week ${next} (${targetPhase}).`, 'success');
  return next;
}

// ── run an entire week through its lifecycle (open → waves → end → complete) ──
async function runEntireWeek(wk, { tester } = {}) {
  log(`=== Run entire Week ${wk} ===`);
  await cpResetWeek(wk);
  await cpOpenPicks(wk, { tester });
  let ws = 'picks_open';
  const { sim } = await loadWeekGames(wk);
  const wavesPresent = WAVE_ORDER.filter((w) => sim.some((g) => detectWave(g.kickoff_at) === w));
  for (const wave of wavesPresent) {
    ws = await cpKickoffWave(wk, wave, ws);
    await cpFinalizeWave(wk, wave);
  }
  await cpEndWeek(wk);
  await cpCompleteWeek(wk);
  log(`=== Week ${wk} done. ===`, 'success');
}

async function runSeason(from, to, { tester } = {}) {
  for (let wk = from; wk <= to; wk++) {
    await runEntireWeek(wk, { tester });
    if (wk >= 22) { log('=== Season complete — Week 22 done. ===', 'success'); break; }
    if (wk === 18) {
      log('=== Week 18 done — REGULAR SEASON COMPLETE ===');
      await setPhaseOnly('REGULAR_COMPLETE', 'idle', false);
    }
    if (wk < to) await cpNextWeek(wk);
  }
}

// ── phase / jump / scoring-lock ──
async function setPhaseOnly(phase, weekState, picksOpen) {
  log(`Setting phase → ${phase} (week_state=${weekState}, picks_open=${picksOpen})…`);
  await setConfig('current_phase', phase);
  await setConfig('week_state', weekState);
  await setConfig('picks_open', picksOpen);
  await setConfig('is_season_complete', phase === 'SEASON_COMPLETE');
  log(`✓ Phase set to ${phase}. No data wiped.`, 'success');
}

async function jumpToWeek(n, { tester } = {}) {
  if (!Number.isInteger(n) || n < 1 || n > 22) throw new Error('Enter a week between 1 and 22.');
  const targetPhase = phaseForWeek(n);
  log(`=== Jumping to Week ${n} (${targetPhase}) — resets Week ${n} only ===`);
  await setConfig('current_week', n);
  await setConfig('current_phase', targetPhase);
  await setConfig('week_state', 'picks_open');
  await setConfig('picks_open', true);
  await setConfig('picks_locked', false);
  if (n >= 19) await setConfig('playoff_start_week', 19);
  await api(`season_picks?competition=eq.${COMPETITION}&week=eq.${n}`, 'DELETE');
  await api(`season_user_totals?competition=eq.${COMPETITION}&week=eq.${n}`, 'DELETE');
  await api(`season_games?competition=eq.${COMPETITION}&week=eq.${n}`, 'PATCH', {
    status: 'scheduled', home_score: null, away_score: null, winner_team: null,
    is_finalized: false, current_period: null, game_clock: null, lock_at: null,
  });
  await seedFakeWeekPicks(n);
  if (tester) await seedTesterWeekPicks(n);
  log(`=== Now at Week ${n} (${targetPhase}), picks open. ===`, 'success');
}

async function setScoringLock(on) {
  await setConfig('scoring_locked', on);
  log(`✓ scoring_locked → ${on}.`, on ? 'warn' : 'success');
}

// ── reviewer resets ──
async function resetReviewerCurrentWeek(wk) {
  log(`Resetting reviewer picks for Week ${wk}…`);
  await api(`season_picks?user_id=eq.${REVIEWER_USER_ID}&competition=eq.${COMPETITION}&week=eq.${wk}`, 'DELETE');
  await api(`season_user_totals?user_id=eq.${REVIEWER_USER_ID}&competition=eq.${COMPETITION}&week=eq.${wk}`, 'DELETE');
  await api(`smack_messages?user_id=eq.${REVIEWER_USER_ID}`, 'DELETE');
  await api(`smack_read_state?user_id=eq.${REVIEWER_USER_ID}`, 'DELETE');
  const r = await callEdgeFunction('nfl-calculate-scores', { competition: COMPETITION, week: wk });
  log(`✓ Reviewer reset complete. ${r.users_scored ?? 0} users rescored.`, 'success');
}

async function resetToWeek8() {
  log('=== Resetting sim to App Review state (Week 8) ===');
  await api(`season_picks?competition=eq.${COMPETITION}&week=gte.8`, 'DELETE');
  await api(`season_user_totals?competition=eq.${COMPETITION}&week=gte.8`, 'DELETE');
  await api(`season_games?competition=eq.${COMPETITION}&week=gte.8`, 'PATCH', {
    status: 'scheduled', home_score: null, away_score: null, winner_team: null, is_finalized: false,
    current_period: null, game_clock: null, q1_home_score: null, q1_away_score: null,
    q2_home_score: null, q2_away_score: null, q3_home_score: null, q3_away_score: null, lock_at: null,
  });
  await setConfig('current_week', 8);
  await setConfig('week_state', 'picks_open');
  await setConfig('picks_open', true);
  await setConfig('picks_locked', false);
  await seedFakeWeekPicks(8);
  await api(`smack_read_state?user_id=eq.${REVIEWER_USER_ID}`, 'DELETE');
  await api(`smack_messages?user_id=eq.${REVIEWER_USER_ID}`, 'DELETE');
  log('=== Reset complete. Sim is ready for App Review (Week 8 picks_open). ===', 'success');
}

async function resetToStart() {
  log('=== Resetting sim to start-of-season state (Week 1) ===');
  await api(`season_picks?competition=eq.${COMPETITION}&week=gte.1&week=lte.22`, 'DELETE');
  await api(`season_user_totals?competition=eq.${COMPETITION}&week=gte.1&week=lte.22`, 'DELETE');
  await api(`season_games?competition=eq.${COMPETITION}&week=gte.1&week=lte.22`, 'PATCH', {
    status: 'scheduled', home_score: null, away_score: null, winner_team: null, is_finalized: false,
    current_period: null, game_clock: null, q1_home_score: null, q1_away_score: null,
    q2_home_score: null, q2_away_score: null, q3_home_score: null, q3_away_score: null, lock_at: null,
  });
  await setConfig('current_phase', 'REGULAR');
  await setConfig('current_week', 1);
  await setConfig('week_state', 'picks_open');
  await setConfig('picks_open', true);
  await setConfig('picks_locked', false);
  await setConfig('is_season_complete', false);
  await setConfig('scoring_locked', false);
  await seedFakeWeekPicks(1);
  await api(`smack_messages?pool_id=eq.${PROVING_GROUNDS_POOL_ID}`, 'DELETE');
  await api(`smack_read_state?pool_id=eq.${PROVING_GROUNDS_POOL_ID}`, 'DELETE');
  log('=== Reset complete. Sim is at Week 1 picks_open. ===', 'success');
}

async function resetToPreseason() {
  log('=== Resetting sim to PRE_SEASON state ===');
  await api(`season_picks?competition=eq.${COMPETITION}&week=gte.1&week=lte.22`, 'DELETE');
  await api(`season_user_totals?competition=eq.${COMPETITION}&week=gte.1&week=lte.22`, 'DELETE');
  await api(`season_games?competition=eq.${COMPETITION}&week=gte.1&week=lte.22`, 'PATCH', {
    status: 'scheduled', home_score: null, away_score: null, winner_team: null, is_finalized: false,
    current_period: null, game_clock: null, q1_home_score: null, q1_away_score: null,
    q2_home_score: null, q2_away_score: null, q3_home_score: null, q3_away_score: null, lock_at: null,
  });
  await setConfig('current_phase', 'PRE_SEASON');
  await setConfig('current_week', 1);
  await setConfig('week_state', 'idle');
  await setConfig('picks_open', false);
  await setConfig('picks_locked', false);
  await setConfig('is_season_complete', false);
  await setConfig('scoring_locked', false);
  await api(`smack_messages?pool_id=eq.${PROVING_GROUNDS_POOL_ID}`, 'DELETE');
  await api(`smack_read_state?pool_id=eq.${PROVING_GROUNDS_POOL_ID}`, 'DELETE');
  log('=== Reset complete. Sim is in PRE_SEASON (no picks). ===', 'success');
}

async function refreezeReviewer() {
  if (COMPETITION !== 'nfl_2025_simA' && COMPETITION !== 'nfl_2025_simG') {
    throw new Error('Re-freeze only applies to nfl_2025_simA / nfl_2025_simG (set SIM_COMPETITION).');
  }
  log(`=== Re-freezing ${COMPETITION} via reset_reviewer_sim() ===`);
  const res = await api('rpc/reset_reviewer_sim', 'POST', { p_competition: COMPETITION });
  const summary = Array.isArray(res) ? res[0] : res;
  log(`✓ ${typeof summary === 'string' ? summary : JSON.stringify(summary)}`, 'success');
}

// ── arg parsing + dispatch ──
function parseArgs(argv) {
  const flags = { tester: false, yes: false };
  const pos = [];
  for (const a of argv) {
    if (a === '--tester' || a === '-t') flags.tester = true;
    else if (a === '--yes' || a === '-y') flags.yes = true;
    else pos.push(a);
  }
  return { pos, flags };
}

const HELP = `HotPick Season Simulator — Node runner

Required env:  SB_SECRET_KEY (sb_secret_…)   CRON_SHARED_SECRET (for scoring commands)
Target (env):  SIM_COMPETITION=${COMPETITION}  SIM_SOURCE=${SOURCE_COMP}  SIM_SEASON=${SEASON_YEAR}
Writes allowed only on sandboxes: ${[...SIM_WRITE_ALLOWLIST].join(', ')}
               (status + monitor read ANY competition, including live nfl_2026)

Commands:
  status                         Show config + current-week game status
  monitor [competition]          READ-ONLY: week state + readiness chain (any comp, incl. nfl_2026)
  run-week [week] [--tester]     Full week: reset→open(seed)→waves→score→complete
  run-season [from] [to] [-t]    Step weeks from..to (default current..22)
  open-picks [week] [--tester]   Open picks + seed fake (and tester) picks
  kickoff <wave> [week]          Kick off a wave (thursday|sunday1|sunday4|snf|mnf)
  finalize <wave> [week]         Finalize a wave from source + partial score
  end-week [week]                Force all FINAL + full score + settling
  complete-week [week]           week_state → complete
  next-week [week]               Advance to next week (carries phase)
  jump <week> [--tester] -y      Teleport to a week (resets THAT week only)
  seed-picks [week] [--tester]   Seed fake (and tester) picks for a week
  set-phase <PHASE> [ws] [open]  Set current_phase only (ws=idle, open=false)
  scoring-lock <on|off>          Flip the scoring_locked emergency brake
  reset-reviewer-week [week] -y  Clear reviewer's week + rescore
  reset-to-week8 -y              App Review submission state (Week 8 picks_open)
  reset-to-start -y              Full wipe → Week 1 picks_open
  reset-to-preseason -y          Full wipe → PRE_SEASON / idle (no picks)
  refreeze -y                    reset_reviewer_sim() RPC (simA/simG only)

Destructive commands (multi-week wipes, jumps, reviewer resets) require --yes.`;

const NEEDS_YES = new Set(['jump', 'run-season', 'reset-reviewer-week', 'reset-to-week8', 'reset-to-start', 'reset-to-preseason', 'refreeze']);

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const cmd = pos[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { console.log(HELP); return; }
  if (!SECRET_KEY) { log('SB_SECRET_KEY is not set. export SB_SECRET_KEY=\'sb_secret_…\' and retry.', 'error'); process.exit(1); }
  // Writes never escape the sim sandbox. Read-only commands (status, monitor) may
  // target any competition — including live production — for monitoring.
  const READONLY_CMDS = new Set(['status', 'monitor']);
  if (!READONLY_CMDS.has(cmd)) {
    try { assertWritableTarget(COMPETITION); }
    catch (e) { log(e.message, 'error'); process.exit(1); }
  }
  if (NEEDS_YES.has(cmd) && !flags.yes) {
    log(`"${cmd}" is destructive (multi-week / wipe / reviewer). Re-run with --yes to confirm.`, 'error');
    process.exit(1);
  }

  const wkArg = (i) => (pos[i] != null ? Number(pos[i]) : null);
  const wkOrCurrent = async (i) => { const w = wkArg(i); return w != null ? w : await currentWeek(); };

  try {
    switch (cmd) {
      case 'status': await cmdStatus(); break;
      case 'monitor': await cmdMonitor(pos[1] || COMPETITION); break;
      case 'run-week': await runEntireWeek(await wkOrCurrent(1), { tester: flags.tester }); break;
      case 'run-season': {
        const from = wkArg(1) ?? (await currentWeek()) ?? 1;
        const to = wkArg(2) ?? 22;
        await runSeason(from, to, { tester: flags.tester });
        break;
      }
      case 'open-picks': await cpOpenPicks(await wkOrCurrent(1), { tester: flags.tester }); break;
      case 'kickoff': {
        const wave = pos[1]; const wk = await wkOrCurrent(2);
        const cfg = await readConfig();
        await cpKickoffWave(wk, wave, cfg.week_state);
        break;
      }
      case 'finalize': await cpFinalizeWave(await wkOrCurrent(2), pos[1]); break;
      case 'end-week': await cpEndWeek(await wkOrCurrent(1)); break;
      case 'complete-week': await cpCompleteWeek(await wkOrCurrent(1)); break;
      case 'next-week': await cpNextWeek(await wkOrCurrent(1)); break;
      case 'jump': await jumpToWeek(wkArg(1), { tester: flags.tester }); break;
      case 'seed-picks': {
        const wk = await wkOrCurrent(1);
        await seedFakeWeekPicks(wk);
        if (flags.tester) await seedTesterWeekPicks(wk);
        break;
      }
      case 'set-phase': await setPhaseOnly(pos[1], pos[2] || 'idle', pos[3] === 'true'); break;
      case 'scoring-lock': await setScoringLock(pos[1] === 'on'); break;
      case 'reset-reviewer-week': await resetReviewerCurrentWeek(await wkOrCurrent(1)); break;
      case 'reset-to-week8': await resetToWeek8(); break;
      case 'reset-to-start': await resetToStart(); break;
      case 'reset-to-preseason': await resetToPreseason(); break;
      case 'refreeze': await refreezeReviewer(); break;
      default: log(`Unknown command: ${cmd}. Run "node tools/sim-runner.mjs help".`, 'error'); process.exit(1);
    }
  } catch (e) {
    log(e.message, 'error');
    process.exit(1);
  }
}

main();
