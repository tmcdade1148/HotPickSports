// Centralized picks-submit state — the 5-state machine (locked /
// no_picks / needs_hotpick / in_progress / submitted) plus the
// submit action. Consumed by SubmitPicksFooter at the bottom of
// SeasonPicksScreen. Lives here so the screen and any future
// surface (e.g. a deep-link confirmation modal) share one source
// of truth instead of recomputing state from store reads.

import {useCallback, useState} from 'react';
import {Alert} from 'react-native';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {isWeekLocked} from '@templates/season/utils/weekLock';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {supabase} from '@shared/config/supabase';
import {DEMO_COMPETITION} from '@sports/registry';

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
  const weekState      = useNFLStore(s => s.weekState);
  const viewedWeek     = useSeasonStore(s => s.currentWeek);

  const isDemo = config?.competition === DEMO_COMPETITION;
  const [demoSubmitting, setDemoSubmitting] = useState(false);

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

  // Picks are editable ONLY in the picks_open / live window of the CURRENT week
  // (mirrors SeasonPicksScreen.picksAreOpen). Outside it — weekState
  // locked/settling/complete, or browsing a past/future week — every pick is
  // locked even when the game rows still read 'scheduled' (e.g. the sim's
  // 'locked' state before kickoff, where lock_at may be unset). Within 'live',
  // allGamesLocked still covers the case where every game has kicked off.
  const picksWindowOpen =
    (weekState === 'picks_open' || weekState === 'live') && viewedWeek === currentWeek;
  // Whole-week lock (matches server enforce_pick_lock) — the SAME shared value
  // the cards use. Required: locking the cards but not the footer would leave a
  // "Select your HotPick" prompt with every flame locked. It fires at the week's
  // first kickoff (before allGamesLocked, which needs every game locked).
  const weekLocked = isWeekLocked(games);
  const fullyLocked = !picksWindowOpen || weekLocked || allGamesLocked;

  const state: PicksSubmitState = (() => {
    if (fullyLocked) return 'locked';
    if (demoSubmitting) return 'submitted';
    if (isWeekComplete) return 'submitted';
    if (pickCount === 0) return 'no_picks';
    if (hotPickCount < (config?.hotPicksPerWeek ?? 1)) return 'needs_hotpick';
    return 'in_progress';
  })();

  const label = (() => {
    if (demoSubmitting) return 'Scoring your week…';
    switch (state) {
      case 'locked':
        return allGamesFinal
          ? `THAT'S A WRAP ON WEEK ${currentWeek ?? ''}`
          : "PICKS ARE LOCKED";
      case 'no_picks':      return 'Start picking your winners';
      case 'needs_hotpick': return 'Select your HotPick';
      case 'in_progress':   return isDemo ? 'See your result' : 'Submit your picks';
      case 'submitted':     return 'Submitted';
    }
  })();

  const enabled = !demoSubmitting && (state === 'needs_hotpick' || state === 'in_progress');

  const onPress = useCallback(() => {
    if (state === 'needs_hotpick') {
      Alert.alert(
        'Choose Your HotPick',
        "Every week you designate one game as your HotPick. A correct HotPick earns the game's full rank value in points; an incorrect HotPick subtracts that value. Tap the flame icon on a game card to select your HotPick.",
        [{text: 'Got it'}],
      );
      return;
    }
    if (state !== 'in_progress') return;

    // Demo: settle server-side (demo-settle scores the already-saved picks),
    // then reveal the results IN PLACE — flip the games to completed and open
    // the score-breakdown modal. Picks are pool-independent and saved per-tap,
    // so there's nothing to batch-write here.
    if (isDemo) {
      setDemoSubmitting(true);
      supabase.functions
        .invoke('demo-settle', {body: {}})
        .then(({data, error}) => {
          setDemoSubmitting(false);
          if (error || !data || data.success === false) {
            Alert.alert(
              'Could not score your demo week',
              'Something went wrong settling the demo. Please try again.',
            );
            return;
          }
          useSeasonStore.getState().applyDemoReveal(data.picks ?? []);
          useGlobalStore.getState().setDemoResult({
            weekPoints: data.week_points ?? 0,
            correctPicks: data.correct_picks ?? 0,
            totalPicks: data.total_picks ?? 0,
            hotpickRank: data.hotpick_rank ?? null,
            hotpickCorrect: data.is_hotpick_correct ?? null,
          });
        })
        .catch(() => {
          setDemoSubmitting(false);
          Alert.alert(
            'Could not score your demo week',
            'Something went wrong settling the demo. Please try again.',
          );
        });
      return;
    }

    setWeekComplete(true);
  }, [state, isDemo, setWeekComplete]);

  return {
    visible,
    state,
    enabled,
    label,
    onPress,
    accentColor: config?.color ?? '#F5620F',
  };
}
