// src/shell/components/home/homeRows.ts
//
// THE SINGLE STATE TABLE — the code image of HOME_MODULE_MAP's 11-row
// week-state table. Slice 7a (the SPINE): one resolver, one contextual-copy
// source, one place that says what each row IS.
//
// The map's table (v4) has ELEVEN rows. Nine app HomeStates couldn't tell rows
// 1 and 2 apart (off-season far vs near); this file adds that split and gives
// every row a home for its badge, action, hotpick, history and contextual copy.
//
// SCOPE of 7a: this table is the DECLARATION. In 7a the fields actually READ are
//   • action      → StateHero picks the hero
//   • contextual  → ContextualLine renders one line
//   • (badge is still produced by shortPeriod.ts; PART E fixes its 3 strings. The
//      `badge` field here is the declarative token the two must agree on — a
//      cross-check test pins them so they can't drift.)
// The `hotpick` and `history` fields are declared per the map for completeness
// and for the §2 invariant test, but nothing rewires HotPickModule (7b) or
// HistoryModule (7c) in this pass.
//
// COPY POLICY: every string in `contextual` is VERBATIM existing repo copy —
// carried from the retired producers (getContextGreeting / buildContextualMessage)
// so behaviour is unchanged. No copy is invented here. Rows whose canonical
// contextual line the map hasn't written yet carry the current shipped line (or
// none, where the state showed none) and are flagged in the 7a report for Tom to
// author later.

/** The eleven rows of the map's week-state table. */
export type HomeRow =
  | 'off_far'      // 1  OFF_SEASON, >7d to picks-open
  | 'off_near'     // 2  OFF_SEASON, ≤7d to picks-open
  | 'pre_bridge'   // 3  PRE_SEASON (resting bridge; RPC forces week_state='idle')
  | 'picks_open'   // 4  REGULAR/PLAYOFFS/SUPERBOWL + picks_open
  | 'locked'       // 5  + locked
  | 'live'         // 6  + live
  | 'settling'     // 7  + settling
  | 'complete'     // 8  + complete
  | 'reg_done'     // 9  REGULAR_COMPLETE
  | 'sb_intro'     // 10 SUPERBOWL_INTRO
  | 'season_done'; // 11 SEASON_COMPLETE

/** ACTION module behaviour for the row (which hero / countdown target). */
export type ActionMode =
  | 'countdown_kickoff'     // big kickoff countdown → seasonOpenerAt
  | 'countdown_picks_open'  // big countdown → picksOpenAt (row 2 only)
  | 'resting'               // preseason bridge, no countdown (7c)
  | 'picks'                 // PicksOpenHero (rows 4/5/6, differentiated inside)
  | 'settling'              // SettlingHero
  | 'complete'              // CompleteHero
  | 'bridge'                // RegularComplete / SuperBowlIntro bridge heroes
  | 'podium';               // SeasonComplete retrospective

/** HOTPICK column (declarative; wired in 7b). */
export type HotPickMode =
  | 'hidden'         // idle/bridge rows — no HotPick surface
  | 'nudge_or_pre'   // picks_open/locked — nudge if unset, else flame + PRE chip
  | 'chip_live'      // live — chip tracks its own game
  | 'final_signed';  // settling — flame + FINAL chip + signed result

/** HISTORY big-number column, from the map's Big-number table (§6). */
export type HistoryMode =
  | 'last_finished'     // most recent finished week (idle rows, picks_open, locked)
  | 'this_week_earned'  // this week, actual earned only (live, settling)
  | 'this_week_final'   // this week, final (complete)
  | 'final_week';       // final week (season_done)

export interface HomeRowSpec {
  /** Declarative badge token — the suffix shortPeriod emits after "NFLxx · ".
   *  'WEEK' is a marker for the week-numbered rows (W01…), whose real badge is
   *  computed by shortPeriod from the week number, not a static string. */
  badge: string;
  action: ActionMode;
  hotpick: HotPickMode;
  history: HistoryMode;
  /** One-line contextual copy pool; ContextualLine picks one per-hour. Empty =
   *  the row shows no contextual line (matches current behaviour for that state).
   *  All strings are VERBATIM carried repo copy — never invented here. */
  contextual: readonly string[];
  /** Optional hero headline override (row 2 only in 7a — verbatim map copy). */
  headline?: string;
  /** Optional hero sub-line override (row 2 only in 7a — verbatim map copy). */
  heroSub?: string;
}

