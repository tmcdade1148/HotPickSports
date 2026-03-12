import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme';

/**
 * ScoreModule — Always-visible season total + weekly delta.
 *
 * Shows the user's cumulative season points and most relevant weekly
 * score in a single glanceable element. No tap required, no navigation.
 *
 * Pool-independent: userSeasonTotal is the same regardless of which
 * pool is active. This component never reads from pool-scoped data.
 *
 * Rerenders when nflStore.userSeasonTotal or weekResult updates
 * (Supabase Realtime during live state).
 */
export function ScoreModule() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const userSeasonTotal = useNFLStore(s => s.userSeasonTotal);
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const lastWeekNet = useNFLStore(s => s.lastWeekNet);
  const weekResult = useNFLStore(s => s.weekResult);
  const activePoolMemberCount = useNFLStore(s => s.activePoolMemberCount);

  // Loading state — data not yet fetched
  if (activePoolMemberCount === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonLarge} />
        <View style={styles.skeletonSmall} />
      </View>
    );
  }

  // Build the weekly delta line based on weekState
  const deltaLine = getDeltaLine(
    weekState,
    currentWeek,
    lastWeekNet,
    weekResult,
  );

  return (
    <View style={styles.container}>
      <Text style={styles.seasonTotal}>
        {userSeasonTotal} <Text style={styles.ptsLabel}>pts</Text>
      </Text>
      {deltaLine !== null && <Text style={styles.deltaLine}>{deltaLine}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Delta line builder
// ---------------------------------------------------------------------------

function getDeltaLine(
  weekState: string,
  currentWeek: number,
  lastWeekNet: number | null,
  weekResult: {weekPoints: number} | null,
): string | null {
  switch (weekState) {
    case 'picks_open':
    case 'locked':
    case 'complete': {
      // Show last week's result — null in Week 1
      if (currentWeek <= 1 || lastWeekNet === null) {
        return null; // No prior week to show
      }
      return `Last week: ${formatDelta(lastWeekNet)} pts`;
    }

    case 'live': {
      // Show current week's live score
      if (weekResult === null) {
        return 'This week: calculating...';
      }
      return `This week: ${formatDelta(weekResult.weekPoints)} pts (live)`;
    }

    case 'settling': {
      // Show current week's final score
      if (weekResult === null) {
        return 'This week: calculating...';
      }
      return `This week: ${formatDelta(weekResult.weekPoints)} pts`;
    }

    default:
      return null;
  }
}

/** Format a number with explicit sign: +6, -3, +0 */
function formatDelta(n: number): string {
  if (n > 0) {
    return `+${n}`;
  }
  if (n < 0) {
    return `\u2212${Math.abs(n)}`; // Use proper minus sign
  }
  return '+0';
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  seasonTotal: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  ptsLabel: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  deltaLine: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  skeletonLarge: {
    height: 28,
    width: 100,
    borderRadius: borderRadius.md,
    backgroundColor: colors.border,
    opacity: 0.3,
    marginBottom: spacing.xs,
  },
  skeletonSmall: {
    height: 14,
    width: 140,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.border,
    opacity: 0.3,
  },
});
