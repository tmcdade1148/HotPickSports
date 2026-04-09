import React, {useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {ChevronRight} from 'lucide-react-native';
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

interface RecentMsg {
  id: string;
  poolId: string;
  author: string;
  text: string;
  time: string;
  isReply: boolean;
}

interface PoolGroup {
  poolId: string;
  poolName: string;
  msgs: RecentMsg[];
}

function formatRelativeTime(createdAt: string, now: number): string {
  const diffMin = Math.floor((now - new Date(createdAt).getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return 'Yesterday';
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
  const userId = useGlobalStore(s => s.user?.id);

  const [poolGroups, setPoolGroups] = useState<PoolGroup[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!userId || userPools.length === 0) return;

    const poolsWithUnreads = userPools.filter(p => (smackUnreadCounts[p.id] ?? 0) > 0);
    if (poolsWithUnreads.length === 0) {
      setPoolGroups([]);
      setShowAll(false);
      return;
    }

    const fetchAllUnseen = async () => {
      const poolIds = poolsWithUnreads.map(p => p.id);

      // Batch: one query for all read states, one for all messages
      const [{data: readStates}, {data: allMessages}] = await Promise.all([
        supabase
          .from('smack_read_state')
          .select('pool_id, last_read_at')
          .eq('user_id', userId)
          .in('pool_id', poolIds),
        supabase
          .from('smack_messages')
          .select('id, pool_id, author_name, text, created_at, user_id, message_type, reply_to')
          .in('pool_id', poolIds)
          .or(`user_id.is.null,user_id.neq.${userId}`)
          .order('created_at', {ascending: false})
          .limit(poolIds.length * 10),
      ]);

      const readMap: Record<string, string> = {};
      for (const rs of readStates ?? []) {
        readMap[rs.pool_id] = rs.last_read_at;
      }

      // Group messages by pool and filter by last_read_at
      const now = Date.now();
      const byPool: Record<string, RecentMsg[]> = {};
      for (const d of (allMessages ?? []) as any[]) {
        const lastRead = readMap[d.pool_id];
        if (lastRead && new Date(d.created_at) <= new Date(lastRead)) continue;
        (byPool[d.pool_id] ??= []).push({
          id: d.id,
          poolId: d.pool_id,
          author: d.user_id === null ? 'HotPick' : d.author_name,
          text: d.text,
          time: formatRelativeTime(d.created_at, now),
          isReply: !!d.reply_to,
        });
      }

      const groups: PoolGroup[] = poolsWithUnreads
        .filter(p => byPool[p.id]?.length)
        .map(p => ({poolId: p.id, poolName: p.name, msgs: byPool[p.id]}));

      setPoolGroups(groups);
    };
    fetchAllUnseen();
    setShowAll(false);
  }, [userId, smackUnreadCounts, userPools]);

  const allMsgs = poolGroups.flatMap(g => g.msgs);
  const hiddenCount = allMsgs.length - 4;

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={poolGroups.length > 0}>
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

      {poolGroups.length > 0 && (
        <View style={styles.groupsContainer}>
          {poolGroups.map((group, idx) => {
            const beforeThis = poolGroups
              .slice(0, idx)
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
              style={styles.showMoreRow}
              onPress={() => setShowAll(true)}>
              <Text style={styles.showMoreText}>
                ▸ {hiddenCount} more message{hiddenCount !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          )}
          {showAll && hiddenCount > 0 && (
            <TouchableOpacity
              style={styles.showMoreRow}
              onPress={() => setShowAll(false)}>
              <Text style={styles.showMoreText}>▾ Show less</Text>
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
  groupsContainer: {
    marginTop: spacing.xs,
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
  showMoreRow: {
    paddingTop: spacing.xs,
  },
  showMoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
});
