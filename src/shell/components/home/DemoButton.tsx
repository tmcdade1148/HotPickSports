// DemoButton — the demo entry point, in two weights.
//
// Spec: 260811_HotPick_DemoAccessAndSafety_Spec v1.4 §6.1 / §6.2 / §6.3.
//
//   variant="card" (default) — the full CTA. Shown on the SEVEN rows where no
//   week is running (off_far, off_near, pre_bridge, reg_done, sb_intro,
//   season_done, playoff_bridge). There is no picks call to action on those
//   rows for it to compete with, and the Player has nothing else to do.
//
//   variant="line" — one quiet line, icon + text, no border/card/subtitle.
//   Shown on the FIVE rows where a week IS running, below Contests, so it never
//   competes with the picks CTA. Also used on the Season Picks screen.
//
// ONE component in several places beats several components showing the same
// thing, which is why this is a variant prop and not a second file.
//
// No threshold, no dismissal, no counter. The line is small enough to ignore,
// which is exactly what makes a threshold unnecessary — and the only column
// that could have backed one (career_hotpick_total) is dead (Finding D).
//
// Hard Rule #19 is unaffected: a text line is not an event card.
// HotPick-themed via useTheme (Hard Rule #9).

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {ArrowRight, Play} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {useLaunchDemo} from '@shell/hooks/useLaunchDemo';

export interface DemoButtonProps {
  /** 'card' = full CTA (no week running). 'line' = quiet one-liner. */
  variant?: 'card' | 'line';
  /** Line variant only. Home uses the default; Picks passes "What's a HotPick?". */
  label?: string;
}

export function DemoButton({variant = 'card', label}: DemoButtonProps) {
  const {colors} = useTheme();
  const launchDemo = useLaunchDemo();

  if (variant === 'line') {
    const lineLabel = label ?? 'How HotPick works';
    return (
      <Pressable
        onPress={launchDemo}
        style={({pressed}) => [styles.line, {opacity: pressed ? 0.6 : 1}]}
        accessibilityRole="button"
        accessibilityLabel={`${lineLabel} — play a quick demo week`}>
        <Play size={13} color={colors.primary} strokeWidth={2.25} fill={colors.primary} />
        <Text style={[bodyType.regular, styles.lineLabel, {color: colors.primary}]}>
          {lineLabel}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={launchDemo}
        style={({pressed}) => [
          styles.btn,
          {borderColor: colors.primary, opacity: pressed ? 0.85 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel="Play a quick demo week to see how it works">
        <View style={styles.iconWrap}>
          <Play size={20} color={colors.primary} strokeWidth={2.25} fill={colors.primary} />
        </View>
        <View style={styles.labelWrap}>
          <Text style={[bodyType.bold, styles.title, {color: colors.textPrimary}]}>
            See how it works
          </Text>
          <Text style={[bodyType.regular, styles.subtitle, {color: colors.primary}]}>
            Get an overview of the rules and a quick demo.
          </Text>
        </View>
        <ArrowRight size={18} color={colors.textPrimary} strokeWidth={2.25} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── card variant (unchanged from the original) ──
  wrap: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    gap: spacing.md,
    backgroundColor: 'transparent',
  },
  iconWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: {flex: 1, gap: 1},
  title: {fontSize: 16, letterSpacing: 0.2},
  subtitle: {fontSize: 13, lineHeight: 17},

  // ── line variant: no border, no card, no subtitle ──
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  lineLabel: {fontSize: 13, letterSpacing: 0.2},
});
