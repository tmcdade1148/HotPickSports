// src/shell/components/home/SuperBowlIntroHero.tsx
// Spec §6.4.3 — superbowl_intro_bridge row.
//
// Phase: SUPERBOWL_INTRO — the two-week gap between conference championships
// and the Super Bowl. Matchup teaser + countdown to picks_open.
// CTA: "See your playoff run."

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {useCountdown} from './useCountdown';
import {getContextGreeting} from './salutation';

export function SuperBowlIntroHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const picksOpenAt  = useNFLStore(s => s.picksOpenAt);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const {days, hours, minutes, isExpired} = useCountdown(picksOpenAt);
  const greeting = getContextGreeting(currentPhase, 'idle', 0, null);

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        {greeting}
      </Text>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.primary}]}>
        SUPER BOWL WEEK
      </Text>

      <Text
        style={[
          displayType.display,
          {fontSize: displayType.size.h2, color: colors.textPrimary},
        ]}>
        ONE GAME. EVERYTHING.
      </Text>

      {!isExpired && (
        <View style={[styles.countdownCard, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
          <Text style={[bodyType.bold, styles.countdownLabel, {color: colors.textSecondary}]}>
            PICKS OPEN IN
          </Text>
          <View style={styles.countdownRow}>
            <Text style={[displayType.display, monoType.regular, styles.countNum, {color: colors.textPrimary}]}>
              {days}
            </Text>
            <Text style={[bodyType.bold, styles.countSep, {color: colors.textTertiary}]}>d</Text>
            <Text style={[displayType.display, monoType.regular, styles.countNum, {color: colors.textPrimary}]}>
              {hours}
            </Text>
            <Text style={[bodyType.bold, styles.countSep, {color: colors.textTertiary}]}>h</Text>
            <Text style={[displayType.display, monoType.regular, styles.countNum, {color: colors.textPrimary}]}>
              {minutes}
            </Text>
            <Text style={[bodyType.bold, styles.countSep, {color: colors.textTertiary}]}>m</Text>
          </View>
        </View>
      )}

      <Pressable
        onPress={() => navigation.navigate('Leaders')}
        style={({pressed}) => [
          styles.cta,
          {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel="See your playoff run">
        <Text style={[bodyType.bold, styles.ctaText, {color: colors.textPrimary}]}>
          See your playoff run
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:       {paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md},
  salutation: {fontSize: 13},
  eyebrow:    {fontSize: 11, letterSpacing: 2},
  countdownCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  countdownLabel: {fontSize: 10, letterSpacing: 1.6},
  countdownRow:   {flexDirection: 'row', alignItems: 'baseline', gap: 4},
  countNum:       {fontSize: 36, lineHeight: 36},
  countSep:       {fontSize: 12, marginRight: 8},
  cta: {
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  ctaText: {fontSize: 14, letterSpacing: 0.5},
});
