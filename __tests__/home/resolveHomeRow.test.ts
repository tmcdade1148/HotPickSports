// __tests__/home/resolveHomeRow.test.ts
// Slice 7a — the SPINE test. Pure-function tests for the single state resolver
// and the state table. No store, no rendering — just the truth table from
// HOME_MODULE_MAP's 11-row week-state table.
//
// Covers:
//   a. every (phase, weekState) pair in the map resolves to its intended row
//   b. garbage in → deliberate fallback row + the dev warning fires
//   c. the §2 invariant: HOME_ROWS[row].history agrees with isWeekInProgress so
//      the 6b settling bug (a live/settling week masquerading as a settled bar)
//      can never silently return.

import {
  resolveHomeRow,
  HOME_ROWS,
  RETIRED_MIRRORED_COPY,
  OFF_NEAR_DAYS,
  type HomeRow,
} from '@shell/components/home/homeRows';
import {isWeekInProgress} from '@shared/utils/weekState';

// Far/near off-season inputs: pick daysToPicksOpen safely on each side of the
// ≤7d boundary.
const FAR = OFF_NEAR_DAYS + 30; // 37 days out → off_far
const NEAR = OFF_NEAR_DAYS - 1; // 6 days out → off_near

describe('resolveHomeRow — map week-state table (11 rows)', () => {
  // ── a. every intended pairing resolves to its row ─────────────────────────
  test('1 · OFF_SEASON far (>7d) → off_far', () => {
    expect(resolveHomeRow('OFF_SEASON', 'idle', FAR)).toBe('off_far');
    // null days-to-open can't prove "near", so it stays far (fail-safe).
    expect(resolveHomeRow('OFF_SEASON', 'idle', null)).toBe('off_far');
    // exactly at the boundary + a hair over is still far.
    expect(resolveHomeRow('OFF_SEASON', 'idle', OFF_NEAR_DAYS + 0.001)).toBe('off_far');
  });

  test('2 · OFF_SEASON near (≤7d) → off_near', () => {
    expect(resolveHomeRow('OFF_SEASON', 'idle', NEAR)).toBe('off_near');
    // the boundary itself (exactly 7d) is near.
    expect(resolveHomeRow('OFF_SEASON', 'idle', OFF_NEAR_DAYS)).toBe('off_near');
    // already-past (negative) counts as near/imminent.
    expect(resolveHomeRow('OFF_SEASON', 'idle', -2)).toBe('off_near');
  });

  test('3 · PRE_SEASON (incl. the RPC-forced idle) → pre_bridge', () => {
    expect(resolveHomeRow('PRE_SEASON', 'idle', null)).toBe('pre_bridge');
    // any weekState under PRE_SEASON still resolves to the bridge (phase wins).
    expect(resolveHomeRow('PRE_SEASON', 'picks_open', null)).toBe('pre_bridge');
  });

  test('4–8 · REGULAR + each weekState → its row', () => {
    expect(resolveHomeRow('REGULAR', 'picks_open', null)).toBe('picks_open');
    expect(resolveHomeRow('REGULAR', 'locked', null)).toBe('locked');
    expect(resolveHomeRow('REGULAR', 'live', null)).toBe('live');
    expect(resolveHomeRow('REGULAR', 'settling', null)).toBe('settling');
    expect(resolveHomeRow('REGULAR', 'complete', null)).toBe('complete');
  });

  test('4–8 · PLAYOFFS & SUPERBOWL route through weekState identically', () => {
    expect(resolveHomeRow('PLAYOFFS', 'picks_open', null)).toBe('picks_open');
    expect(resolveHomeRow('PLAYOFFS', 'live', null)).toBe('live');
    expect(resolveHomeRow('PLAYOFFS', 'complete', null)).toBe('complete');
    expect(resolveHomeRow('SUPERBOWL', 'locked', null)).toBe('locked');
    expect(resolveHomeRow('SUPERBOWL', 'settling', null)).toBe('settling');
  });

  test('9 · REGULAR_COMPLETE → reg_done', () => {
    expect(resolveHomeRow('REGULAR_COMPLETE', 'idle', null)).toBe('reg_done');
    expect(resolveHomeRow('REGULAR_COMPLETE', 'complete', null)).toBe('reg_done');
  });

  test('10 · SUPERBOWL_INTRO → sb_intro', () => {
    expect(resolveHomeRow('SUPERBOWL_INTRO', 'idle', null)).toBe('sb_intro');
  });

  test('11 · SEASON_COMPLETE → season_done', () => {
    expect(resolveHomeRow('SEASON_COMPLETE', 'idle', null)).toBe('season_done');
  });

  test('all 11 rows are reachable from valid inputs', () => {
    const reached = new Set<HomeRow>([
      resolveHomeRow('OFF_SEASON', 'idle', FAR),
      resolveHomeRow('OFF_SEASON', 'idle', NEAR),
      resolveHomeRow('PRE_SEASON', 'idle', null),
      resolveHomeRow('REGULAR', 'picks_open', null),
      resolveHomeRow('REGULAR', 'locked', null),
      resolveHomeRow('REGULAR', 'live', null),
      resolveHomeRow('REGULAR', 'settling', null),
      resolveHomeRow('REGULAR', 'complete', null),
      resolveHomeRow('REGULAR_COMPLETE', 'idle', null),
      resolveHomeRow('SUPERBOWL_INTRO', 'idle', null),
      resolveHomeRow('SEASON_COMPLETE', 'idle', null),
    ]);
    expect(reached.size).toBe(11);
    // the reached set is exactly the HOME_ROWS keys — no row unreachable, none extra.
    expect([...reached].sort()).toEqual((Object.keys(HOME_ROWS) as HomeRow[]).sort());
  });
});

