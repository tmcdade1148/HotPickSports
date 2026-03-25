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
  const currentWeek = useSeasonStore(s => s.currentWeek);
  const leaderboard = useSeasonStore(s => s.leaderboard);
  const weekLeaderboard = useSeasonStore(s => s.weekLeaderboard);
  const userNames = useSeasonStore(s => s.userNames);
  const isLoading = useSeasonStore(s => s.isLoading);
  const fetchLeaderboard = useSeasonStore(s => s.fetchLeaderboard);
  const fetchWeekLeaderboard = useSeasonStore(s => s.fetchWeekLeaderboard);
  const {user} = useAuth();

  const pathBackNarrative = useNFLStore(s => s.pathBackNarrative);

  const [activeTab, setActiveTab] = useState<'season' | 'week'>('season');
  const scrollRef = useRef<ScrollView>(null);

  // Initial fetch
  useEffect(() => {
    if (!config) return;
    fetchLeaderboard();
    fetchWeekLeaderboard();
  }, [config, fetchLeaderboard, fetchWeekLeaderboard]);

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
          {item.hotpick_team && (
            <View style={styles.hotpickRow}>
              <Flame size={12} color={colors.primary} fill={colors.primary} />
              <Text style={styles.hotpickDetail}>
                {item.hotpick_team}
                {item.hotpick_game_label ? ` (${item.hotpick_game_label})` : ''}
              </Text>
              {item.hotpick_rank != null && (
                <Text style={[styles.hotpickPoints, {color: hotPickColor}]}>
                  {hotPickSign}{item.hotpick_rank}
                </Text>
              )}
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
        <SeasonProgress config={config} userId={user?.id ?? ''} />

        {/* Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleTab, activeTab === 'season' && styles.toggleTabActive]}
            onPress={() => switchTab('season')}>
            <Text style={[
              styles.toggleText,
              activeTab === 'season' && styles.toggleTextActive,
            ]}>
              Season
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
                    Scores will appear here once games are completed.
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
    alignItems: 'center',
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
  rank: {
    width: 32,
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
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
    marginTop: 2,
  },
  hotpickDetail: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  hotpickPoints: {
    fontSize: 12,
    fontWeight: '700',
  },
  totalPoints: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
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
