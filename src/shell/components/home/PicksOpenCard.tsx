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
  /** Earliest kickoff time this week */
  weekFirstKickoff: Date | null;
  /** User's HotPick game kickoff time (null if no HotPick selected) */
  hotPickKickoff: Date | null;
  /** User's HotPick team name (null if no HotPick selected) */
  hotPickTeam: string | null;
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
 *   3. Countdown to kickoff + HotPick kickoff (if selected)
 *   4. CardFooter CTA: "Make Your Picks" or "Edit Your Picks"
 */
export function PicksOpenCard({
  deadline,
  currentWeek,
  highestRankedGame,
  weekFirstKickoff,
  hotPickKickoff,
  hotPickTeam,
  userHasSubmitted,
  poolPicksSubmittedCount,
  poolMemberCount,
  onMakePicks,
}: PicksOpenCardProps) {
  const {timeLeft, isUrgent, hasExpired} = useCountdown(deadline);
  const kickoff = useCountdown(weekFirstKickoff);
  const hotPickCountdown = useCountdown(hotPickKickoff);

  const ctaLabel = userHasSubmitted ? 'Edit Your Picks' : 'Make Your Picks';
  const lockedInLabel = userHasSubmitted ? 'Your picks are in \u2713' : undefined;

  return (
    <View style={styles.container}>
      {/* Week label */}
      <Text style={styles.weekLabel}>WEEK {currentWeek}</Text>

      {/* Countdown to deadline */}
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

      {/* Kickoff countdowns */}
      <View style={styles.kickoffSection}>
        {/* First game kickoff */}
        {kickoff.timeLeft && !kickoff.hasExpired && (
          <View style={styles.kickoffRow}>
            <Text style={styles.kickoffIcon}>{'\uD83C\uDFC8'}</Text>
            <Text style={styles.kickoffText}>
              Kickoff in {kickoff.timeLeft}
            </Text>
          </View>
        )}

        {/* HotPick game kickoff */}
        {hotPickTeam && hotPickCountdown.timeLeft && !hotPickCountdown.hasExpired && (
          <View style={styles.kickoffRow}>
            <Text style={styles.kickoffIcon}>{'\uD83D\uDD25'}</Text>
            <Text style={styles.kickoffText}>
              {hotPickTeam} kicks off in {hotPickCountdown.timeLeft}
            </Text>
          </View>
        )}

        {/* Placeholder — kickoff prompt TBD */}
        {!kickoff.timeLeft && !hotPickTeam && (
          <Text style={styles.placeholderText}>
            Tuesday AM — kickoff prompt here.
          </Text>
        )}
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
  kickoffSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  kickoffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  kickoffIcon: {
    fontSize: 16,
  },
  kickoffText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  placeholderText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
