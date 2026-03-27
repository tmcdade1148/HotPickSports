import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {useTheme} from '@shell/theme';

interface CardFooterProps {
  /** Primary CTA button label */
  label: string;
  /** Navigation or action callback */
  onPress: () => void;
  /** Accent color for the button — falls back to primary */
  accentColor?: string;
  /** Optional secondary label shown above the button (e.g. "You're locked in ✓") */
  secondaryLabel?: string;
  /** Color for the secondary label — falls back to success */
  secondaryColor?: string;
}

/**
 * CardFooter — Reusable CTA button for the bottom of Smart Cards.
 *
 * Sits at the bottom of every week-state card with a top border divider.
 * Supports a primary CTA button and an optional secondary status label.
 * Will be used by picks_open, locked, live, settling, and complete states.
 */
export function CardFooter({
  label,
  onPress,
  accentColor,
  secondaryLabel,
  secondaryColor,
}: CardFooterProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const resolvedAccent = accentColor ?? colors.primary;
  const resolvedSecondary = secondaryColor ?? '#1b9a06';
  return (
    <View style={styles.container}>
      {secondaryLabel && (
        <Text style={[styles.secondaryLabel, {color: resolvedSecondary}]}>
          {secondaryLabel}
        </Text>
      )}
      <TouchableOpacity
        style={[styles.button, {backgroundColor: resolvedAccent}]}
        activeOpacity={0.8}
        onPress={onPress}>
        <Text style={styles.buttonText}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  secondaryLabel: {
    ...typography.caption,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  button: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
