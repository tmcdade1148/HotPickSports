import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {ChevronRight} from 'lucide-react-native';
import {colors, spacing, borderRadius, typography} from '@shared/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';

// ---------------------------------------------------------------------------
// Future-proofed type — array of 1 for Season 2, expandable later
// ---------------------------------------------------------------------------

interface StandingContext {
  poolId: string;
  poolName: string;
  userTotal: number;
  rank: number | null;
  memberCount: number;
  isGlobal: boolean;
}

interface StandingsBadgeProps {
  /** Navigates to the Board tab (full leaderboard) */
  onPress: () => void;
}

/**
 * StandingsBadge — Always-visible score + rank badge below the SmartCard.
 *
 * Shows the user's cumulative season points and pool rank so they never
 * need to navigate away from Home to know where they stand.
 *
 * Reads from nflStore (standings data) and globalStore (pool context).
 * Does NOT fetch data — SeasonEventCard triggers fetchPoolStandings().
 */
export function StandingsBadge({onPress}: StandingsBadgeProps) {
  const userSeasonTotal = useNFLStore(s => s.userSeasonTotal);
  const userPoolRank = useNFLStore(s => s.userPoolRank);
  const activePoolMemberCount = useNFLStore(s => s.activePoolMemberCount);

  const activePoolId = useGlobalStore(s => s.activePoolId);
  const userPools = useGlobalStore(s => s.userPools);
  const userProfile = useGlobalStore(s => s.userProfile);

  // No pool selected — don't render
  if (!activePoolId) {
    return null;
  }

  const poolName = userPools.find(p => p.id === activePoolId)?.name ?? 'Pool';

  // Build context array (1 item for Season 2)
  const contexts: StandingContext[] = [
    {
      poolId: activePoolId,
      poolName,
      userTotal: userSeasonTotal,
      rank: userPoolRank,
      memberCount: activePoolMemberCount,
      isGlobal: false,
    },
  ];

  // Loading state: pool selected but standings not yet fetched
  if (activePoolMemberCount === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.skeleton} />
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.7}
      onPress={onPress}>
      {contexts.map(ctx => {
        const hasScores = ctx.userTotal > 0 && ctx.rank != null;
        const displayName =
          userProfile?.display_name_preference === 'poolie_name' &&
          userProfile?.poolie_name
            ? userProfile.poolie_name
            : userProfile?.first_name ?? 'You';

        return (
          <View key={ctx.poolId} style={styles.row}>
            <View style={styles.content}>
              {hasScores ? (
                <Text style={styles.standingText}>
                  <Text style={styles.rankValue}>
                    {ordinal(ctx.rank!)}
                  </Text>
                  <Text style={styles.rankLabel}>
                    {' '}of {ctx.memberCount}
                  </Text>
                  <Text style={styles.separator}> {'\u00B7'} </Text>
                  <Text style={styles.pointsValue}>{ctx.userTotal}</Text>
                  <Text style={styles.pointsLabel}> pts</Text>
                </Text>
              ) : (
                <Text style={styles.standingText}>
                  <Text style={styles.pointsValue}>Leaderboard</Text>
                </Text>
              )}
              <Text style={styles.poolLabel}>
                {hasScores ? ctx.poolName : displayName}
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textSecondary} />
          </View>
        );
      })}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Ordinal helper — 1st, 2nd, 3rd, 4th...
// ---------------------------------------------------------------------------

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
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
  skeleton: {
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.border,
    opacity: 0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
  },
  standingText: {
    ...typography.body,
    color: colors.text,
  },
  pointsValue: {
    fontWeight: '700',
    color: colors.text,
  },
  pointsLabel: {
    fontWeight: '400',
    color: colors.textSecondary,
  },
  separator: {
    color: colors.textSecondary,
  },
  rankValue: {
    fontWeight: '600',
    color: colors.primary,
  },
  rankLabel: {
    fontWeight: '400',
    color: colors.textSecondary,
  },
  noPicksText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  poolLabel: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
