import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme} from '@shell/theme';

interface BroadcastComposerProps {
  poolId: string;
  competition: string;
}

/**
 * BroadcastComposer — Message everyone in the pool.
 * 160-character limit. Rate limited to 3 broadcasts per day per pool.
 *
 * Future: composes message, calls check_notification_rate_limit() before
 * sending, delivers as push notification + pinned SmackTalk message.
 */
export function BroadcastComposer({poolId, competition}: BroadcastComposerProps) {
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
      <Text style={styles.title}>Message Everyone</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Broadcast composer coming soon.
        </Text>
      </View>
    </View>
  );
}
