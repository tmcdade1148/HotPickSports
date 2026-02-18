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
 * SeriesProgress — Shows total points, rank, and round breakdown.
 * Progress bar shows completed rounds / total rounds.
 * Never references a specific sport.
 */
export function SeriesProgress({config, userId}: SeriesProgressProps) {
  const score = useSeriesStore(s => s.getUserScore(userId));
  const currentRound = useSeriesStore(s => s.currentRound);

  const totalPoints = score?.total_points ?? 0;
  const rank = score?.rank ?? 0;
  const roundBreakdown = score?.round_breakdown ?? {};

  // Calculate progress: how many rounds have been completed vs total rounds
  const completedRounds = Object.keys(roundBreakdown).length;
  const totalRounds = config.rounds.length;
  const seriesProgress = totalRounds > 0 ? completedRounds / totalRounds : 0;

  // Build round entries sorted by config order
  const roundEntries = config.rounds
    .map(rc => ({
      key: rc.key,
      label: rc.label,
      points: roundBreakdown[rc.key] ?? null,
    }))
    .filter(entry => entry.points !== null) as {
    key: string;
    label: string;
    points: number;
  }[];

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

      {/* Round breakdown */}
      {roundEntries.length > 0 && (
        <View style={styles.breakdown}>
          {roundEntries.map(({key, label, points}) => (
            <View key={key} style={styles.roundChip}>
              <Text style={styles.roundLabel}>{label}</Text>
              <Text style={styles.roundPoints}>{points}</Text>
            </View>
          ))}
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
