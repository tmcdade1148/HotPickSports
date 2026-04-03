import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, typography, borderRadius} from '@shared/theme';
import {useCountdown} from '@shared/hooks/useCountdown';
import {CardFooter} from './CardFooter';
import type {DbSeasonGame} from '@shared/types/database';
import {useTheme} from '@shell/theme';

/** Format a Date into "Sunday, 1:00 PM" for display */
function formatGameDateTime(date: Date): string {
  const days = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday',
    'Thursday', 'Friday', 'Saturday',
  ];
  const dayName = days[date.getDay()];
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const minuteStr = minutes < 10 ? `0${minutes}` : String(minutes);
  return `${dayName}, ${hours}:${minuteStr} ${ampm}`;
}

interface PicksOpenCardProps {
  /** Picks deadline from competition_config */
  deadline: Date | null;
  /** Current NFL week number */
  currentWeek: number;
  /** Top-ranked game this week (highest rank value) */
  highestRankedGame: DbSeasonGame | null;
  /** Earliest kickoff time this week */
  weekFirstKickoff: Date | null;
  /** Whether the current user has submitted at least one pick this week */
  userHasSubmitted: boolean;
  /** Number of picks the user has made this week */
  userPickCount: number;
  /** Total games available to pick this week */
  totalGames: number;
  /** Whether picks have been submitted (confirmed) this week */
  isWeekComplete: boolean;
  /** Navigate to make/edit picks */
  onMakePicks: () => void;
  /** Override color for WEEK label (partner secondary color) */
  weekLabelColor?: string;
}

/**
 * PicksOpenCard — Shown when weekState === 'picks_open'.
 *
 * Full spec (top to bottom):
 *   1. Ticking countdown to deadline (useCountdown) — warning color, red when urgent
 *   2. CardFooter CTA: "Make Your Picks" or "Edit Your Picks"
 */
export function PicksOpenCard({
  deadline,
  currentWeek,
  highestRankedGame,
  weekFirstKickoff,
  userHasSubmitted,
  userPickCount,
  totalGames,
  isWeekComplete,
  onMakePicks,
  weekLabelColor,
}: PicksOpenCardProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const {timeLeft, isUrgent, hasExpired} = useCountdown(deadline);
  const kickoff = useCountdown(weekFirstKickoff);

  const picksComplete = userPickCount >= totalGames && totalGames > 0;
  // Mirror the picks screen: yellow "Submit your picks" when user has
  // unsubmitted changes (picks exist but isWeekComplete is false).
  const needsSubmit = userHasSubmitted && !isWeekComplete;
  const ctaLabel = needsSubmit
    ? 'Submit your picks'
    : userHasSubmitted
      ? (picksComplete ? 'Edit Your Picks' : 'Finish Your Picks')
      : 'Make Your Picks';
  const ctaAccent = needsSubmit ? colors.warning : undefined;
  const ctaTextDark = needsSubmit; // dark text on yellow background
  const lockedInLabel = picksComplete && isWeekComplete
    ? 'Your picks are in \u2713'
    : userHasSubmitted
      ? `${userPickCount} of ${totalGames} picked — you\u2019re not done yet`
      : undefined;
  const lockedInColor = (picksComplete && isWeekComplete) ? '#1b9a06' : colors.warning;

  return (
    <View style={styles.container}>
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

      {/* Social pressure line moved to Picks are LIVE module in SeasonEventCard */}

      {/* CTA footer */}
      <CardFooter
        label={ctaLabel}
        onPress={onMakePicks}
        accentColor={ctaAccent}
        darkText={ctaTextDark}
        secondaryLabel={lockedInLabel}
        secondaryColor={lockedInColor}
        secondaryLarge={picksComplete && isWeekComplete}
      />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    paddingTop: spacing.md,
  },
  weekLabel: {
    ...typography.h2,
    color: colors.highlight,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  countdown: {
    ...typography.h2,
    fontWeight: '700',
  },
  countdownSuffix: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
