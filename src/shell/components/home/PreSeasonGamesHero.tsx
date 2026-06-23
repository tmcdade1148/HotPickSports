// src/shell/components/home/PreSeasonGamesHero.tsx
// Pre-season home variant per the OffseasonPreseasonHome spec
// (May 29, 2026). The kickoff countdown carries over from the off-season hero
// (shared KickoffCountdown) so it stays prominent through pre-season. The
// action stack + the "Week 1 picks open …" line live in HomeScreen. All
// sport-specific copy reads from activeSport.sportIdentity.
//
// Note on preseason picks: per Tom (May 2026) preseason picks / scores are NOT
// persisted to the season totals — they reset for the regular season.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing} from '@shared/theme';
import {KickoffCountdown} from './KickoffCountdown';

export function PreSeasonGamesHero() {
  const {colors} = useTheme();

  const activeSport = useGlobalStore(s => s.activeSport);
  const identity    = activeSport?.sportIdentity;

  const headline = identity?.preseasonHeadline ?? "THE FIELD'S OPEN.";
  const heroSub  = identity?.preseasonHeroSub  ?? 'Practice picks all month. Scores reset for the regular season.';

  return (
    <View style={styles.wrap}>
      {/* Status eyebrow — small green dot + nudge toward the regular season.
          Static indicator, not animated (compliance §7). */}
      <View style={styles.eyebrowRow}>
        <View style={[styles.statusDot, {backgroundColor: colors.success}]} />
        <Text style={[bodyType.bold, styles.eyebrowLabel, {color: colors.success}]}>
          Closing in on the regular season.
        </Text>
      </View>

      <Text style={[displayType.display, styles.headline, {color: colors.textPrimary}]}>
        {headline}
      </Text>
      <Text style={[bodyType.regular, styles.heroSub, {color: colors.textSecondary}]}>
        {heroSub}
      </Text>

      {/* Kickoff countdown carried over from the off-season hero. */}
      <KickoffCountdown />
    </View>
  );
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
    flex: 1,
    fontSize: 11,
    letterSpacing: 0.3,
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
    marginBottom: spacing.sm,
  },
});
