// src/shell/components/home/PreSeasonGamesHero.tsx
// Pre-season home variant per the OffseasonPreseasonHome spec (May 29, 2026),
// updated for Slice 7c. The kickoff countdown carries over from the off-season
// hero (shared KickoffCountdown) so it stays prominent through pre-season. The
// demo button, the docked Join/Start footer, and the "Week 1 picks open …" line
// all live in HomeScreen. All sport-specific copy reads from
// activeSport.sportIdentity.
//
// Note on preseason picks: PRE_SEASON is an idle bridge — NO picks are possible
// in the phase (admin_advance_season_phase forces week_state='idle',
// picks_open=false; CLAUDE.md Hard Rule #22). The August preseason GAMEPLAY is a
// separate competition (nfl_2026_pre) running in REGULAR, not this hero.

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
  const heroSub  = identity?.preseasonHeroSub  ?? 'The regular season is almost here.';

  return (
    <View style={styles.wrap}>
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
