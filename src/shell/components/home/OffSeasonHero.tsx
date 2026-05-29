// src/shell/components/home/OffSeasonHero.tsx
// Off-season home variant per the OffseasonPreseasonHome spec
// (May 29, 2026). Regular-season picks are not yet open; this is
// the long preparation window where new users sign up and Gaffers
// set up Contests. The countdown is the visual hero — a single
// big number with a small sub-line that switches to
// hours/minutes only when ≤ 14 days remain.
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

const HOURS_MINS_THRESHOLD_DAYS = 14;

export function OffSeasonHero() {
  const {colors} = useTheme();

  const picksOpenAt    = useNFLStore(s => s.picksOpenAt);
  const seasonOpenerAt = useNFLStore(s => s.seasonOpenerAt);
  const activeSport    = useGlobalStore(s => s.activeSport);
  const identity       = activeSport?.sportIdentity;

  const headline = identity?.offseasonHeadline       ?? 'THE SEASON IS ON ITS WAY BACK.';
  const heroSub  = identity?.offseasonHeroSub        ?? 'Plenty of time to set up your Contest and get everyone in before kickoff.';
  const cdLabel  = identity?.offseasonCountdownLabel ?? 'DAYS UNTIL PICKS OPEN';

  const target = picksOpenAt ?? seasonOpenerAt;
  const {days, hours, minutes} = useCountdown(target);
  const daysNum = parseInt(days, 10);
  // Compliance rule (spec §6): days-only above 14 days, add
  // hours+minutes at 14 or fewer. No urgency styling. The countdown
  // is a calendar marker, not a betting timer.
  const showHoursMinutes = Number.isFinite(daysNum) && daysNum <= HOURS_MINS_THRESHOLD_DAYS;

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

      {/* Countdown — single big number anchored center; days-only
          by default, hours/minutes appear inside the final two
          weeks. Number is plain text, no animation. */}
      <View style={styles.countdownBlock}>
        <Text
          style={[
            displayType.display,
            monoType.regular,
            styles.bigNumber,
            {color: colors.textPrimary},
          ]}>
          {days}
        </Text>
        <Text style={[bodyType.bold, styles.countdownLabel, {color: colors.primary}]}>
          {cdLabel}
        </Text>
        {showHoursMinutes && (
          <Text style={[bodyType.regular, styles.countdownSub, {color: colors.textSecondary}]}>
            {hours} hours, {minutes} minutes to go
          </Text>
        )}
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
