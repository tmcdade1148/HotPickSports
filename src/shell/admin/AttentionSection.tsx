import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme} from '@shell/theme';

interface AttentionSectionProps {
  poolId: string;
  competition: string;
}

/**
 * AttentionSection — Time-sensitive items that need organizer action.
 * Displayed as plain cards at the top. Hidden entirely when nothing needs attention.
 *
 * Future: reads from pool_events and member_engagement to surface action items
 * like "8 of 14 members haven't picked yet" or "SmackTalk message flagged."
 */
export function AttentionSection({poolId, competition}: AttentionSectionProps) {
  const {colors, spacing, borderRadius} = useTheme();

  // Placeholder — no attention items surfaced yet.
  // Will query pool_events + member_engagement when wired up.
  const hasItems = false;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          marginBottom: spacing.lg,
        },
        placeholder: {
          backgroundColor: colors.surface,
          borderRadius: borderRadius.lg,
          padding: spacing.md,
          alignItems: 'center',
        },
        placeholderText: {
          fontSize: 14,
          color: colors.textSecondary,
        },
      }),
    [colors, spacing, borderRadius],
  );

  if (!hasItems) {
    return null; // Section hidden when nothing needs attention
  }

  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>No items need attention</Text>
      </View>
    </View>
  );
}
