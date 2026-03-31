import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {MessageCircle, ChevronRight} from 'lucide-react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme';

interface SmackTalkNudgeProps {
  /** Called when user taps the card with no unread alerts — navigates to SmackTalk */
  onPress: () => void;
  /** Called when user taps a specific nudge row — switches pool + navigates to SmackTalk */
  onPressPool: (poolId: string) => void;
}

/**
 * SmackTalkNudge — Always-visible SmackTalk module on the Home Screen.
 *
 * Always renders with a "SmackTalk" label (matching StandingsBadge pattern).
 * When other pools have unread messages, shows nudge rows below the label.
 * When no unreads, shows the label alone as a tappable card navigating
 * to the active pool's SmackTalk.
 *
 * Realtime updates come from globalStore's subscribeSmackUnread() —
 * this component only reads, it never manages subscriptions.
 */
export function SmackTalkNudge({onPress, onPressPool}: SmackTalkNudgeProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);
  const userPools = useGlobalStore(s => s.visiblePools);
  const activePoolId = useGlobalStore(s => s.activePoolId);

  const activePool = userPools.find(p => p.id === activePoolId);
  const isBranded = !!(activePool?.brand_config as any)?.is_branded;
  const glowColor = isBranded
    ? (activePool?.brand_config as any)?.secondary_color || '#0E6666'
    : '#0E6666';

  // Filter to non-active pools with unread > 0, sorted by count desc, max 3
  const nudgePools = userPools
    .filter(
      p => p.id !== activePoolId && (smackUnreadCounts[p.id] ?? 0) > 0,
    )
    .sort(
      (a, b) =>
        (smackUnreadCounts[b.id] ?? 0) - (smackUnreadCounts[a.id] ?? 0),
    )
    .slice(0, 3);

  const hasNudges = nudgePools.length > 0;

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.7}
      onPress={hasNudges ? undefined : onPress}
      disabled={hasNudges}>
      {/* Header row — always visible */}
      <View style={styles.headerRow}>
        <View style={styles.headerContent}>
          <Text style={styles.labelText}>New SmackTalk Messages</Text>
          {!hasNudges && (
            <Text style={styles.subtitleText}>Talk trash to your pool</Text>
          )}
        </View>
        {!hasNudges && (
          <ChevronRight size={16} color={colors.textSecondary} />
        )}
      </View>

      {/* Nudge rows — only when unreads exist */}
      {hasNudges &&
        nudgePools.map(pool => {
          const count = smackUnreadCounts[pool.id] ?? 0;
          return (
            <TouchableOpacity
              key={pool.id}
              style={styles.nudgeRow}
              activeOpacity={0.7}
              onPress={() => onPressPool(pool.id)}>
              <MessageCircle size={16} color={colors.primary} />
              <Text style={styles.nudgeText}>
                <Text style={styles.count}>{count}</Text>
                {' new message'}
                {count !== 1 ? 's' : ''}
                {' in '}
                <Text style={styles.poolName}>{pool.name}</Text>
              </Text>
            </TouchableOpacity>
          );
        })}
    </TouchableOpacity>
  );
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerContent: {
    flex: 1,
  },
  labelText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitleText: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  nudgeText: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
  },
  count: {
    fontWeight: '700',
    color: colors.primary,
  },
  poolName: {
    fontWeight: '600',
  },
});
