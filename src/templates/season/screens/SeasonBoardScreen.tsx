import React, {useEffect, useState, useRef, useCallback} from 'react';
import {Text} from '@shared/components/AppText';
import {
  View,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import type {ViewToken} from 'react-native';
import {useSeasonStore} from '../stores/seasonStore';
import type {SeasonLeaderboardEntry, WeekLeaderboardEntry} from '../stores/seasonStore';
import {useAuth} from '@shared/hooks/useAuth';
import {supabase} from '@shared/config/supabase';
import {spacing, borderRadius} from '@shared/theme';

import {useTheme} from '@shell/theme';
import {useNavReserve} from '@shared/hooks/useNavReserve';
import {AvatarBadge} from '@shared/components/AvatarBadge';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useFocusEffect} from '@react-navigation/native';
import {useCountdown} from '@shell/components/home/useCountdown';
import {logError} from '@shared/logging/logError';
import {useGlobalStore} from '@shell/stores/globalStore';
import {PlayerSlateAccordion} from '../components/PlayerSlateAccordion';
import type {PlayerSlateState} from '../components/PlayerSlateAccordion';
import {LEXICON} from '@shared/lexicon';

/**
 * SeasonBoardScreen — Dual leaderboard: Season + Week views.
 *
 * Per CLAUDE.md §5:
 * - Season-side: cumulative scores from pool_start_date to present
 * - Week-side: current week scores with HotPick detail (tap a row to reveal a
 *   player's full slate)
 * - Both always available via toggle — never show only one
 *
 * ONE list, switched by the toggle (the old horizontal swipe-pager nested a
 * variable-height list inside a paging ScrollView inside a vertical ScrollView
 * — expanding a slate made the pager drift off-page, the list "disappear", and
 * the reveal land below the fold. A single FlatList with scrollToIndex fixes
 * all of that: the reveal comes to you and the list holds still.)
 */
