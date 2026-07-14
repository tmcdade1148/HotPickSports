import {useEffect, useRef} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';

/**
 * Foreground refetch handler — insurance policy for cases where the Supabase
 * Realtime WebSocket dropped while the app was backgrounded by iOS/Android
 * and didn't fully recover. When the app returns to active state, we refetch
 * the slices of data that drive live UI:
 *
 *   - competition_config (week_state, current_week, picks_open, scoring_locked)
 *   - User picks for the current week
 *   - Season + Week leaderboards for the active pool
 *   - SmackTalk unread counts for every visible pool
 *
 * Mount this hook ONCE at the MainTabNavigator level so it doesn't fire
 * during auth/onboarding flows.
 *
 * Realtime subscriptions themselves are not torn down or rebuilt here —
 * Supabase's JS client automatically reconnects channels when the network
 * comes back. This hook only papers over the gap between resume and
 * reconnect, when missed events could otherwise leave the UI stale.
 */
export function useForegroundRefetch() {
  const previousState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      async (nextState) => {
        const prev = previousState.current;
        previousState.current = nextState;

        // Only refetch on the background/inactive → active transition.
        // (active → active is a no-op the OS occasionally fires.)
        if (
          (prev !== 'background' && prev !== 'inactive') ||
          nextState !== 'active'
        ) {
          return;
        }

        const userId = useGlobalStore.getState().user?.id;
        const visiblePools = useGlobalStore.getState().visiblePools;
        const activeSport = useGlobalStore.getState().activeSport;

        // No active session — nothing to refetch.
        if (!userId) return;

        // Pool membership — silent (no spinner). This is also how an approved
        // applicant's Contest appears without any poll: on the next foreground,
        // their now-active membership is picked up here. Pre-existing gap fix —
        // the pool list never refetched on foreground before.
        if (activeSport?.competition) {
          await useGlobalStore
            .getState()
            .fetchUserPools(userId, activeSport.competition, {silent: true})
            .catch(() => {});
        }

        // 1. NFL store — competition_config (week_state, picks_open, etc) and
        // live scores. Only when on a season-template competition. The handler
        // is already write-safe (gates derived state behind configLoaded).
        if (activeSport?.templateType === 'season') {
          const nfl = useNFLStore.getState();
          await nfl.fetchCompetitionConfig().catch(() => {});
          // Refresh live scores once on resume (T3-1). Realtime is the primary
          // path but does not replay events missed while backgrounded, so a
          // user who left during a live HotPick game would otherwise return to
          // a stale score. One-shot fetch, never a poll; runs after config so
          // currentWeek is current.
          await nfl.fetchLiveScores().catch(() => {});
        }

        // 2. Season store — user picks + leaderboards (active pool).
        const season = useSeasonStore.getState();
        if (season.config && season.poolId && season.currentWeek > 0) {
          await Promise.all([
            season.fetchUserPicks(userId, season.currentWeek).catch(() => {}),
            season.fetchLeaderboard().catch(() => {}),
            season.fetchWeekLeaderboard().catch(() => {}),
          ]);
        }

        // 3. Global store — SmackTalk unread counts across visible pools.
        if (visiblePools.length > 0) {
          const poolIds = visiblePools.map((p) => p.id);
          await useGlobalStore
            .getState()
            .fetchSmackUnreadCounts(userId, poolIds)
            .catch(() => {});
        }
      },
    );

    return () => subscription.remove();
  }, []);
}
