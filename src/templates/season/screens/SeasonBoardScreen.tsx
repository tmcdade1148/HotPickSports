import React, {useEffect} from 'react';
import {View, Text, ScrollView, ActivityIndicator, StyleSheet} from 'react-native';
import {useSeasonStore} from '../stores/seasonStore';
import type {SeasonLeaderboardEntry} from '../stores/seasonStore';
import {SeasonProgress} from '../components/SeasonProgress';
import {useAuth} from '@shared/hooks/useAuth';
import {colors, spacing, borderRadius} from '@shared/theme';

/**
 * SeasonBoardScreen — Standings showing pool leaderboard.
 * SeasonProgress at top, ranked player list below.
 * Never references a specific sport.
 */
export function SeasonBoardScreen() {
  const config = useSeasonStore(s => s.config);
  const leaderboard = useSeasonStore(s => s.leaderboard);
  const userNames = useSeasonStore(s => s.userNames);
  const isLoading = useSeasonStore(s => s.isLoading);
  const fetchLeaderboard = useSeasonStore(s => s.fetchLeaderboard);
  const {user} = useAuth();

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  if (!config) {
    return null;
  }

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={config.color} />
      </View>
    );
  }

  const renderRow = ({item, index}: {item: SeasonLeaderboardEntry; index: number}) => {
    const isMe = item.user_id === user?.id;
    const rank = index + 1;

    // Get most recent week's points for the breakdown column
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
        </View>
        <Text style={[styles.totalPoints, isMe && styles.textHighlight]}>
          {item.total_points} pts
        </Text>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <SeasonProgress config={config} userId={user?.id ?? ''} />

      <View style={styles.leaderboard}>
        <Text style={styles.sectionTitle}>Standings</Text>
        {leaderboard.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              Scores will appear here once games are completed.
            </Text>
          </View>
        ) : (
          leaderboard.map((item, index) => renderRow({item, index}))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  leaderboard: {
    flex: 1,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
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
    color: colors.textSecondary,
    textAlign: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  userName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  breakdown: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  totalPoints: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
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
});
