import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {SeasonConfig} from '@shared/types/templates';
import {useTheme} from '@shell/theme';
import {useSeasonStore} from '../stores/seasonStore';

interface SeasonProgressProps {
  config: SeasonConfig;
  userId: string;
}

/**
 * SeasonProgress — Shows total points, rank, and weekly breakdown.
 * Season progress bar shows current week / totalWeeks.
 * Never references a specific sport.
 */
export function SeasonProgress({config, userId}: SeasonProgressProps) {
  const {colors, spacing, borderRadius} = useTheme();
  const score = useSeasonStore(s => s.getUserScore(userId));
  const leaderboard = useSeasonStore(s => s.leaderboard);
  const currentWeek = useSeasonStore(s => s.currentWeek);

  const totalPoints = score?.total_points ?? 0;

  // Determine rank from leaderboard position
  const rank = score
    ? leaderboard.findIndex(e => e.user_id === userId) + 1
    : 0;

  const weeklyBreakdown = score?.weekly_breakdown ?? {};

  const seasonProgress =
    config.totalWeeks > 0 ? currentWeek / config.totalWeeks : 0;

  // Get the most recent weeks with scores for the breakdown summary
  const weekEntries = Object.entries(weeklyBreakdown)
    .map(([wk, pts]) => ({week: Number(wk), points: pts}))
    .sort((a, b) => a.week - b.week);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      padding: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      margin: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    totalPoints: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    rankText: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    progressBar: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      marginTop: spacing.sm,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
    },
    progressLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    breakdown: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    weekChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.sm,
    },
    weekLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    weekPoints: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text,
    },
  }), [colors, spacing, borderRadius]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{config.shortName} Progress</Text>
        <Text style={styles.totalPoints}>{totalPoints} pts</Text>
      </View>

      {rank > 0 && (
        <Text style={styles.rankText}>
          #{rank} in pool
        </Text>
      )}

      {/* Season progress bar */}
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.min(seasonProgress * 100, 100)}%`,
              backgroundColor: config.color,
            },
          ]}
        />
      </View>
      <Text style={styles.progressLabel}>
        Week {currentWeek} of {config.totalWeeks}
      </Text>

      {/* Weekly breakdown */}
      {weekEntries.length > 0 && (
        <View style={styles.breakdown}>
          {weekEntries.map(({week, points}) => (
            <View key={week} style={styles.weekChip}>
              <Text style={styles.weekLabel}>W{week}</Text>
              <Text style={styles.weekPoints}>{points}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
