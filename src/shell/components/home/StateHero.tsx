// src/shell/components/home/StateHero.tsx
// Spec §6.4.3 — StateHero is the Home Screen's hero block.
// Routes between sub-variants based on (current_phase, week_state).
//
// In-cycle variants:
//   picks_open    → PicksOpenHero
//   picks_locked  → PicksOpenHero  (unified with picks_open per redesign-v3)
//   games_live    → PicksOpenHero  (unified)
//   settling      → SettlingHero
//   complete      → CompleteHero
//
// Bridge / off-cycle variants:
//   off_season_idle         → OffSeasonHero
//   pre_season_games        → PreSeasonGamesHero (exhibition games window)
//   regular_complete_bridge → RegularCompleteHero
//   superbowl_intro_bridge  → SuperBowlIntroHero
//   season_complete         → SeasonCompleteHero
//
// No zero-pools variant: 0-pool users land on the phase-appropriate
// hero (typically OffSeasonHero today) and the YOUR CONTESTS /
// YOUR CLUBS sections carry the new-user orientation.

import React from 'react';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {PicksOpenHero} from './PicksOpenHero';
import {HotPickModule} from './HotPickModule';
import {SettlingHero} from './SettlingHero';
import {CompleteHero} from './CompleteHero';
import {OffSeasonHero} from './OffSeasonHero';
import {PreSeasonGamesHero} from './PreSeasonGamesHero';
import {RegularCompleteHero} from './RegularCompleteHero';
import {SuperBowlIntroHero} from './SuperBowlIntroHero';
import {SeasonCompleteHero} from './SeasonCompleteHero';
import {PlayoffBanner} from './PlayoffBanner';

export type HomeState =
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

  const hero = heroFor(resolved);

  // During the playoffs / Super Bowl, the in-cycle heroes render unchanged
  // beneath a playoff banner (round identity, bracket progress, accent, rules
  // ⓘ). The Super Bowl bridge (superbowl_intro_bridge) also gets the banner so
  // the playoff framing carries through the 2-week gap before the game.
  const isPlayoffPhase =
    currentPhase === 'PLAYOFFS' ||
    currentPhase === 'SUPERBOWL' ||
    currentPhase === 'SUPERBOWL_INTRO';
  const showsBanner =
    resolved === 'picks_open' || resolved === 'picks_locked' ||
    resolved === 'games_live' || resolved === 'settling' || resolved === 'complete' ||
    resolved === 'superbowl_intro_bridge';

  if (isPlayoffPhase && showsBanner) {
    return (
      <>
        <PlayoffBanner />
        {hero}
      </>
    );
  }
  return hero;
}

function heroFor(resolved: HomeState): React.ReactElement {
  switch (resolved) {
    // ACTION (PicksOpenHero) then HOTPICK (HotPickModule) as siblings — the
    // HotPick card sits directly BENEATH the action module, never inside it.
    // HotPickModule renders null when there's no HotPick or no rank.
    case 'picks_open':              return <><PicksOpenHero /><HotPickModule /></>;
    case 'picks_locked':            return <><PicksOpenHero /><HotPickModule /></>;
    case 'games_live':              return <><PicksOpenHero /><HotPickModule /></>;
    case 'settling':                return <SettlingHero />;
    case 'complete':                return <CompleteHero />;
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