// ── Carried contextual pools ─────────────────────────────────────────────────
// Every array below is existing repo copy lifted verbatim from getContextGreeting
// (salutation.ts). The pools are unchanged; only their home moved.
const PICKS_OPEN_LINE = ['Picks are open', 'Your move', "Clock's running"] as const;
const LOCKED_LINE = ['On record. No edits', 'Said what you said', 'Locked in'] as const;
const LIVE_LINE = ["It's happening", 'Too late to change anything', 'Watching or refreshing?'] as const;
const SETTLING_LINE = ["The record doesn't lie", "It's official", 'Week closed'] as const;
const TRANSITION_LINE = ['Dust settling', 'Big things ahead', 'Stay sharp'] as const;
const SEASON_DONE_LINE = ['What a ride', "That's a wrap", 'See you next season'] as const;

// Row 2 hero copy — VERBATIM from the map's copy library ("Row 2 — LOCKED: A").
const OFF_NEAR_HEADLINE = 'ALMOST TIME.';
const OFF_NEAR_SUB =
  "Good time to get your Contest together, so nobody's scrambling on a Thursday.";

/**
 * RETIRED, still-mirrored copy. The Operator Console's HOME_SCREEN_SPECS mirror
 * (tools/hotpick-operator-console_v2.html) lists these verbatim phrases, and
 * tools/check-home-spec-sync.mjs requires each to still appear somewhere in this
 * directory. They came from getContextGreeting's default pool and from
 * buildContextualMessage — both retired in 7a — so they are retained here so the
 * guard stays green. NOT rendered. The console mirror should eventually be
 * updated to the new copy; until then this constant keeps the guard honest.
 * (Referenced by the resolveHomeRow unit test so it is not dead.)
 */
export const RETIRED_MIRRORED_COPY = [
  // getContextGreeting default pool (console `idle` salutations)
  'Nothing today',
  'Rest day',
  'Back at it soon',
  // buildContextualMessage (console `picks_open` headlines — first quoted phrase)
  'Make your picks. First game kicks off in:',
  'All picks in — you still need a HotPick. First kickoff in:',
  'Feeling good about your HotPick?',
  'Picks are set.',
  'Locked & loaded.',
  'Bold call — your HotPick is the first game.',
] as const;

// ── THE TABLE ────────────────────────────────────────────────────────────────
export const HOME_ROWS: Record<HomeRow, HomeRowSpec> = {
  // 1 · off-season, far — headline/sub come from sportIdentity (unchanged).
  off_far: {
    badge: 'OFFSEASON',
    action: 'countdown_kickoff',
    hotpick: 'hidden',
    history: 'last_finished',
    contextual: [], // off-season shows no contextual line today (carried: none)
  },
  // 2 · off-season, near — NEW row. Distinct headline/sub + picks-open countdown.
  off_near: {
    badge: 'OFFSEASON',
    action: 'countdown_picks_open',
    hotpick: 'hidden',
    history: 'last_finished',
    contextual: [], // carried: none (the row's voice is its headline)
    headline: OFF_NEAR_HEADLINE,
    heroSub: OFF_NEAR_SUB,
  },
  // 3 · preseason bridge — countdown removal is 7c; unchanged here.
  pre_bridge: {
    badge: 'PRESEASON',
    action: 'resting',
    hotpick: 'hidden',
    history: 'last_finished',
    contextual: [], // carried: none (PreSeasonGamesHero shows no salutation)
  },
  // 4 · picks open
  picks_open: {
    badge: 'WEEK',
    action: 'picks',
    hotpick: 'nudge_or_pre',
    history: 'last_finished',
    contextual: PICKS_OPEN_LINE,
  },
  // 5 · locked — line RESTORED (was hidden behind !weekLocked)
  locked: {
    badge: 'WEEK',
    action: 'picks',
    hotpick: 'nudge_or_pre',
    history: 'last_finished',
    contextual: LOCKED_LINE,
  },
  // 6 · live — line RESTORED
  live: {
    badge: 'WEEK',
    action: 'picks',
    hotpick: 'chip_live',
    history: 'this_week_earned',
    contextual: LIVE_LINE,
  },
  // 7 · settling
  settling: {
    badge: 'WEEK',
    action: 'settling',
    hotpick: 'final_signed',
    history: 'this_week_earned',
    contextual: SETTLING_LINE,
  },
  // 8 · complete — no contextual line today (CompleteHero shows none); carried: none
  complete: {
    badge: 'WEEK',
    action: 'complete',
    hotpick: 'hidden', // handoff to History (7b removes the CompleteHero flame card)
    history: 'this_week_final',
    contextual: [],
  },
  // 9 · regular complete bridge
  reg_done: {
    badge: 'REG DONE',
    action: 'bridge',
    hotpick: 'hidden',
    history: 'last_finished',
    contextual: TRANSITION_LINE,
  },
  // 10 · super bowl intro bridge
  sb_intro: {
    badge: 'SB',
    action: 'bridge',
    hotpick: 'hidden',
    history: 'last_finished',
    contextual: TRANSITION_LINE,
  },
  // 11 · season complete
  season_done: {
    badge: 'DONE',
    action: 'podium',
    hotpick: 'hidden',
    history: 'final_week',
    contextual: SEASON_DONE_LINE,
  },
};

