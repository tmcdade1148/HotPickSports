// src/shell/components/home/OffSeasonHero.tsx
// Off-season home variant per the OffseasonPreseasonHome spec
// (May 29, 2026). Regular-season picks are not yet open; this is
// the long preparation window where new users sign up and Gaffers
// set up Contests. The visual hero is the shared KickoffCountdown — the
// same big kickoff countdown carries into the pre-season hero too.
//
// All sport-specific copy reads from activeSport.sportIdentity so
// "FOOTBALL'S ON ITS WAY BACK." becomes "HOCKEY'S ON ITS WAY BACK."
// etc. when new sports ship. No hardcoded strings here.
//
// The Create / Join buttons live in HomeScreen alongside the cross-Contest
// strip + Clubs teaser, so this component owns only the hero block.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing} from '@shared/theme';
import {KickoffCountdown} from './KickoffCountdown';

export function OffSeasonHero() {
  const {colors} = useTheme();

  const activeSport = useGlobalStore(s => s.activeSport);
  const identity    = activeSport?.sportIdentity;

  const headline = identity?.offseasonHeadline ?? 'THE SEASON IS ON ITS WAY BACK.';
  const heroSub  = identity?.offseasonHeroSub  ?? 'Plenty of time to set up your Contest and get everyone in before kickoff.';

  return (
    <View style={styles.wrap}>
      <Text style={[displayType.display, styles.headline, {color: colors.textPrimary}]}>
        {headline}
      </Text>
      <Text style={[bodyType.regular, styles.heroSub, {color: colors.textSecondary}]}>
        {heroSub}
      </Text>
      <KickoffCountdown />
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
});
