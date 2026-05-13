// src/shell/components/home/CompleteHero.tsx
// Spec §6.4.3 — complete row.
//
// Eyebrow: "WEEK [N] COMPLETE."
// Hero: weekly result + season standing context ("You sit Xth in [pool name]").
// Secondary CTA: "View leaderboard."

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {getContextGreeting} from './salutation';

const ORDINAL = (n: number): string => {
  if (n >= 11 && n <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:  return `${n}st`;
    case 2:  return `${n}nd`;
    case 3:  return `${n}rd`;
    default: return `${n}th`;
  }
};

export function CompleteHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const weekResult   = useNFLStore(s => s.weekResult);
  const currentWeek  = useNFLStore(s => s.currentWeek);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const visiblePools = useGlobalStore(s => s.visiblePools);
  const activePool   = visiblePools.find(p => p.id === activePoolId);

  const greeting = getContextGreeting(currentPhase, 'complete', 0, null);
  const points   = weekResult?.weekPoints ?? 0;
  const newRank  = weekResult?.newRank;
  const poolName = activePool?.name ?? 'your pool';

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        {greeting}
      </Text>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textPrimary}]}>
        WEEK {currentWeek} COMPLETE
      </Text>

      <View style={[styles.resultCard, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
        <View style={styles.resultRow}>
          <Text
            style={[
              displayType.display,
              monoType.regular,
              {
                fontSize: displayType.size.display2,
                color: points >= 0 ? colors.success : colors.error,
                lineHeight: displayType.size.display2 * 0.9,
              },
            ]}>
            {points >= 0 ? '+' : ''}{points}
          </Text>
          <Text style={[displayType.display, styles.ptsLabel, {color: colors.textSecondary}]}>
            pts
          </Text>
        </View>

        {typeof newRank === 'number' && (
          <Text style={[bodyType.regular, styles.standingText, {color: colors.textPrimary}]}>
            You sit <Text style={{fontWeight: '700'}}>{ORDINAL(newRank)}</Text> in {poolName}.
          </Text>
        )}

        {weekResult?.rankDelta != null && weekResult.rankDelta !== 0 && (
          <Text
            style={[
              monoType.regular,
              styles.delta,
              {color: weekResult.rankDelta > 0 ? colors.success : colors.error},
            ]}>
            {weekResult.rankDelta > 0 ? '↑' : '↓'} {Math.abs(weekResult.rankDelta)} from last week
          </Text>
        )}
      </View>

      <Pressable
        onPress={() => navigation.navigate('Leaders')}
        style={({pressed}) => [
          styles.cta,
          {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel="View the leaderboard">
        <Text style={[bodyType.bold, styles.ctaText, {color: colors.textPrimary}]}>
          View leaderboard
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:         {paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md},
  salutation:   {fontSize: 13},
  eyebrow:      {fontSize: 11, letterSpacing: 2},
  resultCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg + 4,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  resultRow:    {flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm},
  ptsLabel:     {fontSize: 22, paddingBottom: 10},
  standingText: {fontSize: 14, lineHeight: 20},
  delta:        {fontSize: 12, letterSpacing: 0.5},
  cta: {
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  ctaText: {fontSize: 14, letterSpacing: 0.5},
});
