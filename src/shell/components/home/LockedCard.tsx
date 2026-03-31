import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, typography} from '@shared/theme';
import {useTheme} from '@shell/theme';

interface LockedCardProps {
  currentWeek: number;
}

/**
 * Shown when weekState === 'locked'.
 * Picks are in, games haven't started yet — waiting state.
 */
export function LockedCard({currentWeek}: LockedCardProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.container}>
      <Text style={styles.headline}>Picks locked in</Text>
      <Text style={styles.body}>
        Your picks are set. Games kick off soon.
      </Text>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  label: {
    ...typography.small,
    color: colors.highlight,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  headline: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
