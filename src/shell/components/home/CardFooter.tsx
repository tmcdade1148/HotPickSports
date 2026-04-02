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
  /** Render the secondary label at a larger, bolder size — for celebration states */
  secondaryLarge?: boolean;
  /** Use dark text on the button (e.g. for yellow/warning background) */
  darkText?: boolean;
  /** Grey out and disable the button — picks can no longer be changed */
  disabled?: boolean;
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
  darkText,
  secondaryLabel,
  secondaryColor,
  secondaryLarge,
  disabled,
}: CardFooterProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const resolvedAccent = accentColor ?? colors.primary;
  const resolvedSecondary = secondaryColor ?? '#1b9a06';
  return (
    <View style={styles.container}>
      {secondaryLabel && (
        <Text style={[
          secondaryLarge ? styles.secondaryLabelLarge : styles.secondaryLabel,
          {color: resolvedSecondary},
        ]}>
          {secondaryLabel}
        </Text>
      )}
      <TouchableOpacity
        style={[styles.button, {backgroundColor: resolvedAccent}, disabled && styles.buttonDisabled]}
        activeOpacity={0.8}
        onPress={onPress}
        disabled={disabled}>
        <Text style={[styles.buttonText, darkText && {color: '#1A1A1A'}]}>{label}</Text>
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
  secondaryLabelLarge: {
    fontSize: 20,
    fontWeight: '800',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },
  button: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
