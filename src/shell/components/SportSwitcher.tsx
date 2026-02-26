import React, {useMemo} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getEventsByPriority} from '@sports/registry';
import {useTheme} from '@shell/theme';
import type {AnyEventConfig} from '@shared/types/templates';

/**
 * SportSwitcher — Slack-style sport/event switcher.
 * Allows the user to switch between active events (World Cup, NFL, etc.).
 */
export function SportSwitcher() {
  const {colors, spacing, borderRadius} = useTheme();
  const activeSport = useGlobalStore(s => s.activeSport);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);
  const events = getEventsByPriority();

  const handlePress = (event: AnyEventConfig) => {
    setActiveSport(event);
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.sm,
        },
        chip: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          borderRadius: borderRadius.full,
          borderWidth: 2,
          marginRight: spacing.sm,
        },
        chipText: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
        },
        chipTextActive: {
          color: colors.textOnPrimary,
        },
      }),
    [colors, spacing, borderRadius],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      {events.map(event => {
        const isActive = event.competition === activeSport?.competition;
        return (
          <TouchableOpacity
            key={event.competition}
            style={[
              styles.chip,
              {borderColor: event.color},
              isActive && {backgroundColor: event.color},
            ]}
            onPress={() => handlePress(event)}>
            <Text
              style={[styles.chipText, isActive && styles.chipTextActive]}>
              {event.shortName}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
