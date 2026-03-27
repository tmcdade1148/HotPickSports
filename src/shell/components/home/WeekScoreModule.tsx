import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
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
  const userPickCount = useNFLStore(s => s.userPickCount);
  const totalGamesThisWeek = useNFLStore(s => s.totalGamesThisWeek);
  const userHotPick = useNFLStore(s => s.userHotPick);

  // Hide when no state, or week is fully complete (final scores in StandingsBadge)
  if (!weekState || weekState === 'complete') {
    return null;
  }

  // During picks_open, only show if user has submitted picks
  if (weekState === 'picks_open' && userPickCount === 0) {
    return null;
  }

  const weekPoints = weekResult?.weekPoints ?? 0;

  // Calculate potential: assume every pick wins
  // Standard picks = +1 each, HotPick = +frozen_rank
  const hotPickRank = userHotPick?.frozen_rank ?? userHotPick?.rank ?? 1;
  const standardPickCount = Math.max(0, userPickCount - (userHotPick ? 1 : 0));
  const potentialPoints = weekState === 'picks_open' || weekState === 'locked'
    ? standardPickCount + (userHotPick ? hotPickRank : 0)
    : weekPoints; // During live/settling, show actual points (potential calculation needs weekPicks)

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

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
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
