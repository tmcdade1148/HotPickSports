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
import {buildWeekRecap} from './weekRecap';

export function SettlingHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const weekResult         = useNFLStore(s => s.weekResult);
  const currentPhase       = useNFLStore(s => s.currentPhase);
  const currentWeek        = useNFLStore(s => s.currentWeek);
  const pathBackNarrative  = useNFLStore(s => s.pathBackNarrative);

  const greeting = getContextGreeting(currentPhase, 'settling', 0, null);
  const points = weekResult?.weekPoints ?? 0;
  const isPositive = points >= 0;

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        {greeting}
      </Text>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textTertiary}]}>
        YOUR WEEK {currentWeek} RESULT
      </Text>

      <View style={[styles.resultCard, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
        <View style={styles.resultRow}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={[
              displayType.display,
              monoType.regular,
              {
                flexShrink: 1,
                fontSize: displayType.size.display2,
                color: isPositive ? colors.success : colors.error,
                lineHeight: displayType.size.display2,
              },
            ]}>
            {isPositive ? '+' : ''}{points}
          </Text>
          <Text style={[displayType.display, styles.ptsLabel, {color: colors.textSecondary}]}>
            pts
          </Text>
        </View>

        {weekResult && (
          <Text style={[bodyType.regular, styles.detail, {color: colors.textSecondary}]}>
            {buildWeekRecap(weekResult)}
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
  salutation:  {fontSize: 26},
  // Matches the "YOUR CONTESTS" section title (fontSize 11 / letterSpacing 1.8
  // / textTertiary) so the result title reads as a section header.
  eyebrow:     {fontSize: 11, letterSpacing: 1.8},
  resultCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg + 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resultRow:   {flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm},
  ptsLabel:    {fontSize: 24},
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
