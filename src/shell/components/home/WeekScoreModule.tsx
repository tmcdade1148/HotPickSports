import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useTheme} from '@shell/theme';

/**
 * WeekScoreModule — Current week score + potential max score.
 *
 * Shows once user has submitted picks. Potential = max score if
 * every pick is correct (HotPick adds frozen_rank, standard adds 1).
 * During live/settling, actual points replace potential for settled games.
 *
 * Visible: picks_open (after submit), locked, live, settling.
 * Hidden: picks_open (before submit), complete, no weekState.
 *
 * Pool-independent: week scores are user-level, not pool-scoped.
 */
export function WeekScoreModule() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const weekResult = useNFLStore(s => s.weekResult);
  const weekPicks = useSeasonStore(s => s.weekPicks);

  // Hide when no state, or week is fully complete (final scores in StandingsBadge)
  if (!weekState || weekState === 'complete') {
    return null;
  }

  // During picks_open, only show if user has submitted picks (has any picks in DB)
  const hasSubmittedPicks = weekPicks && weekPicks.length > 0;
  if (weekState === 'picks_open' && !hasSubmittedPicks) {
    return null;
  }

  const weekPoints = weekResult?.weekPoints ?? 0;

  // Calculate potential: assume every pick wins
  const potentialPoints = calculatePotential(weekPicks, weekPoints, weekState);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.column}>
          <Text style={styles.label}>WEEK {currentWeek}</Text>
          <Text style={styles.scoreValue}>
            {weekPoints > 0 ? '+' : ''}{weekPoints}
            <Text style={styles.ptsLabel}> pts</Text>
          </Text>
        </View>
        <View style={[styles.column, styles.rightColumn]}>
          <Text style={styles.label}>POTENTIAL</Text>
          <Text style={[styles.scoreValue, {color: colors.textSecondary}]}>
            {potentialPoints > 0 ? '+' : ''}{potentialPoints}
            <Text style={styles.ptsLabel}> pts</Text>
          </Text>
        </View>
      </View>
      {weekState === 'live' && (
        <View style={styles.liveIndicator}>
          <View style={[styles.liveDot, {backgroundColor: '#1b9a06'}]} />
          <Text style={[styles.liveText, {color: '#1b9a06'}]}>Live</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Calculate potential score assuming every pick is correct.
 *
 * Before games start (picks_open/locked): potential = sum of all picks
 * as if every one wins. HotPick correct = +frozen_rank, standard = +1.
 *
 * During live/settling: settled picks use actual result, unsettled
 * picks assume correct.
 */
function calculatePotential(
  weekPicks: any[] | null,
  currentPoints: number,
  weekState: string,
): number {
  if (!weekPicks || weekPicks.length === 0) return 0;

  // Before games start — every pick assumed correct
  if (weekState === 'picks_open' || weekState === 'locked') {
    let total = 0;
    for (const pick of weekPicks) {
      const rank = pick.frozen_rank ?? pick.rank ?? 1;
      if (pick.is_hotpick) {
        total += rank; // HotPick correct = +rank
      } else {
        total += 1; // Standard correct = +1
      }
    }
    return total;
  }

  // During live/settling — actual points + unsettled picks assumed correct
  let unsettledPotential = 0;
  for (const pick of weekPicks) {
    if (pick.is_correct === null || pick.is_correct === undefined) {
      const rank = pick.frozen_rank ?? pick.rank ?? 1;
      if (pick.is_hotpick) {
        unsettledPotential += rank;
      } else {
        unsettledPotential += 1;
      }
    }
  }

  return currentPoints + unsettledPotential;
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  column: {
    flex: 1,
  },
  rightColumn: {
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  ptsLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
