import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ChevronLeft, Megaphone, MessageCircle, Building2} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {formatRelativeTime} from '@shared/utils/format';
import {supabase} from '@shared/config/supabase';
import {messageCenterWindowStartIso} from '@shared/config/notifications';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

interface MessageItem {
  id: string;
  type: 'broadcast' | 'moderator_note' | 'partner_broadcast';
  poolId: string;
  poolName: string;
  message: string;
  senderName: string;
  sentAt: string;
  /** Platform-wide super-admin broadcast (from the hidden Platform Pool). The
   *  header reads "FROM: HotPick Sports" with no @ contest. */
  fromPlatform: boolean;
  /** Club logo for a partner_broadcast, resolved from partnersById (never from
   *  pool.brand_config — that's the lead-partner snapshot, wrong here). */
  logoUrl?: string | null;
}

/**
 * MessageCenterScreen — Full inbox of broadcasts and moderator notes.
 *
 * Accessible from Settings. Shows all broadcasts sent to the user's pools
 * and any moderator notes directed at the user in SmackTalk.
 */
export function MessageCenterScreen() {
  const navigation = useNavigation<any>();
  const userId = useGlobalStore(s => s.user?.id);

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // poolNameMap was stored in React state previously, but the for-loops
  // below run *inside* fetchMessages — the freshly-built local `nameMap`
  // is the only correct source there (state is async / stale-closured).
  // Carry it on the messages themselves via `poolName` and drop the
  // state entirely.

  const {colors} = useTheme();

  const fetchMessages = useCallback(async () => {
    if (!userId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    // Pull the user's full active pool membership directly — across
    // every competition + including hidden pools like the Platform
    // Pool. The global store's userPools slice is scoped to the
    // active competition and would drop platform-wide broadcasts.
    const {data: memberRows} = await supabase
      .from('pool_members')
      .select('pool_id, pools!inner(id, name, is_hidden_from_users)')
      .eq('user_id', userId)
      .eq('status', 'active');

    type RawRow = {
      pool_id: string;
      pools: {id: string; name: string | null; is_hidden_from_users: boolean}
           | {id: string; name: string | null; is_hidden_from_users: boolean}[]
           | null;
    };

    const poolIds: string[] = [];
    const nameMap: Record<string, string> = {};
    const hiddenById: Record<string, boolean> = {};
    for (const r of ((memberRows ?? []) as unknown) as RawRow[]) {
      const p = Array.isArray(r.pools) ? r.pools[0] : r.pools;
      if (!p) continue;
      poolIds.push(p.id);
      hiddenById[p.id] = p.is_hidden_from_users;
      nameMap[p.id] = p.is_hidden_from_users ? 'HotPick' : (p.name ?? 'Contest');
    }

    if (poolIds.length === 0) {
      setMessages([]);
      setLoading(false);
      return;
    }
    const items: MessageItem[] = [];

    // Messages time out of the Message Center after the shared window (per Tom,
    // 2026-06-15). The same constant gates the HomeInbox banner and the Pool /
    // Partner unread badges so a message never counts as unread after it has
    // aged out of this list. Single source: @shared/config/notifications.
    const windowStart = messageCenterWindowStartIso();

    // 1. Fetch Gaffer/super-admin broadcasts for the user's pools.
    const {data: broadcasts} = await supabase
      .from('organizer_notifications')
      .select('id, pool_id, message, sent_at, organizer_id, notification_type')
      .in('pool_id', poolIds)
      .eq('notification_type', 'broadcast')
      .gte('sent_at', windowStart)
      .order('sent_at', {ascending: false})
      .limit(50);

    // 2. Fetch moderator notes targeted at this user.
    const {data: modNotes} = await supabase
      .from('organizer_notifications')
      .select('id, pool_id, message, sent_at, organizer_id, notification_type, recipient_user_ids')
      .in('pool_id', poolIds)
      .eq('notification_type', 'moderator_note')
      .contains('recipient_user_ids', [userId])
      .gte('sent_at', windowStart)
      .order('sent_at', {ascending: false})
      .limit(50);

    // 3. Fetch Club (partner) broadcasts. RLS scopes partner_notifications to
    //    partners aligned with any active pool the user belongs to, so no
    //    explicit partner_id filter is needed here — the policy does it.
    const {data: partnerBroadcasts} = await supabase
      .from('partner_notifications')
      .select('id, partner_id, message, sent_at, notification_type')
      .eq('notification_type', 'broadcast')
      .gte('sent_at', windowStart)
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
    let senderNameMap: Record<string, string> = {};
    if (senderIdArr.length > 0) {
      const {data: profiles} = await supabase
        .from('profiles')
        .select('id, poolie_name')
        .in('id', senderIdArr);

      for (const p of profiles ?? []) {
        senderNameMap[p.id] = p.poolie_name || 'Gaffer';
      }
    }

    for (const b of broadcasts ?? []) {
      const fromPlatform = hiddenById[b.pool_id] === true;
      items.push({
        id: `bc-${b.id}`,
        type: 'broadcast',
        poolId: b.pool_id,
        poolName: nameMap[b.pool_id] ?? 'Contest',
        message: b.message,
        // Platform broadcasts are from HotPick itself, not a Gaffer.
        senderName: fromPlatform ? 'HotPick Sports' : (senderNameMap[b.organizer_id] ?? 'Gaffer'),
        sentAt: b.sent_at,
        fromPlatform,
      });
    }

    for (const n of modNotes ?? []) {
      items.push({
        id: `mod-${n.id}`,
        type: 'moderator_note',
        poolId: n.pool_id,
        poolName: nameMap[n.pool_id] ?? 'Contest',
        message: n.message,
        senderName: senderNameMap[n.organizer_id] ?? 'Moderator',
        sentAt: n.sent_at,
        fromPlatform: false,
      });
    }

    // Resolve Club identity (name + logo) for partner broadcasts. Per the
    // red-flag rule, partner identity is read from partnersById — NOT from
    // pool.brand_config, which only holds the lead partner's snapshot. The
    // store's partnersById is populated by Home's active/aligned partner loads;
    // any partner_id missing there (cold nav straight to this screen) is
    // back-filled with one direct partners query.
    const partnerRows = partnerBroadcasts ?? [];
    if (partnerRows.length > 0) {
      const partnersById = useGlobalStore.getState().partnersById;
      const neededIds = [...new Set(partnerRows.map(p => p.partner_id))];
      const missingIds = neededIds.filter(id => !partnersById[id]);

      const resolved: Record<string, {name: string; logoUrl: string | null}> = {};
      for (const id of neededIds) {
        const cached = partnersById[id];
        if (cached) resolved[id] = {name: cached.name, logoUrl: cached.logo_url ?? null};
      }
      if (missingIds.length > 0) {
        const {data: partnerData} = await supabase
          .from('partners')
          .select('id, name, brand_config')
          .in('id', missingIds);
        for (const row of (partnerData ?? []) as Array<{
          id: string;
          name: string;
          brand_config: Record<string, any> | null;
        }>) {
          const bc = row.brand_config ?? {};
          const logo = (bc.logo ?? {}) as Record<string, any>;
          const logoUrl =
            typeof logo.full === 'string' && logo.full.length > 0
              ? logo.full
              : typeof bc.logo_url === 'string' && bc.logo_url.length > 0
                ? bc.logo_url
                : null;
          resolved[row.id] = {name: row.name, logoUrl};
        }
      }

      for (const p of partnerRows) {
        const club = resolved[p.partner_id];
        items.push({
          id: `pn-${p.id}`,
          type: 'partner_broadcast',
          poolId: '',
          poolName: '',
          message: p.message ?? '',
          senderName: club?.name ?? 'Club',
          sentAt: p.sent_at,
          fromPlatform: false,
          logoUrl: club?.logoUrl ?? null,
        });
      }
    }

    // Sort all by date descending
    items.sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
    );

    setMessages(items);
    setLoading(false);

    // Mark everything in this inbox as read up to now. Two read-state tables,
    // one per channel:
    //   • notification_read_state         (user_id, pool_id)    — org/Gaffer
    //   • partner_notification_read_state  (user_id, partner_id) — Club
    // The Home badges + HomeInbox banner re-derive from these (HomeInbox also
    // subscribes to UPDATEs), so the unread counts clear once the upserts land.
    if (userId) {
      const nowIso = new Date().toISOString();
      const writes: Promise<unknown>[] = [];
      if (poolIds.length > 0) {
        writes.push(
          supabase
            .from('notification_read_state')
            .upsert(
              poolIds.map(pid => ({user_id: userId, pool_id: pid, last_read_at: nowIso})),
              {onConflict: 'user_id,pool_id'},
            ),
        );
      }
      const partnerIds = [
        ...new Set((partnerBroadcasts ?? []).map(p => p.partner_id)),
      ];
      if (partnerIds.length > 0) {
        writes.push(
          supabase
            .from('partner_notification_read_state')
            .upsert(
              partnerIds.map(pid => ({user_id: userId, partner_id: pid, last_read_at: nowIso})),
              {onConflict: 'user_id,partner_id'},
            ),
        );
      }
      await Promise.all(writes);
    }
  }, [userId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMessages();
    setRefreshing(false);
  };

  const renderItem = ({item}: {item: MessageItem}) => {
    const isPartner = item.type === 'partner_broadcast';
    const isBroadcast = item.type === 'broadcast';
    // Club broadcasts read in the brand's neutral primary; org broadcasts in
    // secondary; moderator notes in primary. (Club COLOR is never themed here
    // per Hard Rule #25 — identity surfaces via name + logo only.)
    const iconColor = isBroadcast || isPartner ? colors.secondary : colors.primary;
    const iconBg = isBroadcast || isPartner
      ? colors.secondary + '20'
      : colors.primary + '20';
    // Only org/Gaffer broadcasts and moderator notes carry an "@ contest"
    // suffix. Platform broadcasts and Club broadcasts don't (no single pool).
    const showPoolSuffix = !item.fromPlatform && !isPartner && !!item.poolName;

    return (
      <View style={[styles.messageCard, {backgroundColor: colors.surface}]}>
        <View style={styles.messageRow}>
          <View style={[styles.iconCircle, {backgroundColor: iconBg}]}>
            {isPartner && item.logoUrl ? (
              <Image
                source={{uri: item.logoUrl}}
                style={styles.clubLogo}
                resizeMode="contain"
              />
            ) : isPartner ? (
              <Building2 size={18} color={iconColor} />
            ) : isBroadcast ? (
              <Megaphone size={18} color={iconColor} />
            ) : (
              <MessageCircle size={18} color={iconColor} />
            )}
          </View>
          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <View style={styles.messageHeaderLeft}>
                <Text style={[styles.fromLabel, {color: colors.textTertiary}]}>
                  FROM:{' '}
                </Text>
                <Text
                  style={[styles.fromName, {color: iconColor}]}
                  numberOfLines={1}>
                  {item.senderName}
                </Text>
                {showPoolSuffix && (
                  <Text
                    style={[styles.poolLabel, {color: colors.textSecondary}]}
                    numberOfLines={1}>
                    {' @ '}{item.poolName}
                  </Text>
                )}
              </View>
              <Text style={[styles.timeLabel, {color: colors.textSecondary}]}>
                {formatRelativeTime(item.sentAt)}
              </Text>
            </View>
            <Text style={[styles.messageText, {color: colors.textPrimary}]}>
              {item.message}
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
            Broadcasts and moderator notes from your Contests will appear
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
              colors={[colors.primary]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

/** Format a date string into a readable format */
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
    overflow: 'hidden',
  },
  clubLogo: {
    width: 28,
    height: 28,
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    // Tight gap between the FROM line and the message body.
    marginBottom: 1,
  },
  messageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flex: 1,
  },
  fromLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  fromName: {
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
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
