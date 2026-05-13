// src/shell/components/home/StateHero.tsx
// Spec §6.4.3 — StateHero is the Home Screen's hero block.
// Routes between 10 sub-variants based on (current_phase, week_state)
// plus the zero-pools overlay.
//
// In-cycle variants:
//   picks_open    → PicksOpenHero
//   locked        → PicksLockedHero
//   live          → GamesLiveHero
//   settling      → SettlingHero
//   complete      → CompleteHero
//
// Bridge / off-cycle variants:
//   zero_pools              → ZeroPoolsHero      (overrides everything if no pools)
//   pre_season_idle         → PreSeasonHero
//   regular_complete_bridge → RegularCompleteHero
//   superbowl_intro_bridge  → SuperBowlIntroHero
//   season_complete         → SeasonCompleteHero

import React from 'react';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {PicksOpenHero} from './PicksOpenHero';
import {PicksLockedHero} from './PicksLockedHero';
import {GamesLiveHero} from './GamesLiveHero';
import {SettlingHero} from './SettlingHero';
import {CompleteHero} from './CompleteHero';
import {ZeroPoolsHero} from './ZeroPoolsHero';
import {PreSeasonHero} from './PreSeasonHero';
import {RegularCompleteHero} from './RegularCompleteHero';
import {SuperBowlIntroHero} from './SuperBowlIntroHero';
import {SeasonCompleteHero} from './SeasonCompleteHero';

export type HomeState =
  | 'zero_pools'
  | 'pre_season_idle'
  | 'picks_open'
  | 'picks_locked'
  | 'games_live'
  | 'settling'
  | 'complete'
  | 'regular_complete_bridge'
  | 'superbowl_intro_bridge'
  | 'season_complete';

export interface StateHeroProps {
  /** Explicit home state override — typically resolved by globalStore.homeState. */
  state?: HomeState;
}

export function StateHero({state}: StateHeroProps) {
  const weekState    = useNFLStore(s => s.weekState);
  const currentPhase = useNFLStore(s => s.currentPhase);

  const resolved: HomeState = state ?? resolveFromConfig(currentPhase, weekState);

  switch (resolved) {
    case 'picks_open':              return <PicksOpenHero />;
    case 'picks_locked':            return <PicksLockedHero />;
    case 'games_live':              return <GamesLiveHero />;
    case 'settling':                return <SettlingHero />;
    case 'complete':                return <CompleteHero />;
    case 'zero_pools':              return <ZeroPoolsHero />;
    case 'pre_season_idle':         return <PreSeasonHero />;
    case 'regular_complete_bridge': return <RegularCompleteHero />;
    case 'superbowl_intro_bridge':  return <SuperBowlIntroHero />;
    case 'season_complete':         return <SeasonCompleteHero />;
    default:                        return <PreSeasonHero />;
  }
}

/**
 * Map (phase, weekState) → HomeState. Mirrors §6.1 resolveHomeState semantics
 * for in-cycle states. Off-cycle bridge resolution happens in globalStore for
 * the full spec; this is the lightweight inline version for StateHero standalone use.
 */
function resolveFromConfig(phase: string, weekState: string): HomeState {
  if (phase === 'PRE_SEASON')        return 'pre_season_idle';
  if (phase === 'REGULAR_COMPLETE')  return 'regular_complete_bridge';
  if (phase === 'SUPERBOWL_INTRO')   return 'superbowl_intro_bridge';
  if (phase === 'SEASON_COMPLETE')   return 'season_complete';

  // REGULAR / PLAYOFFS / SUPERBOWL — fall through to weekState
  switch (weekState) {
    case 'picks_open': return 'picks_open';
    case 'locked':     return 'picks_locked';
    case 'live':       return 'games_live';
    case 'settling':   return 'settling';
    case 'complete':   return 'complete';
    default:           return 'pre_season_idle';
  }
}

