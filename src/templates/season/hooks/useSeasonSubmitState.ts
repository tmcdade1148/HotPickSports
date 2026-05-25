// Centralized picks-submit state. Both the bar-level SubmitPicksBarSlot
// and the (now-removed) in-screen button derived their props from the
// same store reads in SeasonPicksScreen. This hook is the single source
// of truth so the bar slot can render without owning a copy of the logic.

import {useCallback} from 'react';
import {Alert} from 'react-native';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';

export type PicksSubmitState =
  | 'locked'
  | 'no_picks'
  | 'needs_hotpick'
  | 'in_progress'
  | 'submitted';

export interface SeasonSubmitState {
  visible: boolean;       // false when there's no week to submit (loading, no games, wrong template)
  state: PicksSubmitState;
  enabled: boolean;
  label: string;
  onPress: () => void;
  accentColor: string;
}

export function useSeasonSubmitState(): SeasonSubmitState {
  const config         = useSeasonStore(s => s.config);
  const games          = useSeasonStore(s => s.games);
  const isLoading      = useSeasonStore(s => s.isLoading);
  const isWeekComplete = useSeasonStore(s => s.isWeekComplete);
  const setWeekComplete = useSeasonStore(s => s.setWeekComplete);
  const hotPickCount   = useSeasonStore(s => s.getHotPickCount());
  const pickCount      = useSeasonStore(s => s.getPickCount());
  const currentWeek    = useNFLStore(s => s.currentWeek);

  const visible = !isLoading && games.length > 0 && !!config;

  const allGamesFinal = games.length > 0 && games.every(g => {
    const status = (g.status ?? '').toUpperCase();
    return status === 'FINAL' || status === 'COMPLETED' || status === 'STATUS_FINAL';
  });

  const allGamesLocked = games.length > 0 && games.every(g => {
    const status = (g.status ?? '').toUpperCase();
    if (status === 'FINAL' || status === 'STATUS_FINAL' || status === 'COMPLETED'
      || status === 'IN_PROGRESS' || status === 'LIVE') return true;
    if (g.lock_at && new Date(g.lock_at).getTime() <= Date.now()) return true;
    return false;
  });

  const state: PicksSubmitState = (() => {
    if (allGamesLocked) return 'locked';
    if (isWeekComplete) return 'submitted';
    if (pickCount === 0) return 'no_picks';
    if (hotPickCount < (config?.hotPicksPerWeek ?? 1)) return 'needs_hotpick';
    return 'in_progress';
  })();

  const label = (() => {
    switch (state) {
      case 'locked':
        return allGamesFinal
          ? `THAT'S A WRAP ON WEEK ${currentWeek ?? ''}`
          : "PICKS ARE LOCKED";
      case 'no_picks':      return 'Start picking your winners';
      case 'needs_hotpick': return 'Select your HotPick';
      case 'in_progress':   return 'Submit your picks';
      case 'submitted':     return 'Submitted';
    }
  })();

  const enabled = state === 'needs_hotpick' || state === 'in_progress';

  const onPress = useCallback(() => {
    if (state === 'needs_hotpick') {
      Alert.alert(
        'Choose Your HotPick',
        "Every week you designate one game as your HotPick. A correct HotPick earns the game's full rank value in points; an incorrect HotPick subtracts that value. Tap the flame icon on a game card to select your HotPick.",
        [{text: 'Got it'}],
      );
      return;
    }
    if (state === 'in_progress') {
      setWeekComplete(true);
    }
  }, [state, setWeekComplete]);

  return {
    visible,
    state,
    enabled,
    label,
    onPress,
    accentColor: config?.color ?? '#F5620F',
  };
}
