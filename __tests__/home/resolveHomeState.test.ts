// __tests__/home/resolveHomeState.test.ts
// Spec §8 — verification gate test #1 of 4: state transitions across all 10 states.
//
// Pure-function tests. No store, no navigation, no rendering — just the
// state-resolution truth table from spec §6.1.

import {resolveHomeState} from '@shell/components/home/resolveHomeState';

describe('resolveHomeState — spec §6.1 truth table', () => {
  // -----------------------------------------------------------------------
  // Zero-pools overlay always wins
  // -----------------------------------------------------------------------
  test('returns zero_pools when no visible pools, regardless of phase/week', () => {
    expect(resolveHomeState(0, 'PRE_SEASON', 'idle')).toBe('zero_pools');
    expect(resolveHomeState(0, 'REGULAR', 'picks_open')).toBe('zero_pools');
    expect(resolveHomeState(0, 'PLAYOFFS', 'live')).toBe('zero_pools');
    expect(resolveHomeState(0, 'SEASON_COMPLETE', 'idle')).toBe('zero_pools');
  });

  // -----------------------------------------------------------------------
  // Off-cycle phases override weekState
  // -----------------------------------------------------------------------
  test('PRE_SEASON → pre_season_idle (any weekState)', () => {
    expect(resolveHomeState(1, 'PRE_SEASON', 'idle')).toBe('pre_season_idle');
    expect(resolveHomeState(3, 'PRE_SEASON', 'picks_open')).toBe('pre_season_idle');
  });

  test('REGULAR_COMPLETE → regular_complete_bridge', () => {
    expect(resolveHomeState(2, 'REGULAR_COMPLETE', 'idle')).toBe('regular_complete_bridge');
    expect(resolveHomeState(2, 'REGULAR_COMPLETE', 'complete')).toBe('regular_complete_bridge');
  });

  test('SUPERBOWL_INTRO → superbowl_intro_bridge', () => {
    expect(resolveHomeState(1, 'SUPERBOWL_INTRO', 'idle')).toBe('superbowl_intro_bridge');
  });

  test('SEASON_COMPLETE → season_complete', () => {
    expect(resolveHomeState(5, 'SEASON_COMPLETE', 'idle')).toBe('season_complete');
  });

  // -----------------------------------------------------------------------
  // In-cycle weekState matrix
  // -----------------------------------------------------------------------
  test('REGULAR + picks_open → picks_open', () => {
    expect(resolveHomeState(1, 'REGULAR', 'picks_open')).toBe('picks_open');
  });

  test('REGULAR + locked → picks_locked', () => {
    expect(resolveHomeState(1, 'REGULAR', 'locked')).toBe('picks_locked');
  });

  test('REGULAR + live → games_live', () => {
    expect(resolveHomeState(1, 'REGULAR', 'live')).toBe('games_live');
  });

  test('REGULAR + settling → settling', () => {
    expect(resolveHomeState(1, 'REGULAR', 'settling')).toBe('settling');
  });

  test('REGULAR + complete → complete', () => {
    expect(resolveHomeState(1, 'REGULAR', 'complete')).toBe('complete');
  });

  // -----------------------------------------------------------------------
  // PLAYOFFS / SUPERBOWL share the weekState→state mapping with REGULAR
  // -----------------------------------------------------------------------
  test('PLAYOFFS + picks_open → picks_open', () => {
    expect(resolveHomeState(2, 'PLAYOFFS', 'picks_open')).toBe('picks_open');
  });

  test('PLAYOFFS + live → games_live', () => {
    expect(resolveHomeState(2, 'PLAYOFFS', 'live')).toBe('games_live');
  });

  test('SUPERBOWL + locked → picks_locked', () => {
    expect(resolveHomeState(1, 'SUPERBOWL', 'locked')).toBe('picks_locked');
  });

  test('SUPERBOWL + complete → complete', () => {
    expect(resolveHomeState(1, 'SUPERBOWL', 'complete')).toBe('complete');
  });

  // -----------------------------------------------------------------------
  // Fallback — unexpected weekState falls back to pre_season_idle
  // -----------------------------------------------------------------------
  test('REGULAR + unknown weekState → pre_season_idle (fallback)', () => {
    expect(resolveHomeState(1, 'REGULAR', 'banana')).toBe('pre_season_idle');
  });

  test('unknown phase + unknown weekState → pre_season_idle (default branch)', () => {
    expect(resolveHomeState(1, 'WHATEVER', 'whenever')).toBe('pre_season_idle');
  });

  // -----------------------------------------------------------------------
  // Spec §6.1 has 10 distinct states — confirm we can produce each.
  // -----------------------------------------------------------------------
  test('every HomeState in spec §6.1 is reachable from some valid input', () => {
    const reached = new Set<string>();
    reached.add(resolveHomeState(0, 'PRE_SEASON', 'idle'));          // zero_pools
    reached.add(resolveHomeState(1, 'PRE_SEASON', 'idle'));          // pre_season_idle
    reached.add(resolveHomeState(1, 'REGULAR', 'picks_open'));       // picks_open
    reached.add(resolveHomeState(1, 'REGULAR', 'locked'));           // picks_locked
    reached.add(resolveHomeState(1, 'REGULAR', 'live'));             // games_live
    reached.add(resolveHomeState(1, 'REGULAR', 'settling'));         // settling
    reached.add(resolveHomeState(1, 'REGULAR', 'complete'));         // complete
    reached.add(resolveHomeState(1, 'REGULAR_COMPLETE', 'idle'));    // regular_complete_bridge
    reached.add(resolveHomeState(1, 'SUPERBOWL_INTRO', 'idle'));     // superbowl_intro_bridge
    reached.add(resolveHomeState(1, 'SEASON_COMPLETE', 'idle'));     // season_complete

    expect(reached.size).toBe(10);
  });
});
