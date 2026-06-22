// ContestActionPill — the regular-season Home "Join / Create a Contest" pill,
// extracted so the same affordance is used everywhere (per Tom, 2026-06-15):
// icon + bold label + italic sublabel, accent-outline chrome. Pairs side-by-side
// in a row (each flexes) or stands alone full-width.
//
// HotPick-themed via useTheme (Hard Rule #9).

import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing} from '@shared/theme';
import {hexToRgba} from '@shared/utils/color';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

interface ContestActionPillProps {
  Icon: React.ComponentType<IconProps>;
  label: string;
  sublabel?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Shows a spinner in place of the icon and blocks taps. */
  busy?: boolean;
  /**
   * Overrides the pill's fill. Used by the Home footer, which sits over a
   * clear (transparent) bar — passing a translucent theme color here makes
   * each pill a frosted panel with the page visible through/around it.
   * Defaults to the subtle accent tint used everywhere else.
   */
  fillColor?: string;
}

export function ContestActionPill({
  Icon,
  label,
  sublabel,
  onPress,
  accessibilityLabel,
  busy = false,
  fillColor,
}: ContestActionPillProps) {
  const {colors} = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({pressed}) => [
        styles.btn,
        {
          backgroundColor: fillColor ?? hexToRgba(colors.ctaAccentOutline, 0.08),
          borderColor: colors.ctaAccentOutline,
          opacity: pressed || busy ? 0.7 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}>
      {busy ? (
        <ActivityIndicator size="small" color={colors.ctaAccentOutline} />
      ) : (
        <Icon size={18} color={colors.ctaAccentOutline} strokeWidth={2.25} />
      )}
      <View style={styles.label}>
        <Text style={[bodyType.bold, styles.primary, {color: colors.ctaAccentText}]}>
          {label}
        </Text>
        {!!sublabel && (
          <Text style={[bodyType.regular, styles.secondary, {color: colors.textSecondary}]}>
            {sublabel}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// Shared row container for a pair of pills (or a single full-width one).
export const contestActionPillStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: spacing.lg,
    marginTop: 4,
  },
});

const styles = StyleSheet.create({
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'solid',
  },
  label: {flexShrink: 1, minWidth: 0},
  primary: {fontSize: 14, lineHeight: 17},
  secondary: {fontSize: 11, fontStyle: 'italic', marginTop: 1},
});