/** Off-season split boundary: ≤ 7 days (168h) to picks-open ⇒ the "near" row. */
export const OFF_NEAR_DAYS = 7;

/** Phases that run the weekly cycle (rows 4–8 via weekState). */
const WEEKLY_CYCLE_PHASES: ReadonlySet<string> = new Set(['REGULAR', 'PLAYOFFS', 'SUPERBOWL']);

/** The in-cycle weekState → row map (rows 4–8). */
const WEEKSTATE_ROW: Record<string, HomeRow> = {
  picks_open: 'picks_open',
  locked: 'locked',
  live: 'live',
  settling: 'settling',
  complete: 'complete',
};

/**
 * Loud, dev-only warning for any (phase, weekState) the resolver — or the store's
 * config parse — does not recognise. Never a silent default: an unrecognised
 * state is a real signal (a new phase shipped, a config typo, an admin RPC that
 * wrote a value we don't model). Gated on __DEV__ so production stays quiet.
 */
export function warnUnknownHomeState(
  phase: string,
  weekState: string,
  where: string = 'resolveHomeRow',
): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(
      `[homeRows] Unrecognized (phase="${phase}", weekState="${weekState}") in ${where}; ` +
        'falling back to the off_far row. Add it to the state table if this is a real state.',
    );
  }
}

/**
 * THE ONE resolver — maps (current_phase, week_state, daysToPicksOpen) to a
 * HomeRow. Replaces resolveHomeState AND StateHero.resolveFromConfig (the
 * byte-for-byte duplicate). One resolver in the app.
 *
 * @param phase            competition_config.current_phase (raw string)
 * @param weekState        competition_config.week_state (raw string; may be
 *                         'idle' or, defensively, anything)
 * @param daysToPicksOpen  fractional days until picks open (picksOpenAt − now),
 *                         or null when unknown. Splits off_far / off_near.
 */
export function resolveHomeRow(
  phase: string,
  weekState: string,
  daysToPicksOpen: number | null,
): HomeRow {
  // Phase-level off-cycle states take precedence over weekState.
  if (phase === 'OFF_SEASON') {
    return daysToPicksOpen != null && daysToPicksOpen <= OFF_NEAR_DAYS
      ? 'off_near'
      : 'off_far';
  }
  // PRE_SEASON is the resting bridge — the admin RPC forces week_state='idle'
  // here, so (PRE_SEASON, 'idle') is the EXPECTED pairing and resolves cleanly,
  // never through the unknown-state fallback.
  if (phase === 'PRE_SEASON') return 'pre_bridge';
  if (phase === 'REGULAR_COMPLETE') return 'reg_done';
  if (phase === 'SUPERBOWL_INTRO') return 'sb_intro';
  if (phase === 'SEASON_COMPLETE') return 'season_done';

  // In-cycle phases (REGULAR / PLAYOFFS / SUPERBOWL) switch on weekState.
  if (WEEKLY_CYCLE_PHASES.has(phase)) {
    const row = WEEKSTATE_ROW[weekState];
    if (row) return row;
    // In-cycle phase but an unmodelled week_state (e.g. 'idle' mid-cycle, or a
    // typo). Warn and fall back — never render the picks hero for a state we
    // don't understand.
    warnUnknownHomeState(phase, weekState);
    return 'off_far';
  }

  // Wholly unrecognised phase. Deliberate fallback + loud warning.
  warnUnknownHomeState(phase, weekState);
  return 'off_far';
}
