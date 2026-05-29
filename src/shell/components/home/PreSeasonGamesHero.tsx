// src/shell/components/home/PreSeasonGamesHero.tsx
// Pre-season home variant per the OffseasonPreseasonHome spec
// (May 29, 2026). Practice picks are live; the action stack
// (Create / Make picks / Join) is the dominant element. The
// countdown is demoted to a one-line calendar marker. All
// sport-specific copy reads from activeSport.sportIdentity.
//
// The action stack itself lives in HomeScreen alongside the
// cross-Contest strip and Clubs teaser so this hero owns only the
// status eyebrow + headline + sub block.
//
// Note on preseason picks: per Tom (May 2026) preseason picks /
// scores are NOT persisted to the season totals — they reset for
// the regular season. The "Make your picks" route works because
// picks are user-level (Hard Rule #2) and the SeasonPicksScreen
// renders games independently of a selected pool. Ephemeral-save
// behavior is a separate follow-up spec.

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing} from '@shared/theme';
import {useCountdown} from './useCountdown';

export function PreSeasonGamesHero() {
  const {colors} = useTheme();

  const picksOpenAt    = useNFLStore(s => s.picksOpenAt);
  const seasonOpenerAt = useNFLStore(s => s.seasonOpenerAt);
  const activeSport    = useGlobalStore(s => s.activeSport);
  const identity       = activeSport?.sportIdentity;

  const headline = identity?.preseasonHeadline       ?? "THE FIELD'S OPEN.";
  const heroSub  = identity?.preseasonHeroSub        ?? 'Practice picks all month. Scores reset for the regular season.';

  const target = picksOpenAt ?? seasonOpenerAt;
  const {days} = useCountdown(target);

  return (
    <View style={styles.wrap}>
      {/* Status eyebrow — small green dot + 'PRACTICE PICKS ARE LIVE'.
          Static indicator, not animated (compliance §7). */}
      <View style={styles.eyebrowRow}>
        <View style={[styles.statusDot, {backgroundColor: colors.success}]} />
        <Text style={[bodyType.bold, styles.eyebrowLabel, {color: colors.success}]}>
          PRACTICE PICKS ARE LIVE
        </Text>
      </View>

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
    </View>
  );
}

// Export the days counter for the HomeScreen's demoted countdown row.
export function usePreseasonDays(): string {
  const picksOpenAt    = useNFLStore(s => s.picksOpenAt);
  const seasonOpenerAt = useNFLStore(s => s.seasonOpenerAt);
  const target = picksOpenAt ?? seasonOpenerAt;
  const {days} = useCountdown(target);
  return days;
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 0,
    gap: spacing.xs,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eyebrowLabel: {
    fontSize: 11,
    letterSpacing: 1.8,
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
  },
});
