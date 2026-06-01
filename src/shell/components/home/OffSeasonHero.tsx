// src/shell/components/home/OffSeasonHero.tsx
// Off-season home variant per the OffseasonPreseasonHome spec
// (May 29, 2026). Regular-season picks are not yet open; this is
// the long preparation window where new users sign up and Gaffers
// set up Contests. The countdown is the visual hero — a single big number
// showing the largest meaningful unit (days → hours inside the last day →
// minutes inside the last hour), per the app-wide single-unit rule.
//
// All sport-specific copy reads from activeSport.sportIdentity so
// "FOOTBALL'S ON ITS WAY BACK." becomes "HOCKEY'S ON ITS WAY BACK."
// etc. when new sports ship. No hardcoded strings here.
//
// Below the hero, the spec layout calls for: Create button (primary
// solid orange), Join button (neutral outline), the cross-Contest
// strip, then the Clubs teaser. The Create / Join buttons live in
// HomeScreen alongside the strip + teaser so this component owns
// only the hero block.

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, monoType, spacing} from '@shared/theme';
import {useCountdown} from './useCountdown';

export function OffSeasonHero() {
  const {colors} = useTheme();

  const picksOpenAt    = useNFLStore(s => s.picksOpenAt);
  const seasonOpenerAt = useNFLStore(s => s.seasonOpenerAt);
  const activeSport    = useGlobalStore(s => s.activeSport);
  const identity       = activeSport?.sportIdentity;

  const headline = identity?.offseasonHeadline       ?? 'THE SEASON IS ON ITS WAY BACK.';
  const heroSub  = identity?.offseasonHeroSub        ?? 'Plenty of time to set up your Contest and get everyone in before kickoff.';

  // Off-season target = regular-season kickoff (seasonOpenerAt /
  // 'season_opener_date'). Single-unit rule: big number = the largest
  // meaningful unit (days, then hours inside the last day, then minutes).
  const target = seasonOpenerAt ?? picksOpenAt;
  const {unitValue, unit} = useCountdown(target);

  // The config label normally reads "DAYS UNTIL …"; swap its leading unit word
  // so it matches the unit being shown (e.g. "HOURS UNTIL …" inside the last
  // day). No-op when it's days, or when the label doesn't start with a unit.
  const unitWord = unit === 'day' ? 'DAYS' : unit === 'hour' ? 'HOURS' : 'MINUTES';
  const cdLabel = (identity?.offseasonCountdownLabel ?? 'DAYS UNTIL KICKOFF')
    .replace(/^(DAYS|HOURS|MINUTES)\b/i, unitWord);

  return (
    <View style={styles.wrap}>
      <Text
        style={[
          displayType.display,
          styles.headline,
          {color: colors.textPrimary},
        ]}>
        {headline}
      </Text>
      <Text style={[bodyType.regular, styles.heroSub, {color: colors.textSecondary}]}>
        {heroSub}
      </Text>

      {/* Countdown — single big number anchored center, showing the largest
          meaningful unit (days → hours → minutes). Plain text, no animation. */}
      <View style={styles.countdownBlock}>
        <Text
          style={[
            displayType.display,
            monoType.regular,
            styles.bigNumber,
            {color: colors.textPrimary},
          ]}>
          {unitValue}
        </Text>
        <Text style={[bodyType.bold, styles.countdownLabel, {color: colors.primary}]}>
          {cdLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 0,
    gap: spacing.sm,
  },
  headline: {
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  countdownBlock: {
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  bigNumber: {
    fontSize: 96,
    lineHeight: 100,
    letterSpacing: -2,
  },
  countdownLabel: {
    fontSize: 11,
    letterSpacing: 1.8,
    marginTop: spacing.xs,
  },
  countdownSub: {
    fontSize: 13,
    marginTop: 2,
  },
});
