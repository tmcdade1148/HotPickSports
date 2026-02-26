import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme} from '@shell/theme';

interface SmackTalkModeratorProps {
  poolId: string;
  competition: string;
}

/**
 * SmackTalkModerator — SmackTalk with moderation overlay for organizers.
 *
 * Future: renders SmackTalkScreen with additional organizer controls:
 * - Long-press "Remove" on any message (soft-delete)
 * - Flagged message indicators
 * - Message audit trail
 */
export function SmackTalkModerator({poolId, competition}: SmackTalkModeratorProps) {
  const {colors, spacing, borderRadius} = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          padding: spacing.lg,
        },
        title: {
          fontSize: 24,
          fontWeight: '700',
          color: colors.text,
          marginBottom: spacing.md,
        },
        placeholder: {
          backgroundColor: colors.surface,
          borderRadius: borderRadius.lg,
          padding: spacing.xl,
          alignItems: 'center',
        },
        placeholderText: {
          fontSize: 14,
          color: colors.textSecondary,
        },
      }),
    [colors, spacing, borderRadius],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SmackTalk Moderation</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Moderation tools coming soon.
        </Text>
      </View>
    </View>
  );
}
