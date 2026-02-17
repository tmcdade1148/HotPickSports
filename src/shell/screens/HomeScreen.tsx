/**
 * Home screen — the main authenticated experience.
 * Renders sport-contextual tabs based on the active event's tab config.
 *
 * Blueprint reference: Section 2.2 (Sport-contextual tabs)
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGlobalStore } from '../stores/globalStore';
import { getEvent, getSportForEvent } from '../../shared/types/sport-registry';
import { SportSwitcher } from '../components/SportSwitcher';
import theme from '../../shared/theme';

export function HomeScreen() {
  const activeEventKey = useGlobalStore(s => s.activeEventKey);
  const profile = useGlobalStore(s => s.profile);

  const event = getEvent(activeEventKey);
  const sport = getSportForEvent(activeEventKey);

  return (
    <View style={styles.container}>
      <SportSwitcher />

      <View style={styles.header}>
        <Text style={styles.greeting}>
          {profile ? `Hey ${profile.full_name.split(' ')[0]}` : 'Welcome'}
        </Text>
        <Text style={styles.eventLabel}>
          {event?.label ?? 'No active event'}
        </Text>
      </View>

      {/* Tab content area — placeholder for sport-specific tab navigator */}
      <View style={styles.tabArea}>
        {event?.tabs.map(tab => (
          <View key={tab.key} style={styles.tabPlaceholder}>
            <Text style={styles.tabPlaceholderText}>{tab.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Sport: {sport?.name ?? 'Unknown'} ({sport?.template} template)
        </Text>
        <Text style={styles.infoText}>
          Event: {event?.eventKey ?? 'none'} — {event?.status ?? 'unknown'}
        </Text>
        <Text style={styles.infoText}>
          Tabs configured: {event?.tabs.length ?? 0}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  greeting: {
    fontSize: theme.typography.size.xxl,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  eventLabel: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  tabArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  tabPlaceholder: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  tabPlaceholderText: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  infoBox: {
    margin: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  infoText: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xs,
  },
});