export function SeasonBoardScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const config = useSeasonStore(s => s.config);
  const navReserve = useNavReserve();
  const poolId = useSeasonStore(s => s.poolId);
  const currentWeek = useSeasonStore(s => s.currentWeek);
  const leaderboard = useSeasonStore(s => s.leaderboard);
  const leaderboardError = useSeasonStore(s => s.leaderboardError);
  const weekLeaderboard = useSeasonStore(s => s.weekLeaderboard);
  const weekLeaderboardDisplayedWeek = useSeasonStore(
    s => s.weekLeaderboardDisplayedWeek,
  );
  // Week tab label should reflect the week the leaderboard data is actually
  // for. During picks_open/locked the store falls back to currentWeek - 1 so
  // the tab doesn't show an empty list that fills as picks arrive.
  const displayedWeek = weekLeaderboardDisplayedWeek ?? currentWeek;
  const userNames = useSeasonStore(s => s.userNames);
  const userAvatars = useSeasonStore(s => s.userAvatars);
  const isLoading = useSeasonStore(s => s.isLoading);
  const fetchLeaderboard = useSeasonStore(s => s.fetchLeaderboard);
  const fetchWeekLeaderboard = useSeasonStore(s => s.fetchWeekLeaderboard);
  const allWeekGames = useSeasonStore(s => s.allWeekGames);
  const fetchWeekGames = useSeasonStore(s => s.fetchWeekGames);
  const {user} = useAuth();

  // Pool privacy flags (globalStore) — used ONLY to choose the slate accordion's
  // empty-state copy, never to gate tappability. get_player_week_picks is the
  // sole gate; the client just reacts to what it returns. Getting these wrong
  // only mis-picks a string — it can't leak data or break interaction.
  const activePool = useGlobalStore(s => s.userPools.find(p => p.id === poolId));
  const isNonPrivate =
    !!activePool &&
    (activePool.is_public ||
      activePool.is_global ||
      activePool.is_designated_public ||
      activePool.owning_club_id != null);

  const pathBackNarrative = useNFLStore(s => s.pathBackNarrative);
  const weekState = useNFLStore(s => s.weekState);

  // Last FINALIZED week (settling/complete → this week, else the previous one).
  // This is the honest denominator for the Season tab's "Points thru Week N":
  // during a 'live' week displayedWeek is already N, but the week isn't done —
  // lastFinalizedWeek stays N-1 there, so the label never claims a week that's
  // still in progress is complete.
  const lastFinalizedWeek = (weekState === 'settling' || weekState === 'complete')
    ? currentWeek
    : currentWeek - 1;

  const [activeTab, setActiveTab] = useState<'season' | 'week'>('week');

  // Board-owned week lock time (MIN kickoff for the displayed week), fetched
  // via get_week_lock_time so the HotPick-reveal trigger is phase-safe and
  // always fresh — NOT nflStore.weekFirstKickoff (null in preseason) or
  // picksDeadline (null in sim). isExpired flips true when the clock crosses it.
  const [weekLockAt, setWeekLockAt] = useState<Date | null>(null);
  const {isExpired, unit, unitText} = useCountdown(weekLockAt);
  // Slice 4 — persist-then-countdown. During the NEXT week's picks_open the
  // ladder persists the prior week's reveal (displayedWeek === currentWeek - 1),
  // and weekLockAt = get_week_lock_time(currentWeek) is the UPCOMING lock. When
  // that countdown drops under an hour (useCountdown reports unit === 'minute',
  // i.e. totalMinutes < 60), show a bold banner atop the reveal. The
  // displayedWeek === currentWeek - 1 gate keeps "week displayed" and "week we
  // count down to" adjacent; a null weekLockAt (post-Super-Bowl / no next week)
  // reports isExpired, so no banner. Reuses slice 1's useCountdown tick.
  const showLockCountdown =
    displayedWeek === currentWeek - 1 && !isExpired && unit === 'minute';
  const wasLockedRef = useRef(false);

  // Slice 2 — inline full-slate accordion. One-open-at-a-time (expandedUserId);
  // slates caches the RPC result per `${userId}:${week}` so re-expand is instant.
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [slates, setSlates] = useState<Record<string, PlayerSlateState>>({});

  // Pinned "You" row: shown when the user's own row is scrolled out of view.
  // FlatList reports which rows are on screen via onViewableItemsChanged — far
  // simpler and more reliable than the old measureInWindow-across-nested-
  // ScrollViews dance. The callback must stay STABLE (FlatList forbids swapping
  // it), so it reads the current user id from a ref rather than closing over it.
  const [showPinnedRow, setShowPinnedRow] = useState(false);
  const listRef = useRef<FlatList<any>>(null);
  const userIdRef = useRef<string | undefined>(undefined);
  const viewabilityConfig = useRef({itemVisiblePercentThreshold: 50}).current;
  const onViewableItemsChanged = useRef(
    ({viewableItems}: {viewableItems: ViewToken[]}) => {
      const me = userIdRef.current;
      setShowPinnedRow(
        me != null && !viewableItems.some(v => (v.item as any)?.user_id === me),
      );
    },
  ).current;
  // Keep the stable viewability callback's user id fresh without re-creating it.
  userIdRef.current = user?.id;

  // Subscribe to poolId changes in the season store via Zustand subscribe
  // This fires AFTER initialize() sets the new poolId — no race condition
  const lastFetchedPool = useRef('');
  useEffect(() => {
    const unsub = useSeasonStore.subscribe((state) => {
      if (state.poolId && state.config && state.poolId !== lastFetchedPool.current) {
        lastFetchedPool.current = state.poolId;
        state.fetchLeaderboard();
        state.fetchWeekLeaderboard();
      }
    });
    // Also fetch on mount
    if (poolId && config && poolId !== lastFetchedPool.current) {
      lastFetchedPool.current = poolId;
      fetchLeaderboard();
      fetchWeekLeaderboard();
    }
    return unsub;
    // Intentional empty deps: Zustand's subscribe handles state-change reactivity
    // internally. Re-running this effect on every config/poolId change would
    // tear down and rebuild the subscription on every render-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: week leaderboard updates live during games
  useEffect(() => {
    if (!config) return;

    const channel = supabase
      .channel(`week-board:${config.competition}:${currentWeek}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'season_user_totals',
          filter: `competition=eq.${config.competition}`,
        },
        () => {
          fetchWeekLeaderboard();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [config, currentWeek, fetchWeekLeaderboard]);

  // Realtime: both leaderboards refresh when week_state or current_week changes.
  // The Week tab's fallback logic (show previous week during picks_open/locked,
  // flip to current week during live/settling/complete) depends on week_state,
  // so we must refetch the Week tab too — not just the Season tab.
  useEffect(() => {
    if (!config) return;

    const channel = supabase
      .channel(`season-board:${config.competition}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'competition_config',
          filter: `competition=eq.${config.competition}`,
        },
        (payload) => {
          const key = (payload.new as any)?.key;
          if (key === 'week_state' || key === 'current_week') {
            fetchLeaderboard();
            fetchWeekLeaderboard();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [config, fetchLeaderboard, fetchWeekLeaderboard]);

  // Board-owned lock time: fetch get_week_lock_time (MIN kickoff) for the
  // current week, on mount and whenever the week changes. This is the same
  // value the server RPC gates the HotPick reveal on, so client trigger and
  // server gate open at the same instant by construction.
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    (async () => {
      const {data, error} = await supabase.rpc('get_week_lock_time', {
        p_competition: config.competition,
        p_week: currentWeek,
      });
      if (error) {
        logError(error, {
          screen: 'SeasonBoard',
          action: 'getWeekLockTime',
          competition: config.competition,
        });
        return;
      }
      if (!cancelled) setWeekLockAt(data ? new Date(data) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [config, currentWeek]);

  // Effect 4 — lock-time trigger: when the week's countdown crosses zero (first
  // kickoff), re-fetch so the HotPick reveal appears without waiting for an
  // incidental refetch. Guarded to a genuine false→true crossing with a real
  // lock time (a null deadline also reports isExpired, hence the weekLockAt guard).
  useEffect(() => {
    if (!weekLockAt) return;
    if (isExpired && !wasLockedRef.current) {
      wasLockedRef.current = true;
      fetchWeekLeaderboard();
    }
    if (!isExpired) wasLockedRef.current = false;
  }, [isExpired, weekLockAt, fetchWeekLeaderboard]);

  // Effect 5 — re-fetch when the Board regains focus (app foreground, tab
  // return). Catches the common case: app backgrounded at kickoff, opened
  // later; focus fires the fetch and the reveal is present. Effect 4 covers the
  // app-open-through-lock case.
  useFocusEffect(
    useCallback(() => {
      if (poolId && config) fetchWeekLeaderboard();
    }, [poolId, config, fetchWeekLeaderboard]),
  );

  // Collapse any open slate when the displayed week changes, so an expanded row
  // never points at a week whose games/slate aren't loaded (perpetual spinner).
  useEffect(() => {
    setExpandedUserId(null);
  }, [displayedWeek]);

  const switchTab = (tab: 'season' | 'week') => {
    // Collapse any open slate and jump back to the top so the two tabs never
    // inherit each other's scroll position or a stale expansion.
    setExpandedUserId(null);
    setActiveTab(tab);
    listRef.current?.scrollToOffset({offset: 0, animated: false});
  };

  const currentPhase = useNFLStore(s => s.currentPhase);

  // Compute previous-week rankings so we can show rank movement arrows.
  // Must live above early returns to satisfy React's hook ordering rules.
  const prevRankMap = React.useMemo(() => {
    if (leaderboard.length === 0) return {} as Record<string, number>;
    const allWeeks = new Set<number>();
    for (const entry of leaderboard) {
      for (const w of Object.keys(entry.weekly_breakdown).map(Number)) allWeeks.add(w);
    }
    const sortedWeeks = [...allWeeks].sort((a, b) => b - a);
    const latestWeek = sortedWeeks[0];
    if (latestWeek == null || sortedWeeks.length < 2) return {};

    const prevTotals = leaderboard.map(e => ({
      user_id: e.user_id,
      pts: e.total_points - (e.weekly_breakdown[latestWeek] ?? 0),
    }));
    prevTotals.sort((a, b) => b.pts - a.pts);
    const map: Record<string, number> = {};
    prevTotals.forEach((e, i) => { map[e.user_id] = i + 1; });
    return map;
  }, [leaderboard]);

  if (!config || isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={config?.color ?? colors.primary} />
      </View>
    );
  }

  const renderSeasonRow = ({item, index}: {item: SeasonLeaderboardEntry; index: number}) => {
    const isMe = item.user_id === user?.id;
    // Co-ranked standing from the server; fall back to a sequential index only
    // until the standings function has loaded (or on a degraded call).
    const rank = item.standing_rank ?? index + 1;
    // "T-3rd" when the rank is shared on a points tie; plain "3rd" otherwise.
    const rankLabel = item.is_tied ? `T-${rank}` : `${rank}`;

    const weekKeys = Object.keys(item.weekly_breakdown)
      .map(Number)
      .sort((a, b) => b - a);
    const latestWeek = weekKeys[0];
    const latestPoints = latestWeek != null ? item.weekly_breakdown[latestWeek] : null;

    // Rank movement: positive = moved up, negative = moved down
    const prevRank = prevRankMap[item.user_id];
    const rankDelta = prevRank != null ? prevRank - rank : 0;

    return (
      <View
        key={item.user_id}
        style={[styles.row, isMe && styles.rowHighlight]}>
        <Text style={[styles.rank, isMe && styles.textHighlight]}>{rankLabel}</Text>
        <AvatarBadge avatarKey={userAvatars[item.user_id]} name={userNames[item.user_id] ?? 'P'} size={24} />
        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.userName, isMe && styles.textHighlight]}
              numberOfLines={1}>
              {isMe ? 'You' : (userNames[item.user_id] ?? `Player ${rank}`)}
            </Text>
            {rankDelta !== 0 ? (
              <Text style={[styles.rankDelta, rankDelta > 0 ? styles.rankUp : styles.rankDown]}>
                {rankDelta > 0 ? '▲' : '▼'}{Math.abs(rankDelta)}
              </Text>
            ) : prevRank != null ? (
              <Text style={styles.rankSame}>◆</Text>
            ) : null}
          </View>
          {latestPoints != null && (
            <Text style={styles.breakdown}>
              Wk {latestWeek}: {latestPoints} pts
            </Text>
          )}
          {/* Path Back Narrative — shown only on user's own row */}
          {isMe && pathBackNarrative && (
            <Text style={styles.narrativeText}>{pathBackNarrative}</Text>
          )}
        </View>
        <Text style={[styles.totalPoints, isMe && styles.textHighlight]}>
          {item.total_points} pts
        </Text>
      </View>
    );
  };

  // Fetch the week's games and the member's slate together on ONE captured week
  // value so they can never diverge. Matches the hardened .rpc error pattern.
  const loadSlate = async (targetUserId: string, week: number, key: string) => {
    if (!config || !poolId) return;
    const [, picksResult] = await Promise.all([
      fetchWeekGames(week),
      supabase.rpc('get_player_week_picks', {
        p_pool_id: poolId,
        p_competition: config.competition,
        p_week: week,
        p_target_user_id: targetUserId,
      }),
    ]);
    const {data, error} = picksResult;
    if (error) {
      logError(error, {
        screen: 'SeasonBoard',
        action: 'getPlayerWeekPicks',
        competition: config.competition,
      });
      setSlates(prev => ({...prev, [key]: {status: 'error', picks: []}}));
      return;
    }
    setSlates(prev => ({
      ...prev,
      [key]: {status: 'ready', picks: (data ?? []) as PlayerSlateState['picks']},
    }));
  };

  const toggleExpand = (targetUserId: string) => {
    if (expandedUserId === targetUserId) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(targetUserId);

    // Bring the tapped row toward the top so the slate revealed below it is
    // actually on screen — the old layout dropped it below the fold. viewPosition
    // 0.12 leaves the row near the top with room for the accordion underneath.
    const idx = weekLeaderboard.findIndex(e => e.user_id === targetUserId);
    if (idx >= 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({index: idx, viewPosition: 0.12, animated: true});
      });
    }

    const week = displayedWeek;
    const key = `${targetUserId}:${week}`;
    // Lazy; cache SUCCESSES (and in-flight) only. An 'error' entry falls through
    // and re-fetches on reopen, so a failed slate isn't stuck.
    const cached = slates[key];
    if (cached && (cached.status === 'ready' || cached.status === 'loading')) return;
    setSlates(prev => ({...prev, [key]: {status: 'loading', picks: []}}));
    void loadSlate(targetUserId, week, key);
  };

  const renderWeekRow = ({item, index}: {item: WeekLeaderboardEntry; index: number}) => {
    const isMe = item.user_id === user?.id;
    const rank = index + 1;
    const isExpanded = expandedUserId === item.user_id && !isMe;
    const weekGames = allWeekGames[displayedWeek] ?? [];
    const slateKey = `${item.user_id}:${displayedWeek}`;

    return (
      <View key={item.user_id}>
        <TouchableOpacity
          activeOpacity={isMe ? 1 : 0.7}
          onPress={isMe ? undefined : () => toggleExpand(item.user_id)}
          disabled={isMe}>
          <View
            style={[styles.row, isMe && styles.rowHighlight]}>
        <Text style={[styles.rank, isMe && styles.textHighlight]}>{rank}</Text>
        <AvatarBadge avatarKey={userAvatars[item.user_id]} name={userNames[item.user_id] ?? 'P'} size={24} />
        <View style={styles.userInfo}>
          <Text
            style={[styles.userName, isMe && styles.textHighlight]}
            numberOfLines={1}>
            {isMe ? 'You' : (userNames[item.user_id] ?? `Player ${rank}`)}
          </Text>
          {item.hotpick_team && item.hotpick_game_label && (
            <View style={styles.hotpickRow}>
              {item.hotpick_rank != null && (
                <View style={styles.hotpickRankCircle}>
                  <Text style={styles.hotpickRankNumber}>{item.hotpick_rank}</Text>
                </View>
              )}
              {(() => {
                const parts = item.hotpick_game_label!.split(' @ ');
                const away = parts[0] ?? '';
                const home = parts[1] ?? '';
                const picked = item.hotpick_team;
                return (
                  <View style={styles.hotpickMatchupRow}>
                    {picked === away ? (
                      <View style={styles.hotpickPickedBox}>
                        <Text style={styles.hotpickPickedText}>{away}</Text>
                      </View>
                    ) : (
                      <Text style={styles.hotpickTeamText}>{away}</Text>
                    )}
                    <Text style={styles.hotpickAtText}>@</Text>
                    {picked === home ? (
                      <View style={styles.hotpickPickedBox}>
                        <Text style={styles.hotpickPickedText}>{home}</Text>
                      </View>
                    ) : (
                      <Text style={styles.hotpickTeamText}>{home}</Text>
                    )}
                    {item.is_hotpick_correct === true && (
                      <Text style={styles.hotpickResult}>{'\u2705'}</Text>
                    )}
                    {item.is_hotpick_correct === false && (
                      <Text style={styles.hotpickResult}>{'\u274C'}</Text>
                    )}
                  </View>
                );
              })()}
            </View>
          )}
        </View>
        <Text style={[styles.totalPoints, isMe && styles.textHighlight]}>
          {item.week_points} pts
        </Text>
          </View>
        </TouchableOpacity>
        {isExpanded && (
          <PlayerSlateAccordion
            games={weekGames}
            slate={slates[slateKey]}
            isNonPrivate={isNonPrivate}
            teams={config?.teams}
          />
        )}
      </View>
    );
  };

  // One list, chosen by the toggle. The old horizontal swipe-pager is gone.
  const activeData: any[] = activeTab === 'season' ? leaderboard : weekLeaderboard;

  const listHeader = (
    <View>
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleTab, activeTab === 'season' && styles.toggleTabActive]}
          onPress={() => switchTab('season')}>
          <Text style={[
            styles.toggleText,
            activeTab === 'season' && styles.toggleTextActive,
          ]}>
            Points thru Week {lastFinalizedWeek}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleTab, activeTab === 'week' && styles.toggleTabActive]}
          onPress={() => switchTab('week')}>
          <Text style={[
            styles.toggleText,
            activeTab === 'week' && styles.toggleTextActive,
          ]}>
            Week {displayedWeek} Points
          </Text>
        </TouchableOpacity>
      </View>
      {activeTab === 'week' && showLockCountdown && (
        <View style={styles.lockBanner}>
          <Text style={styles.lockBannerText}>
            {`WEEK ${currentWeek} ${LEXICON.picks.toUpperCase()} LOCK IN ${unitText.toUpperCase()}`}
          </Text>
        </View>
      )}
    </View>
  );

  // Off-/pre-season: the ladder has no scores yet — show the same aspirational
  // copy on both toggle sides (replaces the old full-screen PRE_SEASON early-
  // return; now keeps the tabs visible and also covers OFF_SEASON). Mid-season
  // keeps the functional "scores will appear" messages below.
  const isPreLaunch = currentPhase === 'OFF_SEASON' || currentPhase === 'PRE_SEASON';
  const prelaunchEmpty = (
    <View style={styles.emptyState}>
      <Text style={{fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginBottom: 8, textAlign: 'center', paddingHorizontal: 32}}>
        Something tells me you'll be right at the top of this ladder.
      </Text>
      <Text style={{fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 32}}>
        Once your picks lock, you'll be able to see just how much better you are at picking winners.
      </Text>
    </View>
  );

  const listEmpty =
    activeTab === 'season' ? (
      leaderboardError ? (
        // Surfaced fetch error — visible + recoverable, NEVER a silent blank
        // list (the #360 regression). Distinct from the genuine empty below.
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{leaderboardError}</Text>
          <TouchableOpacity
            onPress={() => {
              fetchLeaderboard();
              fetchWeekLeaderboard();
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading the Ladder"
            style={{
              marginTop: 12,
              paddingHorizontal: 20,
              paddingVertical: 8,
              borderRadius: borderRadius.md,
              backgroundColor: colors.primary,
            }}>
            <Text style={{color: '#FFFFFF', fontWeight: '600'}}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : isPreLaunch ? prelaunchEmpty : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {currentWeek === 1 &&
              (weekState === 'picks_open' || weekState === 'locked' || weekState === 'live')
              ? 'The season leaderboard updates after all Week 1 scores are in.'
              : 'Scores will appear here once games are completed.'}
          </Text>
        </View>
      )
    ) : isPreLaunch ? prelaunchEmpty : (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>
          Week {displayedWeek} scores will appear once games are played.
        </Text>
      </View>
    );

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        style={{flex: 1}}
        data={activeData}
        keyExtractor={(item) => item.user_id}
        // Union renderItem — data is season OR week rows depending on the tab.
        renderItem={(activeTab === 'season' ? renderSeasonRow : renderWeekRow) as any}
        // Week rows re-render when the open slate changes.
        extraData={expandedUserId}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={[styles.listContent, {flexGrow: 1, paddingBottom: navReserve}]}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onScrollToIndexFailed={info => {
          // Target row isn't measured yet — jump to an estimate, then land it.
          listRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: false,
          });
          setTimeout(() => {
            listRef.current?.scrollToIndex({
              index: info.index,
              viewPosition: 0.12,
              animated: true,
            });
          }, 60);
        }}
      />

      {/* Pinned "You" row — shows only when user's row has scrolled off screen */}
      {(() => {
        const activeList = activeTab === 'season' ? leaderboard : weekLeaderboard;
        const myIndex = activeList.findIndex(e => e.user_id === user?.id);
        if (myIndex === -1 || !showPinnedRow) return null;
        const myEntry = activeList[myIndex];
        const rank = myIndex + 1;
        const points = activeTab === 'season'
          ? (myEntry as SeasonLeaderboardEntry).total_points
          : (myEntry as WeekLeaderboardEntry).week_points;
        return (
          <View style={[styles.pinnedRow, {borderTopColor: colors.border}]}>
            <Text style={[styles.rank, styles.textHighlight]}>{rank}</Text>
            <AvatarBadge avatarKey={userAvatars[user?.id ?? ''] ?? null} name={userNames[user?.id ?? ''] ?? 'Y'} size={24} />
            <View style={styles.userInfo}>
              <Text style={[styles.userName, styles.textHighlight]} numberOfLines={1}>
                You
              </Text>
            </View>
            <Text style={[styles.totalPoints, styles.textHighlight]}>
              {points} pts
            </Text>
          </View>
        );
      })()}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Horizontal inset for the whole list (rows, header, empty state) — replaces
  // the old per-panel `leaderboard` padding now that there's one FlatList.
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: 3,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md - 2,
  },
  toggleTabActive: {
    backgroundColor: colors.primary,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.onPrimary,
  },
  lockBanner: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  lockBannerText: {
    color: colors.onPrimary,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  rowHighlight: {
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderRadius: 0,
    marginHorizontal: 0,
  },
  rank: {
    width: 28,
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 24,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rankDelta: {
    fontSize: 13,
    fontWeight: '700',
  },
  rankUp: {
    color: colors.success,
  },
  rankDown: {
    color: colors.error,
  },
  rankSame: {
    fontSize: 9,
    color: colors.accentTeal,
  },
  userInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  userName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  breakdown: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  hotpickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  hotpickRankCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotpickRankNumber: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.onPrimary,
  },
  hotpickMatchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  hotpickTeamText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  hotpickAtText: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  hotpickResult: {
    fontSize: 12,
    marginLeft: 3,
  },
  hotpickPickedBox: {
    borderWidth: 1.5,
    borderColor: colors.accentTeal,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  hotpickPickedText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accentTeal,
  },
  totalPoints: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingTop: 2,
  },
  textHighlight: {
    color: colors.primary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  narrativeText: {
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
    color: colors.primary,
    marginTop: 4,
  },
});
