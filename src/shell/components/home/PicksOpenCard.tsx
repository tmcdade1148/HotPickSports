import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {colors, spacing, typography, borderRadius} from '@shared/theme';
import {useCountdown} from '@shared/hooks/useCountdown';
import {CardFooter} from './CardFooter';
import type {DbSeasonGame} from '@shared/types/database';

interface PicksOpenCardProps {
  /** Picks deadline from competition_config */
  deadline: Date | null;
  /** Current NFL week number */
  currentWeek: number;
  /** Top-ranked game this week (highest rank value) */
  highestRankedGame: DbSeasonGame | null;
  /** Whether the current user has submitted at least one pick this week */
  userHasSubmitted: boolean;
  /** Number of pool members who have submitted picks this week */
  poolPicksSubmittedCount: number;
  /** Total active members in the current pool */
  poolMemberCount: number;
  /** Navigate to make/edit picks */
  onMakePicks: () => void;
}

/**
 * PicksOpenCard — Shown when weekState === 'picks_open'.
 *
 * Full spec (top to bottom):
 *   1. Ticking countdown to deadline (useCountdown) — warning color, red when urgent
 *   2. Social pressure: "{X} of {Y} poolies have locked in"
 *   3. Highest-ranked game preview: "{away} vs {home} · Rank {rank}"
 *   4. CardFooter CTA: "Make Your Picks" or "Edit Your Picks"
 */
export function PicksOpenCard({
  deadline,
  currentWeek,
  highestRankedGame,
  userHasSubmitted,
  poolPicksSubmittedCount,
  poolMemberCount,
  onMakePicks,
}: PicksOpenCardProps) {
  const {timeLeft, isUrgent, hasExpired} = useCountdown(deadline);

  const ctaLabel = userHasSubmitted ? 'Edit Your Picks' : 'Make Your Picks';
  const lockedInLabel = userHasSubmitted ? 'You\'re locked in \u2713' : undefined;

  return (
    <View style={styles.container}>
      {/* Week label */}
      <Text style={styles.weekLabel}>WEEK {currentWeek}</Text>

      {/* Countdown */}
      {timeLeft && (
        <View style={styles.countdownRow}>
          <Text
            style={[
              styles.countdown,
              {color: isUrgent ? colors.error : colors.warning},
            ]}>
            {timeLeft}
          </Text>
          <Text style={styles.countdownSuffix}>
            {hasExpired ? '' : 'until deadline'}
          </Text>
        </View>
      )}

      {/* Social pressure line */}
      {poolMemberCount > 0 && (
        <Text style={styles.socialLine}>
          {poolPicksSubmittedCount} of {poolMemberCount} poolies have locked in
        </Text>
      )}

      {/* Placeholder — kickoff prompt TBD */}
      <View style={styles.gamePreview}>
        <Text style={styles.placeholderText}>
          Tuesday AM — kickoff prompt here.
        </Text>
      </View>

      {/* CTA footer */}
      <CardFooter
        label={ctaLabel}
        onPress={onMakePicks}
        secondaryLabel={lockedInLabel}
        secondaryColor={colors.success}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.md,
  },
  weekLabel: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  countdown: {
    ...typography.h2,
    fontWeight: '700',
  },
  countdownSuffix: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  socialLine: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  gamePreview: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  placeholderText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    flex: 1,
  },
});
