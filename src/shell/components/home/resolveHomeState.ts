// src/shell/components/home/resolveHomeState.ts
// Spec §6.1 — pure function mapping (visiblePoolCount, current_phase, week_state)
// to one of the HomeState values.
//
// Extracted from HomeScreen.tsx so it's directly testable without mounting
// the screen. No store dependencies.

import type {HomeState} from './StateHero';

export function resolveHomeState(
  visiblePoolCount: number,
  phase: string,
  weekState: string,
): HomeState {
  // Zero-pools is an overlay — overrides every other state combination.
  if (visiblePoolCount === 0) return 'zero_pools';

  // Phase-level off-cycle states take precedence over weekState.
  if (phase === 'OFF_SEASON')        return 'off_season_idle';
  if (phase === 'PRE_SEASON')        return 'pre_season_games';
  if (phase === 'REGULAR_COMPLETE')  return 'regular_complete_bridge';
  if (phase === 'SUPERBOWL_INTRO')   return 'superbowl_intro_bridge';
  if (phase === 'SEASON_COMPLETE')   return 'season_complete';

  // In-cycle: REGULAR / PLAYOFFS / SUPERBOWL — switch on weekState.
  switch (weekState) {
    case 'picks_open': return 'picks_open';
    case 'locked':     return 'picks_locked';
    case 'live':       return 'games_live';
    case 'settling':   return 'settling';
    case 'complete':   return 'complete';
    default:           return 'off_season_idle';
  }
}
