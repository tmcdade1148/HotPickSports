import React, {useEffect, useState, useRef} from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
} from 'react-native';
import {useSeasonStore} from '../stores/seasonStore';
import type {SeasonLeaderboardEntry, WeekLeaderboardEntry} from '../stores/seasonStore';
import {SeasonProgress} from '../components/SeasonProgress';
import {useAuth} from '@shared/hooks/useAuth';
import {supabase} from '@shared/config/supabase';
import {spacing, borderRadius} from '@shared/theme';
import {Flame} from 'lucide-react-native';

import {useTheme} from '@shell/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

/**
 * SeasonBoardScreen — Dual leaderboard: Season + Week views.
 *
 * Per CLAUDE.md §5:
 * - Season-side: cumulative scores from pool_start_date to present
 * - Week-side: current week scores with HotPick detail
 * - Both always available via toggle — never show only one
 * - Toggle tap or horizontal swipe to switch
 */
export function SeasonBoardScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const config = useSeasonStore(s => s.config);
  const poolId = useSeasonStore(s => s.poolId);
  const currentWeek = useSeasonStore(s => s.currentWeek);
  const leaderboard = useSeasonStore(s => s.leaderboard);
  const weekLeaderboard = useSeasonStore(s => s.weekLeaderboard);
  const userNames = useSeasonStore(s => s.userNames);
  const isLoading = useSeasonStore(s => s.isLoading);
  const fetchLeaderboard = useSeasonStore(s => s.fetchLeaderboard);
  const fetchWeekLeaderboard = useSeasonStore(s => s.fetchWeekLeaderboard);
  const {user} = useAuth();

  const pathBackNarrative = useNFLStore(s => s.pathBackNarrative);
  const weekState = useNFLStore(s => s.weekState);
  const activePoolId = useGlobalStore(s => s.activePoolId);

  // Last finalized week: if current week is settling/complete, it's this week.
  // Otherwise it's the previous week (current week is still in play).
  const lastFinalizedWeek = (weekState === 'settling' || weekState === 'complete')
    ? currentWeek
    : currentWeek - 1;

  const [activeTab, setActiveTab] = useState<'season' | 'week'>('season');
  const scrollRef = useRef<ScrollView>(null);

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

  // Realtime: season leaderboard refreshes when week state transitions to complete
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
          // Refresh season leaderboard when week_state changes (scores finalized)
          const key = (payload.new as any)?.key;
          if (key === 'week_state' || key === 'current_week') {
            fetchLeaderboard();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [config, fetchLeaderboard]);

  const switchTab = (tab: 'season' | 'week') => {
    setActiveTab(tab);
    scrollRef.current?.scrollTo({
      x: tab === 'season' ? 0 : SCREEN_WIDTH,
      animated: true,
    });
  };

  const handleScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const newTab = offsetX > SCREEN_WIDTH / 2 ? 'week' : 'season';
    setActiveTab(newTab);
  };

  const currentPhase = useNFLStore(s => s.currentPhase);

  if (currentPhase === 'PRE_SEASON') {
    return (
      <View style={styles.loading}>
        <Text style={{fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginBottom: 8}}>Leaderboard</Text>
        <Text style={{fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 32}}>
          The leaderboard will come alive once the season kicks off. Check back when picks open.
        </Text>
      </View>
    );
  }

  if (!config || isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={config?.color ?? colors.primary} />
      </View>
    );
  }

  const renderSeasonRow = ({item, index}: {item: SeasonLeaderboardEntry; index: number}) => {
    const isMe = item.user_id === user?.id;
    const rank = index + 1;

    const weekKeys = Object.keys(item.weekly_breakdown)
      .map(Number)
      .sort((a, b) => b - a);
    const latestWeek = weekKeys[0];
    const latestPoints = latestWeek != null ? item.weekly_breakdown[latestWeek] : null;

    return (
      <View key={item.user_id} style={[styles.row, isMe && styles.rowHighlight]}>
        <Text style={[styles.rank, isMe && styles.textHighlight]}>{rank}</Text>
        <View style={styles.userInfo}>
          <Text
            style={[styles.userName, isMe && styles.textHighlight]}
            numberOfLines={1}>
            {isMe ? 'You' : (userNames[item.user_id] ?? `Player ${rank}`)}
          </Text>
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

  const renderWeekRow = ({item, index}: {item: WeekLeaderboardEntry; index: number}) => {
    const isMe = item.user_id === user?.id;
    const rank = index + 1;

    const hotPickColor = item.is_hotpick_correct === true
      ? colors.success
      : item.is_hotpick_correct === false
        ? colors.error ?? '#E53935'
        : colors.textSecondary;

    const hotPickSign = item.is_hotpick_correct === true
      ? '+'
      : item.is_hotpick_correct === false
        ? '-'
        : '';

    return (
      <View key={item.user_id} style={[styles.row, isMe && styles.rowHighlight]}>
        <Text style={[styles.rank, isMe && styles.textHighlight]}>{rank}</Text>
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
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={{flex: 1}}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleTab, activeTab === 'season' && styles.toggleTabActive]}
            onPress={() => switchTab('season')}>
            <Text style={[
              styles.toggleText,
              activeTab === 'season' && styles.toggleTextActive,
            ]}>
              Season{lastFinalizedWeek > 0 ? ` - Wk${lastFinalizedWeek}` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleTab, activeTab === 'week' && styles.toggleTabActive]}
            onPress={() => switchTab('week')}>
            <Text style={[
              styles.toggleText,
              activeTab === 'week' && styles.toggleTextActive,
            ]}>
              Week {currentWeek}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Swipeable panels */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}>

          {/* Season panel */}
          <View style={{width: SCREEN_WIDTH}}>
            <View style={styles.leaderboard}>
              {leaderboard.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    {currentWeek === 1 &&
                      (weekState === 'picks_open' || weekState === 'locked' || weekState === 'live')
                      ? 'The season leaderboard updates after all Week 1 scores are in.'
                      : 'Scores will appear here once games are completed.'}
                  </Text>
                </View>
              ) : (
                leaderboard.map((item, index) => renderSeasonRow({item, index}))
              )}
            </View>
          </View>

          {/* Week panel */}
          <View style={{width: SCREEN_WIDTH}}>
            <View style={styles.leaderboard}>
              {weekLeaderboard.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    Week {currentWeek} scores will appear once games are played.
                  </Text>
                </View>
              ) : (
                weekLeaderboard.map((item, index) => renderWeekRow({item, index}))
              )}
            </View>
          </View>
        </ScrollView>
      </ScrollView>

      {/* Pinned "You" row — shows when user is ranked below visible area */}
      {(() => {
        const activeList = activeTab === 'season' ? leaderboard : weekLeaderboard;
        const myIndex = activeList.findIndex(e => e.user_id === user?.id);
        // Pin if user exists and is beyond 5th position (likely off-screen)
        if (myIndex < 5 || myIndex === -1) return null;
        const myEntry = activeList[myIndex];
        const rank = myIndex + 1;
        const points = activeTab === 'season'
          ? (myEntry as SeasonLeaderboardEntry).total_points
          : (myEntry as WeekLeaderboardEntry).week_points;
        return (
          <View style={[styles.pinnedRow, {borderTopColor: colors.border}]}>
            <Text style={[styles.rank, styles.textHighlight]}>{rank}</Text>
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
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
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
    color: '#FFFFFF',
  },
  leaderboard: {
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    alignItems: 'flex-start',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderRadius: 0,
    marginHorizontal: 0,
  },
  rank: {
    width: 32,
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    paddingTop: 2,
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
    color: '#FFFFFF',
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
    borderColor: colors.highlight,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  hotpickPickedText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.highlight,
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xl,
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
