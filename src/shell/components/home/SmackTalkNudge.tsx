import React, {useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {MessageCircle, ChevronRight} from 'lucide-react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme';
import {supabase} from '@shared/config/supabase';

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

  // Fetch unseen messages from ALL visible pools
  const userId = useGlobalStore(s => s.user?.id);
  interface RecentMsg { id: string; poolId: string; author: string; text: string; time: string; isReply: boolean; }
  interface PoolGroup { poolId: string; poolName: string; msgs: RecentMsg[]; }
  const [poolGroups, setPoolGroups] = useState<PoolGroup[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!userId || userPools.length === 0) return;

    // Only fetch for pools with unreads
    const poolsWithUnreads = userPools.filter(p => (smackUnreadCounts[p.id] ?? 0) > 0);
    if (poolsWithUnreads.length === 0) {
      setPoolGroups([]);
      setShowAll(false);
      return;
    }

    const fetchAllUnseen = async () => {
      // Get read states for all pools at once
      const poolIds = poolsWithUnreads.map(p => p.id);
      const {data: readStates} = await supabase
        .from('smack_read_state')
        .select('pool_id, last_read_at')
        .eq('user_id', userId)
        .in('pool_id', poolIds);
      const readMap: Record<string, string> = {};
      for (const rs of readStates ?? []) {
        readMap[rs.pool_id] = rs.last_read_at;
      }

      // Fetch unseen messages per pool
      const groups: PoolGroup[] = [];
      const now = Date.now();

      for (const pool of poolsWithUnreads) {
        let query = supabase
          .from('smack_messages')
          .select('id, author_name, text, created_at, user_id, message_type, reply_to')
          .eq('pool_id', pool.id)
          .or(`user_id.is.null,user_id.neq.${userId}`)
          .order('created_at', {ascending: false})
          .limit(10);

        if (readMap[pool.id]) {
          query = query.gt('created_at', readMap[pool.id]);
        }

        const {data} = await query;
        if (data && data.length > 0) {
          const msgs: RecentMsg[] = data.map((d: any) => {
            const msgTime = new Date(d.created_at).getTime();
            const diffMin = Math.floor((now - msgTime) / 60000);
            const time = diffMin < 1 ? 'Just now' : diffMin < 60 ? `${diffMin}m ago` : diffMin < 1440 ? `${Math.floor(diffMin / 60)}h ago` : 'Yesterday';
            return {
              id: d.id,
              poolId: pool.id,
              author: d.user_id === null ? 'HotPick' : d.author_name,
              text: d.text,
              time,
              isReply: !!d.reply_to,
            };
          });
          groups.push({poolId: pool.id, poolName: pool.name, msgs});
        }
      }

      setPoolGroups(groups);
    };
    fetchAllUnseen();
    setShowAll(false);
  }, [userId, smackUnreadCounts]);

  const totalMsgs = poolGroups.reduce((sum, g) => sum + g.msgs.length, 0);

  // Build a flat list of all messages across pools for the 4-message cap
  const allMsgs = poolGroups.flatMap(g => g.msgs);
  const visibleCount = showAll ? allMsgs.length : Math.min(allMsgs.length, 4);
  const hiddenCount = allMsgs.length - 4;

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={poolGroups.length > 0}>
      {/* Header row — always visible */}
      <View style={styles.headerRow}>
        <View style={styles.headerContent}>
          <Text style={styles.labelText}>New SmackTalk Messages</Text>
          {poolGroups.length === 0 && (
            <Text style={styles.subtitleText}>Talk trash to your pool</Text>
          )}
        </View>
        {poolGroups.length === 0 && (
          <ChevronRight size={16} color={colors.textSecondary} />
        )}
      </View>

      {/* Grouped messages from all pools */}
      {poolGroups.length > 0 && (
        <View style={{marginTop: spacing.xs}}>
          {poolGroups.map(group => {
            // How many of this pool's messages are within the visible window
            const beforeThis = poolGroups
              .slice(0, poolGroups.indexOf(group))
              .reduce((sum, g) => sum + g.msgs.length, 0);
            const remainingSlots = showAll ? group.msgs.length : Math.max(0, 4 - beforeThis);
            const visibleMsgs = group.msgs.slice(0, remainingSlots);
            if (visibleMsgs.length === 0 && !showAll) return null;

            return (
              <TouchableOpacity
                key={group.poolId}
                activeOpacity={0.7}
                onPress={() => onPressPool(group.poolId)}>
                <Text style={styles.poolLabel}>{group.poolName}</Text>
                {(showAll ? group.msgs : visibleMsgs).map(msg => (
                  <View key={msg.id} style={styles.previewRow}>
                    <Text style={styles.previewText} numberOfLines={1}>
                      {msg.isReply && <Text style={{color: colors.primary}}>↩ </Text>}
                      <Text style={styles.previewAuthor}>{msg.author}{msg.isReply ? ' replied' : ''}: </Text>
                      {msg.text}
                    </Text>
                    <Text style={styles.previewTime}>{msg.time}</Text>
                  </View>
                ))}
              </TouchableOpacity>
            );
          })}
          {hiddenCount > 0 && !showAll && (
            <TouchableOpacity
              style={{paddingTop: spacing.xs}}
              onPress={() => setShowAll(true)}>
              <Text style={{fontSize: 12, fontWeight: '600', color: colors.primary}}>
                ▸ {hiddenCount} more message{hiddenCount !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          )}
          {showAll && hiddenCount > 0 && (
            <TouchableOpacity
              style={{paddingTop: spacing.xs}}
              onPress={() => setShowAll(false)}>
              <Text style={{fontSize: 12, fontWeight: '600', color: colors.primary}}>
                ▾ Show less
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
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
  poolLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  previewText: {
    ...typography.small,
    color: colors.textSecondary,
    flex: 1,
  },
  previewAuthor: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  previewTime: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 10,
  },
});
