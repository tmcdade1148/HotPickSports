import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {TournamentConfig} from '@shared/types/templates';
import {colors, spacing, borderRadius} from '@shared/theme';

interface TournamentProgressProps {
  config: TournamentConfig;
}

/**
 * TournamentProgress — Points/progress summary bar.
 * Shows max available points from config, current earned points.
 */
export function TournamentProgress({config}: TournamentProgressProps) {
  // TODO: Read actual score from store
  const currentPoints = 0;
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
          Groups: {config.maxGroupPoints} pts max
        </Text>
        <Text style={styles.breakdownText}>
          Knockout: {config.maxTotalPoints - config.maxGroupPoints} pts max
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
