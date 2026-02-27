import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {SeriesConfig} from '@shared/types/templates';
import {colors, spacing, borderRadius} from '@shared/theme';
import {useSeriesStore} from '../stores/seriesStore';

interface SeriesProgressProps {
  config: SeriesConfig;
  userId: string;
}

/**
 * SeriesProgress — Shows total points, rank, and current round info.
 * Progress bar shows completed rounds / total rounds.
 * Never references a specific sport.
 */
export function SeriesProgress({config, userId}: SeriesProgressProps) {
  const score = useSeriesStore(s => s.getUserScore(userId));
  const leaderboard = useSeriesStore(s => s.leaderboard);
  const currentRound = useSeriesStore(s => s.currentRound);

  const cumulativePoints = score?.cumulative_points ?? 0;
  const roundPoints = score?.round_points ?? 0;
  const currentRoundKey = score?.round;

  // Derive rank from leaderboard position
  const rank = score
    ? leaderboard.findIndex(s => s.user_id === userId) + 1
    : 0;

  // Determine how far along the playoffs are based on the latest scored round
  const latestRoundIndex = currentRoundKey
    ? config.rounds.findIndex(rc => rc.key === currentRoundKey)
    : -1;
  const completedRounds = latestRoundIndex >= 0 ? latestRoundIndex + 1 : 0;
  const totalRounds = config.rounds.length;
  const seriesProgress = totalRounds > 0 ? completedRounds / totalRounds : 0;

  // Show latest round label and points
  const latestRoundLabel = currentRoundKey
    ? config.rounds.find(rc => rc.key === currentRoundKey)?.label
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{config.shortName} Progress</Text>
        <Text style={styles.totalPoints}>{cumulativePoints} pts</Text>
      </View>

      {rank > 0 && (
        <Text style={styles.rankText}>
          #{rank} in pool
        </Text>
      )}

      {/* Series progress bar */}
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.min(seriesProgress * 100, 100)}%`,
              backgroundColor: config.color,
            },
          ]}
        />
      </View>
      <Text style={styles.progressLabel}>
        Round {currentRound + 1} of {totalRounds}
      </Text>

      {/* Latest round info */}
      {latestRoundLabel != null && (
        <View style={styles.breakdown}>
          <View style={styles.roundChip}>
            <Text style={styles.roundLabel}>{latestRoundLabel}</Text>
            <Text style={styles.roundPoints}>{roundPoints}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  roundChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  roundLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  roundPoints: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
});
