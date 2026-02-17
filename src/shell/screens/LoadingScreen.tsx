/**
 * Loading screen — shown during initial auth check on app launch.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import theme from '../../shared/theme';
import { strings } from '../../shared/i18n';

export function LoadingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{strings.app.name}</Text>
      <Text style={styles.tagline}>{strings.app.tagline}</Text>
      <ActivityIndicator
        size="large"
        color={theme.colors.primary}
        style={styles.spinner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: theme.typography.size.title,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  tagline: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
  },
  spinner: {
    marginTop: theme.spacing.lg,
  },
});
