import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme';

/**
 * WeekScoreModule — Current week score + potential max score.
 *
 * Shows the user's current week points and the maximum points they
 * could still earn from unsettled picks. Only visible during active
 * week states (locked, live, settling). Hidden during picks_open
 * (no scores yet) and complete (scores are final — shown in StandingsBadge).
 *
 * Pool-independent: week scores are user-level, not pool-scoped.
 */
export function WeekScoreModule() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const weekResult = useNFLStore(s => s.weekResult);
  const weekPicks = useNFLStore(s => s.weekPicks);

  // Only show during active game states
  if (!weekState || weekState === 'picks_open' || weekState === 'complete') {
    return null;
  }

  const weekPoints = weekResult?.weekPoints ?? 0;

  // Calculate potential: sum of frozen_rank for unsettled picks
  const potentialPoints = calculatePotential(weekPicks, weekPoints);

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
 * Calculate potential remaining points from unsettled picks.
 * Potential = current week points + sum of frozen_rank for picks
 * whose games haven't settled yet.
 */
function calculatePotential(
  weekPicks: any[] | null,
  currentPoints: number,
): number {
  if (!weekPicks || weekPicks.length === 0) return currentPoints;

  let unsettledPotential = 0;
  for (const pick of weekPicks) {
    // If pick hasn't been scored yet (game not final), add its potential
    if (pick.is_correct === null || pick.is_correct === undefined) {
      const rank = pick.frozen_rank ?? pick.rank ?? 1;
      if (pick.is_hotpick) {
        unsettledPotential += rank; // HotPick correct = +rank
      } else {
        unsettledPotential += 1; // Standard correct = +1
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
