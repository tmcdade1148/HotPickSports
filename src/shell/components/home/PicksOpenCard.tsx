import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {colors, spacing, typography} from '@shared/theme';

interface PicksOpenCardProps {
  deadline: Date | null;
  currentWeek: number;
}

/**
 * Shown when weekState === 'picks_open'.
 * Displays countdown to deadline + social pressure line.
 */
export function PicksOpenCard({deadline, currentWeek}: PicksOpenCardProps) {
  const timeLeft = deadline ? getTimeLeft(deadline) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>WEEK {currentWeek}</Text>
      <Text style={styles.headline}>Picks are open</Text>
      {timeLeft && (
        <View style={styles.countdownRow}>
          <Text style={styles.countdown}>{timeLeft}</Text>
          <Text style={styles.countdownLabel}>until deadline</Text>
        </View>
      )}
      <Text style={styles.social}>Lock in your picks before time runs out</Text>
    </View>
  );
}

function getTimeLeft(deadline: Date): string {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  if (diff <= 0) {
    return 'Deadline passed';
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  label: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  headline: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  countdown: {
    ...typography.h2,
    color: colors.warning,
  },
  countdownLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  social: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});
