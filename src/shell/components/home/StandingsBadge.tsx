import React, {useState, useEffect} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager} from 'react-native';
import {ChevronRight, ChevronDown, ChevronUp} from 'lucide-react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme';
import {useAuth} from '@shared/hooks/useAuth';
import {supabase} from '@shared/config/supabase';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PoolRankData {
  rank: number;
  memberCount: number;
  totalPoints: number;
}

interface StandingsBadgeProps {
  onPress: () => void;
}

/**
 * StandingsBadge — Lists all user pools with rank in each.
 *
 * Fetches rank for every visible pool from season_user_totals + pool_members.
 * Priority: partner pools first, then organizer/admin, then member.
 * Shows top 3 by default. If more than 3, remaining collapse into a dropdown.
 */
export function StandingsBadge({onPress}: StandingsBadgeProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const {user} = useAuth();

  const visiblePools = useGlobalStore(s => s.visiblePools);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const poolRoles = useGlobalStore(s => s.poolRoles);

  const [expanded, setExpanded] = useState(false);
  const [poolRanks, setPoolRanks] = useState<Record<string, PoolRankData>>({});

  // Fetch ranks for all visible pools
  useEffect(() => {
    if (!user?.id || visiblePools.length === 0) return;

    const fetchRanks = async () => {
      const ranks: Record<string, PoolRankData> = {};

      for (const pool of visiblePools) {
        // Get all members' total points for this pool
        const {data: members} = await supabase
          .from('pool_members')
          .select('user_id')
          .eq('pool_id', pool.id)
          .eq('status', 'active');

        if (!members || members.length === 0) continue;

        const memberIds = members.map(m => m.user_id);

        // Get season totals for all members
        const {data: totals} = await supabase
          .from('season_user_totals')
          .select('user_id, week_points')
          .eq('competition', 'nfl_2026')
          .in('user_id', memberIds);

        // Sum points per user
        const pointsByUser: Record<string, number> = {};
        for (const t of totals ?? []) {
          pointsByUser[t.user_id] = (pointsByUser[t.user_id] ?? 0) + t.week_points;
        }

        // Sort by points descending to determine rank
        const sorted = Object.entries(pointsByUser)
          .sort(([, a], [, b]) => b - a);

        const myIndex = sorted.findIndex(([uid]) => uid === user.id);
        const myPoints = pointsByUser[user.id] ?? 0;

        ranks[pool.id] = {
          rank: myIndex >= 0 ? myIndex + 1 : memberIds.length,
          memberCount: memberIds.length,
          totalPoints: myPoints,
        };
      }

      setPoolRanks(ranks);
    };

    fetchRanks();
  }, [user?.id, visiblePools.length]);

  if (visiblePools.length === 0) return null;

  // Sort: partner pools first, then organizer/admin, then member
  const sorted = [...visiblePools].sort((a, b) => {
    const aBranded = !!(a.brand_config as any)?.is_branded ? 0 : 1;
    const bBranded = !!(b.brand_config as any)?.is_branded ? 0 : 1;
    if (aBranded !== bBranded) return aBranded - bBranded;

    const aRole = poolRoles[a.id];
    const bRole = poolRoles[b.id];
    const aAdmin = (aRole === 'organizer' || aRole === 'admin') ? 0 : 1;
    const bAdmin = (bRole === 'organizer' || bRole === 'admin') ? 0 : 1;
    return aAdmin - bAdmin;
  });

  const topPools = sorted.slice(0, 3);
  const extraPools = sorted.slice(3);
  const hasMore = extraPools.length > 0;

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const renderPoolRow = (pool: typeof sorted[0], index: number, total: number) => {
    const isBranded = !!(pool.brand_config as any)?.is_branded;
    const highlightColor = isBranded
      ? (pool.brand_config as any)?.highlight_color || colors.highlight
      : colors.highlight;
    const rankData = poolRanks[pool.id];

    return (
      <TouchableOpacity
        key={pool.id}
        style={[
          styles.poolRow,
          index < total - 1 && styles.poolRowBorder,
          {borderBottomColor: colors.border},
        ]}
        activeOpacity={0.7}
        onPress={() => {
          setActivePoolId(pool.id);
          onPress();
        }}>
        <View style={styles.poolInfo}>
          <Text
            style={[
              styles.poolName,
              isBranded && {color: highlightColor},
            ]}
            numberOfLines={1}>
            {pool.name}
          </Text>
        </View>
        <View style={styles.rankInfo}>
          {rankData ? (
            <Text style={styles.rankText}>
              <Text style={[styles.rankValue, {color: colors.primary}]}>
                {ordinal(rankData.rank)}
              </Text>
              <Text style={styles.rankLabel}> of {rankData.memberCount}</Text>
            </Text>
          ) : (
            <Text style={styles.tbdText}>TBD</Text>
          )}
        </View>
        <ChevronRight size={14} color={colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Leaderboards</Text>
      {topPools.map((pool, i) => renderPoolRow(pool, i, hasMore ? topPools.length : topPools.length))}
      {hasMore && (
        <>
          <TouchableOpacity
            style={styles.moreRow}
            onPress={toggleExpanded}
            activeOpacity={0.7}>
            <Text style={styles.moreText}>
              {expanded ? 'Show less' : `+${extraPools.length} more`}
            </Text>
            {expanded ? (
              <ChevronUp size={14} color={colors.textSecondary} />
            ) : (
              <ChevronDown size={14} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
          {expanded && extraPools.map((pool, i) => renderPoolRow(pool, i, extraPools.length))}
        </>
      )}
    </View>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
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
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
  },
  poolRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  poolInfo: {
    flex: 1,
  },
  poolName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  rankInfo: {
    marginRight: spacing.sm,
  },
  rankText: {
    fontSize: 14,
  },
  rankValue: {
    fontWeight: '700',
  },
  rankLabel: {
    fontWeight: '400',
    color: colors.textSecondary,
  },
  tbdText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: 4,
  },
  moreText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
