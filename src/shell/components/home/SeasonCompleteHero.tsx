// src/shell/components/home/SeasonCompleteHero.tsx
// Spec §6.4.3 — season_complete row.
//
// Phase: SEASON_COMPLETE (post-Super Bowl). Retrospective only — final
// standings + season stats. No CTAs that drive engagement; users are
// off-cycle and the app's posture is "see you next season."
//
// Reads season_user_totals via seasonStore.getUserScore(uid) and the
// user_hardware-derived stats via globalStore for completeness.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {getContextGreeting} from './salutation';

export function SeasonCompleteHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const userId       = useGlobalStore(s => s.user?.id);
  const userHardware = useGlobalStore(s => s.userHardware);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const seasonTotal  = useSeasonStore(
    s => (userId ? s.getUserScore(userId)?.total_points : undefined) ?? 0,
  );

  const greeting = getContextGreeting(currentPhase, 'idle', 0, null);

  // Awards earned this season (post-launch competition only).
  const seasonAwards = userHardware.filter(h => h.category === 'season').length;

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        {greeting}
      </Text>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textSecondary}]}>
        SEASON COMPLETE
      </Text>

      <View style={[styles.card, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
        <Text style={[bodyType.bold, styles.statLabel, {color: colors.textSecondary}]}>
          YOUR SEASON
        </Text>
        <View style={styles.statRow}>
          <Text
            style={[
              displayType.display,
              monoType.regular,
              {
                fontSize: displayType.size.display2,
                color: colors.textPrimary,
                lineHeight: displayType.size.display2 * 0.9,
              },
            ]}>
            {seasonTotal.toLocaleString()}
          </Text>
          <Text style={[displayType.display, styles.statUnit, {color: colors.textSecondary}]}>
            pts
          </Text>
        </View>

        {seasonAwards > 0 && (
          <Text style={[bodyType.regular, styles.awardsText, {color: colors.textPrimary}]}>
            {seasonAwards} season award{seasonAwards === 1 ? '' : 's'} earned.
          </Text>
        )}
        {seasonAwards === 0 && (
          <Text style={[bodyType.regular, styles.awardsText, {color: colors.textSecondary}]}>
            First season in the books. Career starts now.
          </Text>
        )}

        <Text style={[bodyType.regular, styles.closeText, {color: colors.textSecondary}]}>
          See you next season.
        </Text>
      </View>

      <Pressable
        onPress={() => navigation.navigate('History')}
        style={({pressed}) => [
          styles.cta,
          {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel="See your season story">
        <Text style={[bodyType.bold, styles.ctaText, {color: colors.textPrimary}]}>
          See your season story
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:       {paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md},
  salutation: {fontSize: 13},
  eyebrow:    {fontSize: 11, letterSpacing: 2},
  card: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg + 4,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  statLabel:  {fontSize: 10, letterSpacing: 1.6, marginBottom: 4},
  statRow:    {flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm},
  statUnit:   {fontSize: 22, paddingBottom: 10},
  awardsText: {fontSize: 14, lineHeight: 20, marginTop: spacing.sm},
  closeText:  {fontSize: 13, fontStyle: 'italic', marginTop: spacing.sm},
  cta: {
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  ctaText: {fontSize: 14, letterSpacing: 0.5},
});
