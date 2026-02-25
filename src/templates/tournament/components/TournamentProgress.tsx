import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {TournamentConfig} from '@shared/types/templates';
import {colors, spacing, borderRadius} from '@shared/theme';
import {useTournamentStore} from '../stores/tournamentStore';

interface TournamentProgressProps {
  config: TournamentConfig;
  userId: string;
}

/**
 * TournamentProgress — Points/progress summary bar.
 * Shows max available points from config, current earned points from store.
 */
export function TournamentProgress({config, userId}: TournamentProgressProps) {
  const score = useTournamentStore(s => s.getUserScore(userId));

  const groupPoints = score?.group_stage_points ?? 0;
  const knockoutPoints = score?.knockout_points ?? 0;
  const currentPoints = score?.total_points ?? 0;
  const progress =
    config.maxTotalPoints > 0 ? currentPoints / config.maxTotalPoints : 0;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>{config.shortName} Progress</Text>
        <Text style={styles.points}>
          {currentPoints} / {config.maxTotalPoints} pts
        </Text>
      </View>
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            {width: `${progress * 100}%`, backgroundColor: config.color},
          ]}
        />
      </View>
      <View style={styles.breakdown}>
        <Text style={styles.breakdownText}>
          Groups: {groupPoints} / {config.maxGroupPoints} pts
        </Text>
        <Text style={styles.breakdownText}>
          Knockout: {knockoutPoints} /{' '}
          {config.maxTotalPoints - config.maxGroupPoints} pts
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    margin: spacing.md,
    borderRadius: borderRadius.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  points: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  breakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
