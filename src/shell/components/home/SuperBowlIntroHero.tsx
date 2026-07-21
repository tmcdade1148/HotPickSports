// src/shell/components/home/SuperBowlIntroHero.tsx
// Spec §6.4.3 — superbowl_intro_bridge row.
//
// Phase: SUPERBOWL_INTRO — the two-week gap between conference championships
// and the Super Bowl. Matchup teaser + countdown to picks_open.
// CTA: "See your playoff run."

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {useCountdown} from './useCountdown';

// The greeting line is gone — the contextual line is now a single producer
// (ContextualLine) rendered once above the hero by HomeScreen.
//
// Reused as the placeholder PLAYOFF BRIDGE (map row 'playoff_bridge', the
// PLAYOFFS/SUPERBOWL pre-picks gap): the eyebrow + headline are props so
// StateHero can feed playoff copy. Defaults keep the SUPERBOWL_INTRO usage
// byte-identical. This is a resting bridge — it counts down to picksOpenAt (NOT
// the off-season kickoff date) and its CTA is "See your playoff run".
export function SuperBowlIntroHero({
  eyebrow = 'SUPER BOWL WEEK',
  headline = 'ONE GAME. EVERYTHING.',
}: {eyebrow?: string; headline?: string} = {}) {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const picksOpenAt  = useNFLStore(s => s.picksOpenAt);
  const {unitValue, unit, isExpired} = useCountdown(picksOpenAt);
  const unitWord = unit === 'day' ? 'days' : unit === 'hour' ? 'hours' : 'min';

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.primary}]}>
        {eyebrow}
      </Text>

      <Text
        style={[
          displayType.display,
          {fontSize: displayType.size.h2, color: colors.textPrimary},
        ]}>
        {headline}
      </Text>

      {!isExpired && (
        <View style={[styles.countdownCard, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
          <Text style={[bodyType.bold, styles.countdownLabel, {color: colors.textSecondary}]}>
            PICKS OPEN IN
          </Text>
          <View style={styles.countdownRow}>
            <Text style={[displayType.display, monoType.regular, styles.countNum, {color: colors.textPrimary}]}>
              {unitValue}
            </Text>
            <Text style={[bodyType.bold, styles.countSep, {color: colors.textTertiary}]}>{unitWord}</Text>
          </View>
        </View>
      )}

      <Pressable
        onPress={() => navigation.navigate('LeaderboardTab')}
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
