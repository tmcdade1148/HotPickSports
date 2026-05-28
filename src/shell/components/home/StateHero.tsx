// src/shell/components/home/StateHero.tsx
// Spec §6.4.3 — StateHero is the Home Screen's hero block.
// Routes between sub-variants based on (current_phase, week_state)
// plus the zero-pools overlay.
//
// In-cycle variants:
//   picks_open    → PicksOpenHero
//   picks_locked  → PicksOpenHero  (unified with picks_open per redesign-v3)
//   games_live    → PicksOpenHero  (unified)
//   settling      → SettlingHero
//   complete      → CompleteHero
//
// Bridge / off-cycle variants:
//   zero_pools              → ZeroPoolsHero      (overrides everything if no pools)
//   off_season_idle         → OffSeasonHero      (was pre_season_idle)
//   pre_season_games        → PreSeasonGamesHero (exhibition games window)
//   regular_complete_bridge → RegularCompleteHero
//   superbowl_intro_bridge  → SuperBowlIntroHero
//   season_complete         → SeasonCompleteHero

import React from 'react';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {PicksOpenHero} from './PicksOpenHero';
import {SettlingHero} from './SettlingHero';
import {CompleteHero} from './CompleteHero';
import {ZeroPoolsHero} from './ZeroPoolsHero';
import {OffSeasonHero} from './OffSeasonHero';
import {PreSeasonGamesHero} from './PreSeasonGamesHero';
import {RegularCompleteHero} from './RegularCompleteHero';
import {SuperBowlIntroHero} from './SuperBowlIntroHero';
import {SeasonCompleteHero} from './SeasonCompleteHero';

export type HomeState =
  | 'zero_pools'
  | 'off_season_idle'
  | 'pre_season_games'
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
    case 'picks_locked':            return <PicksOpenHero />;
    case 'games_live':              return <PicksOpenHero />;
    case 'settling':                return <SettlingHero />;
    case 'complete':                return <CompleteHero />;
    case 'zero_pools':              return <ZeroPoolsHero />;
    case 'off_season_idle':         return <OffSeasonHero />;
    case 'pre_season_games':        return <PreSeasonGamesHero />;
    case 'regular_complete_bridge': return <RegularCompleteHero />;
    case 'superbowl_intro_bridge':  return <SuperBowlIntroHero />;
    case 'season_complete':         return <SeasonCompleteHero />;
    default:                        return <OffSeasonHero />;
  }
}

/**
 * Map (phase, weekState) → HomeState. Mirrors §6.1 resolveHomeState semantics
 * for in-cycle states. Off-cycle bridge resolution happens in globalStore for
 * the full spec; this is the lightweight inline version for StateHero standalone use.
 */
function resolveFromConfig(phase: string, weekState: string): HomeState {
  if (phase === 'OFF_SEASON')        return 'off_season_idle';
  if (phase === 'PRE_SEASON')        return 'pre_season_games';
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
    default:           return 'off_season_idle';
  }
}

