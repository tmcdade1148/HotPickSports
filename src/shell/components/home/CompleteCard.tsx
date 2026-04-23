import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, typography} from '@shared/theme';
import {useTheme} from '@shell/theme';

interface CompleteCardProps {
  currentWeek: number;
  weekPoints: number;
  correctPicks: number;
  totalPicks: number;
  hotPickCorrect: boolean | null;
  hotpickRank: number | null;
}

/**
 * Shown when weekState === 'complete'.
 * Displays a user-level observation about their week performance.
 * Pool-independent — no pool name or pool rank shown.
 */
export function CompleteCard({
  currentWeek,
  weekPoints,
  correctPicks,
  totalPicks,
  hotPickCorrect,
  hotpickRank,
}: CompleteCardProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);

  const observation = getObservation(weekPoints, correctPicks, totalPicks, hotPickCorrect, hotpickRank);

  return (
    <View style={styles.container}>
      <Text style={styles.headline}>Week scored</Text>
      <Text style={styles.pointsLine}>
        {weekPoints > 0 ? '+' : ''}{weekPoints} pts
      </Text>
      <Text style={styles.accuracyLine}>
        {correctPicks} of {totalPicks} correct
      </Text>
      <Text style={styles.observation}>{observation}</Text>
    </View>
  );
}

/**
 * Deterministic observation templates — first matching rule wins.
 * No AI, no pool references. Pure user-level performance narrative.
 */
function getObservation(
  weekPoints: number,
  correctPicks: number,
  totalPicks: number,
  hotPickCorrect: boolean | null,
  hotpickRank: number | null,
): string {
  const rank = hotpickRank ?? 0;

  // Perfect week + HotPick
  if (correctPicks === totalPicks && hotPickCorrect) {
    return `Perfect week. ${totalPicks} for ${totalPicks} plus the HotPick. Flawless.`;
  }

  // Perfect picks but HotPick missed
  if (correctPicks === totalPicks && hotPickCorrect === false) {
    return `${correctPicks} for ${totalPicks} on picks but the HotPick didn't land. So close.`;
  }

  // High-rank HotPick win
  if (hotPickCorrect && rank >= 12) {
    return `Rank ${rank} HotPick landed. +${rank} pts. Nicely called.`;
  }

  // Standard HotPick win
  if (hotPickCorrect && rank > 0) {
    return `HotPick landed. +${rank} added to the total.`;
  }

  // High-rank HotPick loss
  if (hotPickCorrect === false && rank >= 12) {
    return `Rank ${rank} HotPick didn\u2019t land. \u2212${rank} pts. Next week.`;
  }

  // Standard HotPick loss
  if (hotPickCorrect === false && rank > 0) {
    return `HotPick missed. -${rank} pts. Shake it off.`;
  }

  // Big week
  if (weekPoints > 15) {
    return `Big week. +${weekPoints} pts. The leaderboard noticed.`;
  }

  // Positive week
  if (weekPoints > 0) {
    return `+${weekPoints} pts this week. Building momentum.`;
  }

  // Break even
  if (weekPoints === 0) {
    return `Broke even. Wins cancelled the HotPick loss. Reset.`;
  }

  // Tough week
  return `Tough week. ${weekPoints} pts. Long season ahead.`;
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  headline: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  pointsLine: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  accuracyLine: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  observation: {
    fontSize: 20,
    fontWeight: '700',
    fontStyle: 'italic',
    color: colors.highlight,
    lineHeight: 28,
    letterSpacing: 0.3,
  },
});
