// HomeInbox — small card at the top of Home indicating unread messages.
//
// Architecture:
//   - poolIds cached in component state, fetched once at mount (and
//     refetched only when membership changes). Membership rarely
//     shifts mid-session, so re-querying it on every Realtime tick
//     was wasted work.
//   - Realtime subscription is filtered to pool_id=in.(...) for the
//     user's pools — was previously firing on every organizer_notifications
//     INSERT platform-wide, including broadcasts to pools the user
//     has nothing to do with.
//   - The recompute path (on Realtime tick) only runs the two
//     unread/read-state queries; it doesn't re-fetch membership.
//
// "Unread" = organizer_notifications rows with sent_at >
// notification_read_state.last_read_at, scoped to pools the user is
// an active member of (including the hidden Platform Pool, which
// every user is auto-enrolled in — that's where Super Admin platform
// broadcasts land).

import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Mail, ChevronRight} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {hexToRgba} from '@shared/utils/color';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function HomeInbox() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const user = useGlobalStore(s => s.user);

  // Track join time per pool — a broadcast sent BEFORE the user joined a pool
  // is not "unread" for them (otherwise every new signup inherits old pool
  // broadcasts as a phantom badge that opens to nothing).
  const [pools, setPools] = useState<{pool_id: string; joined_at: string | null}[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [latestPreview, setLatestPreview] = useState<string | null>(null);

  // Load membership once when the user changes. The user's set of
  // active pool memberships is stable mid-session — membership joins/
  // leaves go through dedicated screens, not the Home Realtime path.
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setPools(null);
      return;
    }
    (async () => {
      const {data} = await supabase
        .from('pool_members')
        .select('pool_id, joined_at')
        .eq('user_id', user.id)
        .eq('status', 'active');
      if (cancelled) return;
      setPools((data ?? []) as {pool_id: string; joined_at: string | null}[]);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const recompute = useCallback(async () => {
    if (!user?.id || !pools || pools.length === 0) {
      setUnread(0);
      setLatestPreview(null);
      return;
    }
    const poolIds = pools.map(p => p.pool_id);
    const joinedByPool = new Map(pools.map(p => [p.pool_id, p.joined_at]));
    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    const [{data: msgs}, {data: readState}] = await Promise.all([
      supabase
        .from('organizer_notifications')
        .select('id, pool_id, message, sent_at, notification_type, recipient_user_ids')
        .in('pool_id', poolIds)
        .gte('sent_at', thirtyDaysAgo)
        .order('sent_at', {ascending: false})
        .limit(100),
      supabase
        .from('notification_read_state')
        .select('pool_id, last_read_at')
        .eq('user_id', user.id)
        .in('pool_id', poolIds),
    ]);

    const lastReadByPool = new Map<string, string>();
    for (const r of (readState ?? []) as {pool_id: string; last_read_at: string}[]) {
      lastReadByPool.set(r.pool_id, r.last_read_at);
    }

    let unreadCount = 0;
    let mostRecentUnread: {message: string} | null = null;
    for (const m of (msgs ?? []) as Array<{
      pool_id: string;
      message: string;
      sent_at: string;
      notification_type: string;
      recipient_user_ids: string[] | null;
    }>) {
      if (m.notification_type === 'moderator_note') {
        if (!m.recipient_user_ids?.includes(user.id)) continue;
      }
      // A message is unread only if it arrived after BOTH the last read AND
      // the moment the user joined that pool — never count pre-join broadcasts.
      const lastRead = lastReadByPool.get(m.pool_id);
      const joined = joinedByPool.get(m.pool_id);
      const floor = Math.max(
        lastRead ? new Date(lastRead).getTime() : 0,
        joined ? new Date(joined).getTime() : 0,
      );
      if (new Date(m.sent_at).getTime() > floor) {
        unreadCount++;
        if (!mostRecentUnread) mostRecentUnread = {message: m.message};
      }
    }
    setUnread(unreadCount);
    setLatestPreview(mostRecentUnread?.message ?? null);
  }, [user?.id, pools]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  // Realtime — scoped to pools the user actually belongs to. The
  // postgres_changes filter must be a single comma-list inside
  // `pool_id=in.(...)`. Channel re-binds when poolIds changes.
  useEffect(() => {
    if (!user?.id || !pools || pools.length === 0) return;
    const inList = pools.map(p => p.pool_id).join(',');
    const channel = supabase
      .channel(`home-inbox-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'organizer_notifications',
          filter: `pool_id=in.(${inList})`,
        },
        () => recompute(),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notification_read_state',
          filter: `user_id=eq.${user.id}`,
        },
        () => recompute(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, pools, recompute]);

  if (unread === 0) return null;

  return (
    <Pressable
      onPress={() => navigation.navigate('MessageCenter')}
      style={({pressed}) => [
        styles.card,
        {
          backgroundColor: hexToRgba(colors.primary, 0.08),
          borderColor: colors.primary,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${unread} unread ${unread === 1 ? 'message' : 'messages'} — open Message Center`}>
      <View style={[styles.iconWrap, {backgroundColor: colors.primary}]}>
        <Mail size={18} color={colors.onPrimary} strokeWidth={2.25} />
      </View>
      <View style={{flex: 1, minWidth: 0}}>
        <Text style={[bodyType.bold, {color: colors.primary, fontSize: 13}]}>
          {unread} new {unread === 1 ? 'message' : 'messages'}
        </Text>
        {latestPreview && (
          <Text
            style={[bodyType.regular, {color: colors.textSecondary, fontSize: 12, marginTop: 2}]}
            numberOfLines={1}>
            {latestPreview}
          </Text>
        )}
      </View>
      <ChevronRight size={18} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
