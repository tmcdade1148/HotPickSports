// src/shell/components/home/SettlingHero.tsx
// Spec §6.4.3 — settling row.
//
// Eyebrow: "SETTLING."
// Hero: this week's HotPick result — won/lost, net points, brief narrative.
// CTA: "View week recap."

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {getContextGreeting} from './salutation';

export function SettlingHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const weekResult         = useNFLStore(s => s.weekResult);
  const currentPhase       = useNFLStore(s => s.currentPhase);
  const pathBackNarrative  = useNFLStore(s => s.pathBackNarrative);

  const greeting = getContextGreeting(currentPhase, 'settling', 0, null);
  const points = weekResult?.weekPoints ?? 0;
  const isPositive = points >= 0;

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        {greeting}
      </Text>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textPrimary}]}>
        SETTLING
      </Text>

      <View style={[styles.resultCard, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
        <Text style={[bodyType.bold, styles.resultLabel, {color: colors.textSecondary}]}>
          This week
        </Text>
        <View style={styles.resultRow}>
          <Text
            style={[
              displayType.display,
              monoType.regular,
              {
                fontSize: displayType.size.display3,
                color: isPositive ? colors.success : colors.error,
                lineHeight: displayType.size.display3 * 0.88,
              },
            ]}>
            {isPositive ? '+' : ''}{points}
          </Text>
          <Text style={[displayType.display, styles.ptsLabel, {color: colors.textSecondary}]}>
            pts
          </Text>
        </View>

        {weekResult?.hotPickCorrect != null && (
          <Text style={[bodyType.regular, styles.detail, {color: colors.textSecondary}]}>
            HotPick {weekResult.hotPickCorrect ? 'hit' : 'missed'}
            {' · '}
            {weekResult.correctPicks}/{weekResult.totalPicks} games
          </Text>
        )}

        {pathBackNarrative ? (
          <Text style={[bodyType.regular, styles.narrative, {color: colors.textPrimary}]}>
            {pathBackNarrative}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => navigation.navigate('PicksTab')}
        style={({pressed}) => [
          styles.cta,
          {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel="View this week's completed picks">
        <Text style={[bodyType.bold, styles.ctaText, {color: colors.textPrimary}]}>
          View week recap
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:        {paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md},
  salutation:  {fontSize: 13},
  eyebrow:     {fontSize: 11, letterSpacing: 2},
  resultCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg + 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resultLabel: {fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm},
  resultRow:   {flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm},
  ptsLabel:    {fontSize: 24, paddingBottom: 12},
  detail:      {fontSize: 13, marginTop: spacing.sm},
  narrative:   {fontSize: 14, marginTop: spacing.sm, lineHeight: 20},
  cta: {
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  ctaText: {fontSize: 14, letterSpacing: 0.5},
});