describe('resolveHomeRow — unknown-state policy (never a silent default)', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  test('in-cycle phase + garbage weekState → off_far AND warns', () => {
    expect(resolveHomeRow('REGULAR', 'banana', null)).toBe('off_far');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('banana');
  });

  test('in-cycle phase + idle (not a cycle state) → off_far AND warns', () => {
    expect(resolveHomeRow('REGULAR', 'idle', null)).toBe('off_far');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test('wholly unknown phase → off_far AND warns naming the pair', () => {
    expect(resolveHomeRow('WHATEVER', 'whenever', null)).toBe('off_far');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = String(warnSpy.mock.calls[0][0]);
    expect(msg).toContain('WHATEVER');
    expect(msg).toContain('whenever');
  });

  test('recognised pairings never warn', () => {
    resolveHomeRow('REGULAR', 'picks_open', null);
    resolveHomeRow('OFF_SEASON', 'idle', FAR);
    resolveHomeRow('PRE_SEASON', 'idle', null);
    resolveHomeRow('SEASON_COMPLETE', 'idle', null);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('HOME_ROWS — §2 invariant (Identity/History agreement)', () => {
  // The weekState each in-cycle row corresponds to. Idle/bridge rows have no
  // single weekState and are exercised separately.
  const ROW_WEEKSTATE: Partial<Record<HomeRow, string>> = {
    picks_open: 'picks_open',
    locked: 'locked',
    live: 'live',
    settling: 'settling',
    complete: 'complete',
  };

  // The map's Big-number table (§6), pinned per row so the table can't drift
  // from the map.
  const EXPECTED_HISTORY: Record<HomeRow, string> = {
    off_far: 'last_finished',
    off_near: 'last_finished',
    pre_bridge: 'last_finished',
    picks_open: 'last_finished',
    locked: 'last_finished',
    live: 'this_week_earned',
    settling: 'this_week_earned',
    complete: 'this_week_final',
    reg_done: 'last_finished',
    sb_intro: 'last_finished',
    season_done: 'final_week',
  };

  test('every row matches the map Big-number table', () => {
    for (const row of Object.keys(HOME_ROWS) as HomeRow[]) {
      expect(HOME_ROWS[row].history).toBe(EXPECTED_HISTORY[row]);
    }
  });

  // THE anti-6b guarantee. During settling the week is NOT yet a settled bar —
  // its games are final but the server is still scoring, so IDENTITY's SEASON
  // PTS counts it (isWeekInProgress === true) and HISTORY must own it in the
  // head, never as a bar. Encoded as: 'this_week_earned' ⟺ the head owns a live
  // week; a settling/live row must never read 'last_finished'.
  test("settling & live are in-progress and read 'this_week_earned' (never a bar)", () => {
    for (const ws of ['settling', 'live'] as const) {
      expect(isWeekInProgress(ws)).toBe(true);
      const row = ws as HomeRow;
      expect(HOME_ROWS[row].history).toBe('this_week_earned');
    }
  });

  test("'this_week_earned' history ⟹ the row's weekState is in progress", () => {
    for (const row of Object.keys(HOME_ROWS) as HomeRow[]) {
      if (HOME_ROWS[row].history !== 'this_week_earned') continue;
      const ws = ROW_WEEKSTATE[row];
      expect(ws).toBeDefined();
      expect(isWeekInProgress(ws!)).toBe(true);
    }
  });

  // complete is the one NOT-in-progress state that still shows THIS week (it just
  // finished; it rolls to a bar only when the next week opens).
  test("complete is not in progress and reads 'this_week_final'", () => {
    expect(isWeekInProgress('complete')).toBe(false);
    expect(HOME_ROWS.complete.history).toBe('this_week_final');
  });

  // picks_open / locked are in progress but PRE-kickoff — the current week has
  // nothing earned yet, so the head shows the last finished week (map Big-number
  // table). This is the documented exception to a naive "in-progress ⟹
  // this_week_earned" rule, and it must NOT read 'this_week_earned'.
  test('picks_open & locked are in-progress but read last_finished (pre-kickoff)', () => {
    for (const ws of ['picks_open', 'locked'] as const) {
      expect(isWeekInProgress(ws)).toBe(true);
      expect(HOME_ROWS[ws as HomeRow].history).toBe('last_finished');
    }
  });
});

describe('homeRows — copy & sync-guard retention', () => {
  test('retained mirrored copy is non-empty (keeps check-home-spec-sync green)', () => {
    // These phrases are still listed by the Operator Console mirror; the guard
    // requires each to appear in this directory. This constant is where they live.
    expect(RETIRED_MIRRORED_COPY.length).toBeGreaterThan(0);
    expect(RETIRED_MIRRORED_COPY).toContain('Make your picks. First game kicks off in:');
    expect(RETIRED_MIRRORED_COPY).toContain('Nothing today');
  });

  test('every contextual pool is verbatim strings (no template placeholders)', () => {
    for (const row of Object.keys(HOME_ROWS) as HomeRow[]) {
      for (const line of HOME_ROWS[row].contextual) {
        expect(line).not.toContain('{');
      }
    }
  });
});
