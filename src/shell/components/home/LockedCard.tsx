import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {colors, spacing, typography} from '@shared/theme';

interface LockedCardProps {
  currentWeek: number;
}

/**
 * Shown when weekState === 'locked'.
 * Picks are in, games haven't started yet — waiting state.
 */
export function LockedCard({currentWeek}: LockedCardProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>WEEK {currentWeek}</Text>
      <Text style={styles.headline}>Picks locked in</Text>
      <Text style={styles.body}>
        Your picks are set. Games kick off soon.
      </Text>
    </View>
  );
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
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
