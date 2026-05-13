// src/shell/components/home/PicksLockedHero.tsx
// Spec §6.4.3 — picks_locked row.
//
// Eyebrow: "LOCKED IN."
// Hero: this week's HotPick matchup (teams, rank, kickoff time)
// Confirmation: "On record. No edits."
// Secondary CTA: "View all picks." (no primary CTA per spec)

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {HotPickCinematic} from './HotPickCinematic';
import {getTeamColors} from './teamColors';
import {getContextGreeting} from './salutation';

export function PicksLockedHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const userHotPick     = useNFLStore(s => s.userHotPick);
  const userHotPickGame = useNFLStore(s => s.userHotPickGame);
  const currentPhase    = useNFLStore(s => s.currentPhase);
  const weekState       = useNFLStore(s => s.weekState);

  const greeting = getContextGreeting(currentPhase, weekState, 1, null);
  const away = userHotPickGame?.away_team ?? '';
  const home = userHotPickGame?.home_team ?? '';
  const awayMeta = getTeamColors(away);
  const homeMeta = getTeamColors(home);

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        {greeting}
      </Text>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.success}]}>
        LOCKED IN
      </Text>

      {userHotPickGame && (
        <HotPickCinematic
          mode="locked"
          awayTeam={away}
          awayCity={awayMeta.city}
          awayColor={awayMeta.primary}
          homeTeam={home}
          homeCity={homeMeta.city}
          homeColor={homeMeta.primary}
          pickedTeam={userHotPick?.picked_team ?? undefined}
          frozenRank={userHotPickGame?.frozen_rank ?? 0}
        />
      )}

      <Text style={[bodyType.regular, styles.confirmation, {color: colors.textSecondary}]}>
        On record. No edits.
      </Text>

      <Pressable
        onPress={() => navigation.navigate('Games')}
        style={({pressed}) => [
          styles.cta,
          {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel="View all your picks">
        <Text style={[bodyType.bold, styles.ctaText, {color: colors.textPrimary}]}>
          View all picks
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:         {paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md},
  salutation:   {fontSize: 13},
  eyebrow:      {fontSize: 11, letterSpacing: 2},
  confirmation: {fontSize: 13, fontStyle: 'italic'},
  cta: {
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  ctaText: {fontSize: 14, letterSpacing: 0.5},
});
