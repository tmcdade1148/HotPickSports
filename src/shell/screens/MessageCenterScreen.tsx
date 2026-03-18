import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ChevronLeft, Megaphone, MessageCircle} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {supabase} from '@shared/config/supabase';
import {spacing, borderRadius} from '@shared/theme';
import {HOTPICK_DEFAULTS} from '@shell/theme/defaults';

interface MessageItem {
  id: string;
  type: 'broadcast' | 'moderator_note';
  poolId: string;
  poolName: string;
  message: string;
  senderName: string;
  sentAt: string;
}

/**
 * MessageCenterScreen — Full inbox of broadcasts and moderator notes.
 *
 * Accessible from Settings. Shows all broadcasts sent to the user's pools
 * and any moderator notes directed at the user in SmackTalk.
 */
export function MessageCenterScreen() {
  const navigation = useNavigation<any>();
  const userPools = useGlobalStore(s => s.userPools);
  const userId = useGlobalStore(s => s.user?.id);

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Settings page always uses HotPick colors
  const colors = {
    primary: HOTPICK_DEFAULTS.primary_color,
    secondary: HOTPICK_DEFAULTS.secondary_color,
    background: HOTPICK_DEFAULTS.background_color,
    surface: HOTPICK_DEFAULTS.surface_color,
    textPrimary: HOTPICK_DEFAULTS.text_primary,
    textSecondary: HOTPICK_DEFAULTS.text_secondary,
    border: '#333333',
  };

  const poolNameMap: Record<string, string> = {};
  for (const p of userPools) {
    poolNameMap[p.id] = p.name;
  }

  const fetchMessages = useCallback(async () => {
    if (userPools.length === 0 || !userId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const poolIds = userPools.map(p => p.id);
    const items: MessageItem[] = [];

    // 1. Fetch all broadcasts for user's pools (last 30 days)
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // 1. Fetch broadcasts for user's pools (last 30 days)
    const {data: broadcasts} = await supabase
      .from('organizer_notifications')
      .select('id, pool_id, message, sent_at, organizer_id, notification_type')
      .in('pool_id', poolIds)
      .eq('notification_type', 'broadcast')
      .gte('sent_at', thirtyDaysAgo)
      .order('sent_at', {ascending: false})
      .limit(50);

    // 2. Fetch moderator notes targeted at this user
    const {data: modNotes} = await supabase
      .from('organizer_notifications')
      .select('id, pool_id, message, sent_at, organizer_id, notification_type, recipient_user_ids')
      .in('pool_id', poolIds)
      .eq('notification_type', 'moderator_note')
      .contains('recipient_user_ids', [userId])
      .gte('sent_at', thirtyDaysAgo)
      .order('sent_at', {ascending: false})
      .limit(50);

    // Gather all organizer IDs for name resolution
    const senderIds = new Set<string>();
    for (const b of broadcasts ?? []) {
      if (b.organizer_id) senderIds.add(b.organizer_id);
    }
    for (const n of modNotes ?? []) {
      if (n.organizer_id) senderIds.add(n.organizer_id);
    }

    // Resolve sender names
    const senderIdArr = [...senderIds];
    let nameMap: Record<string, string> = {};
    if (senderIdArr.length > 0) {
      const {data: profiles} = await supabase
        .from('profiles')
        .select('id, first_name, last_name, poolie_name, display_name_preference')
        .in('id', senderIdArr);

      for (const p of profiles ?? []) {
        const pref = p.display_name_preference ?? 'first_name';
        if (pref === 'poolie_name' && p.poolie_name) {
          nameMap[p.id] = p.poolie_name;
        } else {
          nameMap[p.id] =
            [p.first_name, p.last_name?.charAt(0)]
              .filter(Boolean)
              .join(' ') || 'Organizer';
        }
      }
    }

    for (const b of broadcasts ?? []) {
      items.push({
        id: `bc-${b.id}`,
        type: 'broadcast',
        poolId: b.pool_id,
        poolName: poolNameMap[b.pool_id] ?? 'Pool',
        message: b.message,
        senderName: nameMap[b.organizer_id] ?? 'Organizer',
        sentAt: b.sent_at,
      });
    }

    for (const n of modNotes ?? []) {
      items.push({
        id: `mod-${n.id}`,
        type: 'moderator_note',
        poolId: n.pool_id,
        poolName: poolNameMap[n.pool_id] ?? 'Pool',
        message: n.message,
        senderName: nameMap[n.organizer_id] ?? 'Moderator',
        sentAt: n.sent_at,
      });
    }

    // Sort all by date descending
    items.sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
    );

    setMessages(items);
    setLoading(false);
  }, [userPools, userId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMessages();
    setRefreshing(false);
  };

  const renderItem = ({item}: {item: MessageItem}) => {
    const isBroadcast = item.type === 'broadcast';
    const iconColor = isBroadcast ? colors.secondary : colors.primary;
    const iconBg = isBroadcast
      ? colors.secondary + '20'
      : colors.primary + '20';

    return (
      <View style={[styles.messageCard, {backgroundColor: colors.surface}]}>
        <View style={styles.messageRow}>
          <View style={[styles.iconCircle, {backgroundColor: iconBg}]}>
            {isBroadcast ? (
              <Megaphone size={18} color={iconColor} />
            ) : (
              <MessageCircle size={18} color={iconColor} />
            )}
          </View>
          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <View style={styles.messageHeaderLeft}>
                <Text
                  style={[styles.typeBadge, {color: iconColor}]}
                  numberOfLines={1}>
                  {isBroadcast ? 'Broadcast' : 'Moderator Note'}
                </Text>
                <Text
                  style={[styles.poolLabel, {color: colors.textSecondary}]}
                  numberOfLines={1}>
                  {item.poolName}
                </Text>
              </View>
              <Text style={[styles.timeLabel, {color: colors.textSecondary}]}>
                {formatDate(item.sentAt)}
              </Text>
            </View>
            <Text style={[styles.messageText, {color: colors.textPrimary}]}>
              {item.message}
            </Text>
            <Text style={[styles.senderLabel, {color: colors.textSecondary}]}>
              — {item.senderName}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.background}]}
      edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.textPrimary}]}>
          Message Center
        </Text>
        <View style={{width: 24}} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centered}>
          <Megaphone size={48} color={colors.textSecondary} />
          <Text
            style={[styles.emptyTitle, {color: colors.textPrimary}]}>
            No messages
          </Text>
          <Text
            style={[styles.emptySubtitle, {color: colors.textSecondary}]}>
            Broadcasts and moderator notes from your pools will appear
            here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

/** Format a date string into a readable format */
function formatDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.round((now - then) / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.round(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  // Older than a week — show date
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  messageCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  messageRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  typeBadge: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  poolLabel: {
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  timeLabel: {
    fontSize: 11,
    marginLeft: spacing.sm,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 4,
  },
  senderLabel: {
    fontSize: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
