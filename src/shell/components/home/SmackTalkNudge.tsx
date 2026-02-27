import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {MessageCircle} from 'lucide-react-native';
import {colors, spacing, borderRadius, typography} from '@shared/theme';
import {useGlobalStore} from '@shell/stores/globalStore';

interface SmackTalkNudgeProps {
  /** Called when user taps a nudge row — switches pool + navigates to SmackTalk */
  onPressPool: (poolId: string) => void;
}

/**
 * SmackTalkNudge — Cross-pool unread SmackTalk alerts.
 *
 * Shows unread message counts from pools OTHER than the currently active pool.
 * Named and specific — tells the user which pool has activity and how many
 * messages, so they can decide whether to switch.
 *
 * Renders nothing (null) when:
 *   - User is in only 1 pool
 *   - All other pools have 0 unreads
 *   - Data is loading
 *
 * Realtime updates come from globalStore's subscribeSmackUnread() —
 * this component only reads, it never manages subscriptions.
 */
export function SmackTalkNudge({onPressPool}: SmackTalkNudgeProps) {
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);
  const userPools = useGlobalStore(s => s.userPools);
  const activePoolId = useGlobalStore(s => s.activePoolId);

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

  // Render nothing if no qualifying pools
  if (nudgePools.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {nudgePools.map(pool => {
        const count = smackUnreadCounts[pool.id] ?? 0;
        return (
          <TouchableOpacity
            key={pool.id}
            style={styles.row}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  nudgeText: {
    ...typography.caption,
    color: colors.text,
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
