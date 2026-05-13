// src/shell/components/home/StateHero.tsx
// Spec §6.4.3 — StateHero is the Home Screen's hero block.
// Routes between 9 sub-variants based on (current_phase, week_state).
//
// In-cycle variants (this sub-branch — feat/home-state-hero-in-cycle):
//   picks_open    → PicksOpenHero
//   locked        → PicksLockedHero
//   live          → GamesLiveHero
//   settling      → SettlingHero
//   complete      → CompleteHero
//
// Bridge/off-cycle variants land in sub-branch 7 (feat/home-bridge-states):
//   zero_pools    → ZeroPoolsHero
//   pre_season    → PreSeasonHero
//   regular_complete_bridge → RegularCompleteHero
//   superbowl_intro_bridge  → SuperBowlIntroHero
//   season_complete         → SeasonCompleteHero
//
// For now, the bridge states render a placeholder so the screen never
// shows a blank hero during PRE_SEASON / REGULAR_COMPLETE / etc.

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing} from '@shared/theme';
import {PicksOpenHero} from './PicksOpenHero';
import {PicksLockedHero} from './PicksLockedHero';
import {GamesLiveHero} from './GamesLiveHero';
import {SettlingHero} from './SettlingHero';
import {CompleteHero} from './CompleteHero';

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
  const {colors} = useTheme();
  const weekState    = useNFLStore(s => s.weekState);
  const currentPhase = useNFLStore(s => s.currentPhase);

  const resolved: HomeState = state ?? resolveFromConfig(currentPhase, weekState);

  switch (resolved) {
    case 'picks_open':
      return <PicksOpenHero />;
    case 'picks_locked':
      return <PicksLockedHero />;
    case 'games_live':
      return <GamesLiveHero />;
    case 'settling':
      return <SettlingHero />;
    case 'complete':
      return <CompleteHero />;

    // Placeholder for bridge / idle states until sub-branch 7 ships them.
    case 'zero_pools':
    case 'pre_season_idle':
    case 'regular_complete_bridge':
    case 'superbowl_intro_bridge':
    case 'season_complete':
    default:
      return (
        <View style={styles.placeholder}>
          <Text style={[bodyType.regular, {color: colors.textSecondary}]}>
            {humanLabelForState(resolved)}
          </Text>
        </View>
      );
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

function humanLabelForState(state: HomeState): string {
  switch (state) {
    case 'zero_pools':              return 'Welcome to HotPick. (Hero coming soon.)';
    case 'pre_season_idle':         return 'Pre-season. The season is on the horizon.';
    case 'regular_complete_bridge': return 'Regular season closed. Playoffs incoming.';
    case 'superbowl_intro_bridge':  return 'Super Bowl week.';
    case 'season_complete':         return 'The season is in the books.';
    default:                        return '';
  }
}

const styles = StyleSheet.create({
  placeholder: {
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.xl,
    alignItems: 'center',
  },
});
