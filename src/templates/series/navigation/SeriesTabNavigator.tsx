import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {SeriesConfig} from '@shared/types/templates';
import {colors, spacing} from '@shared/theme';

interface SeriesTabNavigatorProps {
  config: SeriesConfig;
}

/**
 * SeriesTabNavigator — Placeholder for best-of-N playoff template.
 * Will be built out for NHL, NBA, MLB, etc.
 */
export function SeriesTabNavigator({config}: SeriesTabNavigatorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{config.name}</Text>
      <Text style={styles.subtitle}>Series template — coming soon</Text>
      <Text style={styles.detail}>
        {config.rounds.length} rounds •{' '}
        {config.seriesLengthBonusPoints} bonus pts for correct series length
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  detail: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
