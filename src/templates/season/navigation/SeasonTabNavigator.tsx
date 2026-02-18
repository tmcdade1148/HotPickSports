import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {SeasonConfig} from '@shared/types/templates';
import {colors, spacing} from '@shared/theme';

interface SeasonTabNavigatorProps {
  config: SeasonConfig;
}

/**
 * SeasonTabNavigator — Placeholder for weekly-picks template.
 * Will be built out for NFL, EPL, College FB, etc.
 */
export function SeasonTabNavigator({config}: SeasonTabNavigatorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{config.name}</Text>
      <Text style={styles.subtitle}>Season template — coming soon</Text>
      <Text style={styles.detail}>
        {config.totalWeeks} weeks • {config.possibleOutcomes.join(', ')}{' '}
        outcomes
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
