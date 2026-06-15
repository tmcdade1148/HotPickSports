// One-line broadcast preview shown inline on Home pills (per Tom, 2026-06-15).
//
// Sender-routed messaging surfaces the latest message text where it belongs:
//   • Gaffer / Assistant Gaffer broadcasts → on the relevant Contest pill
//   • Partner / Club broadcasts → on the Partners pill + affiliated Contest pills
//   • Super-admin broadcasts → the top-of-Home banner (HomeInbox), not here
//
// Always HotPick-themed (Hard Rule #9 / #25) — even on partner-affiliated
// Contest cards, message chrome stays neutral; identity comes from the label.

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Megaphone} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {hexToRgba} from '@shared/utils/color';

interface BroadcastPreviewProps {
  /** Short label naming the sender, e.g. "From the Gaffer" or the Club name. */
  label: string;
  /** The broadcast message text (truncated to two lines). */
  message: string;
  /** Whether this preview represents an unread message (drives emphasis). */
  unread?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function BroadcastPreview({
  label,
  message,
  unread = false,
  onPress,
  accessibilityLabel,
}: BroadcastPreviewProps) {
  const {colors} = useTheme();
  const accent = unread ? colors.primary : colors.textTertiary;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({pressed}) => [
        styles.row,
        {
          backgroundColor: unread
            ? hexToRgba(colors.primary, 0.08)
            : 'transparent',
          borderColor: unread ? hexToRgba(colors.primary, 0.35) : colors.border,
          opacity: pressed && onPress ? 0.7 : 1,
        },
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? `${label}: ${message}`}>
      <Megaphone size={13} color={accent} strokeWidth={2} />
      <View style={styles.body}>
        <Text
          style={[bodyType.bold, styles.label, {color: accent}]}
          numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[bodyType.regular, styles.message, {color: colors.textSecondary}]}
          numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
  body: {flex: 1, minWidth: 0},
  label: {fontSize: 11, letterSpacing: 0.3, textTransform: 'uppercase'},
  message: {fontSize: 12, marginTop: 1},
});
