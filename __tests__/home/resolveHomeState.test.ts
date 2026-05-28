// __tests__/home/resolveHomeState.test.ts
// Spec §8 — verification gate test #1 of 4: state transitions across all states.
//
// Pure-function tests. No store, no navigation, no rendering — just the
// state-resolution truth table from spec §6.1.

import {resolveHomeState} from '@shell/components/home/resolveHomeState';

describe('resolveHomeState — spec §6.1 truth table', () => {
  // -----------------------------------------------------------------------
  // Off-cycle phases override weekState
  // -----------------------------------------------------------------------
  test('OFF_SEASON → off_season_idle (any weekState)', () => {
    expect(resolveHomeState('OFF_SEASON', 'idle')).toBe('off_season_idle');
    expect(resolveHomeState('OFF_SEASON', 'picks_open')).toBe('off_season_idle');
  });

  test('PRE_SEASON → pre_season_games (any weekState)', () => {
    expect(resolveHomeState('PRE_SEASON', 'idle')).toBe('pre_season_games');
    expect(resolveHomeState('PRE_SEASON', 'picks_open')).toBe('pre_season_games');
  });

  test('REGULAR_COMPLETE → regular_complete_bridge', () => {
    expect(resolveHomeState('REGULAR_COMPLETE', 'idle')).toBe('regular_complete_bridge');
    expect(resolveHomeState('REGULAR_COMPLETE', 'complete')).toBe('regular_complete_bridge');
  });

  test('SUPERBOWL_INTRO → superbowl_intro_bridge', () => {
    expect(resolveHomeState('SUPERBOWL_INTRO', 'idle')).toBe('superbowl_intro_bridge');
  });

  test('SEASON_COMPLETE → season_complete', () => {
    expect(resolveHomeState('SEASON_COMPLETE', 'idle')).toBe('season_complete');
  });

  // -----------------------------------------------------------------------
  // In-cycle weekState matrix
  // -----------------------------------------------------------------------
  test('REGULAR + picks_open → picks_open', () => {
    expect(resolveHomeState('REGULAR', 'picks_open')).toBe('picks_open');
  });

  test('REGULAR + locked → picks_locked', () => {
    expect(resolveHomeState('REGULAR', 'locked')).toBe('picks_locked');
  });

  test('REGULAR + live → games_live', () => {
    expect(resolveHomeState('REGULAR', 'live')).toBe('games_live');
  });

  test('REGULAR + settling → settling', () => {
    expect(resolveHomeState('REGULAR', 'settling')).toBe('settling');
  });

  test('REGULAR + complete → complete', () => {
    expect(resolveHomeState('REGULAR', 'complete')).toBe('complete');
  });

  // -----------------------------------------------------------------------
  // PLAYOFFS / SUPERBOWL share the weekState→state mapping with REGULAR
  // -----------------------------------------------------------------------
  test('PLAYOFFS + picks_open → picks_open', () => {
    expect(resolveHomeState('PLAYOFFS', 'picks_open')).toBe('picks_open');
  });

  test('PLAYOFFS + live → games_live', () => {
    expect(resolveHomeState('PLAYOFFS', 'live')).toBe('games_live');
  });

  test('SUPERBOWL + locked → picks_locked', () => {
    expect(resolveHomeState('SUPERBOWL', 'locked')).toBe('picks_locked');
  });

  test('SUPERBOWL + complete → complete', () => {
    expect(resolveHomeState('SUPERBOWL', 'complete')).toBe('complete');
  });

  // -----------------------------------------------------------------------
  // Fallback — unexpected weekState falls back to off_season_idle
  // -----------------------------------------------------------------------
  test('REGULAR + unknown weekState → off_season_idle (fallback)', () => {
    expect(resolveHomeState('REGULAR', 'banana')).toBe('off_season_idle');
  });

  test('unknown phase + unknown weekState → off_season_idle (default branch)', () => {
    expect(resolveHomeState('WHATEVER', 'whenever')).toBe('off_season_idle');
  });

  // -----------------------------------------------------------------------
  // Every state in §6.1 is reachable.
  // -----------------------------------------------------------------------
  test('every HomeState is reachable from some valid input', () => {
    const reached = new Set<string>();
    reached.add(resolveHomeState('OFF_SEASON', 'idle'));        // off_season_idle
    reached.add(resolveHomeState('PRE_SEASON', 'idle'));        // pre_season_games
    reached.add(resolveHomeState('REGULAR', 'picks_open'));     // picks_open
    reached.add(resolveHomeState('REGULAR', 'locked'));         // picks_locked
    reached.add(resolveHomeState('REGULAR', 'live'));           // games_live
    reached.add(resolveHomeState('REGULAR', 'settling'));       // settling
    reached.add(resolveHomeState('REGULAR', 'complete'));       // complete
    reached.add(resolveHomeState('REGULAR_COMPLETE', 'idle'));  // regular_complete_bridge
    reached.add(resolveHomeState('SUPERBOWL_INTRO', 'idle'));   // superbowl_intro_bridge
    reached.add(resolveHomeState('SEASON_COMPLETE', 'idle'));   // season_complete

    expect(reached.size).toBe(10);
  });
});
