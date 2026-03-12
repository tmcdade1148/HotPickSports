import React, {useEffect} from 'react';
import {View, Text, ScrollView, ActivityIndicator, StyleSheet} from 'react-native';
import {useSeriesStore} from '../stores/seriesStore';
import {SeriesProgress} from '../components/SeriesProgress';
import {useAuth} from '@shared/hooks/useAuth';
import {spacing, borderRadius} from '@shared/theme';
import {PoweredByHotPick} from '@shell/components/PoweredByHotPick';
import type {DbSeriesUserTotal} from '@shared/types/database';
import {useTheme} from '@shell/theme';

/**
 * SeriesBoardScreen — Standings showing pool leaderboard.
 * SeriesProgress at top, ranked player list below.
 * Never references a specific sport.
 */
export function SeriesBoardScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const config = useSeriesStore(s => s.config);
  const leaderboard = useSeriesStore(s => s.leaderboard);
  const userNames = useSeriesStore(s => s.userNames);
  const isLoading = useSeriesStore(s => s.isLoading);
  const fetchLeaderboard = useSeriesStore(s => s.fetchLeaderboard);
  const {user} = useAuth();

  useEffect(() => {
    if (!config || !user?.id) {
      return;
    }
    const load = async () => {
      await fetchLeaderboard();
    };
    load();
  }, [config, user?.id, fetchLeaderboard]);

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

  const renderRow = ({item, index}: {item: DbSeriesUserTotal; index: number}) => {
    const isMe = item.user_id === user?.id;
    const rank = index + 1;

    // Show the round this score is from and the round-specific points
    const roundLabel = config.rounds.find(rc => rc.key === item.round)?.label;

    return (
      <View key={item.id} style={[styles.row, isMe && styles.rowHighlight]}>
        <Text style={[styles.rank, isMe && styles.textHighlight]}>{rank}</Text>
        <View style={styles.userInfo}>
          <Text
            style={[styles.userName, isMe && styles.textHighlight]}
            numberOfLines={1}>
            {isMe ? 'You' : (userNames[item.user_id] ?? `Player ${rank}`)}
          </Text>
          {roundLabel != null && (
            <Text style={styles.breakdown}>
              {roundLabel}: {item.round_points} pts
            </Text>
          )}
        </View>
        <Text style={[styles.totalPoints, isMe && styles.textHighlight]}>
          {item.cumulative_points} pts
        </Text>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <SeriesProgress config={config} userId={user?.id ?? ''} />
      <PoweredByHotPick />

      <View style={styles.leaderboard}>
        <Text style={styles.sectionTitle}>Standings</Text>
        {leaderboard.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              Scores will appear here once series are completed.
            </Text>
          </View>
        ) : (
          leaderboard.map((item, index) => renderRow({item, index}))
        )}
      </View>
    </ScrollView>
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
  leaderboard: {
    flex: 1,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
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
    color: colors.textPrimary,
  },
  breakdown: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
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
