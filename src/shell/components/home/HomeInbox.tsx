// HomeInbox — top-of-Home banner for HotPick SUPER-ADMIN broadcasts only.
//
// Per the 2026-06-15 sender-routing model, the three broadcast sources each
// have their own surface:
//   • Super-admin (HotPick) broadcasts → THIS banner, always above Your Contests
//   • Gaffer / Assistant Gaffer broadcasts → the relevant Contest pill
//   • Partner / Club broadcasts → the Partners pill + affiliated Contest pills
//
// Super-admin broadcasts land in the hidden Platform Pool (is_global +
// is_hidden_from_users), which every user is auto-enrolled in. So this banner
// scopes its unread/read-state queries to that ONE pool — Gaffer pool
// broadcasts no longer surface here (they render on their own Contest pill).
//
// "Unread" = organizer_notifications rows on the Platform Pool with sent_at >
// max(notification_read_state.last_read_at, joined_at).

import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Mail, ChevronRight} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {hexToRgba} from '@shared/utils/color';
import {MESSAGE_CENTER_WINDOW_MS} from '@shared/config/notifications';

// Shared Message Center window so an aged-out message never lingers as an
// unread count with nothing to open. Single source of truth in
// @shared/config/notifications.
const RETENTION_MS = MESSAGE_CENTER_WINDOW_MS;

export function HomeInbox() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const user = useGlobalStore(s => s.user);
  // The hidden Platform Pool is where super-admin "All Users" broadcasts land.
  // This banner is scoped to it alone; Gaffer pool broadcasts render on the
  // Contest pill instead.
  const platformPoolId = useGlobalStore(
    s => s.userPools.find(p => p.is_global && p.is_hidden_from_users)?.id ?? null,
  );

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
    // Scope to the Platform Pool only — this banner shows super-admin broadcasts.
    const scoped = (pools ?? []).filter(p => p.pool_id === platformPoolId);
    if (!user?.id || !platformPoolId || scoped.length === 0) {
      setUnread(0);
      setLatestPreview(null);
      return;
    }
    const poolIds = scoped.map(p => p.pool_id);
    const joinedByPool = new Map(scoped.map(p => [p.pool_id, p.joined_at]));
    const windowStart = new Date(Date.now() - RETENTION_MS).toISOString();
    const [{data: msgs}, {data: readState}] = await Promise.all([
      supabase
        .from('organizer_notifications')
        .select('id, pool_id, message, sent_at, notification_type, recipient_user_ids')
        .in('pool_id', poolIds)
        .gte('sent_at', windowStart)
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
  }, [user?.id, pools, platformPoolId]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  // Realtime — scoped to pools the user actually belongs to. The
  // postgres_changes filter must be a single comma-list inside
  // `pool_id=in.(...)`. Channel re-binds when poolIds changes.
  useEffect(() => {
    if (!user?.id || !platformPoolId) return;
    const channel = supabase
      .channel(`home-inbox-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'organizer_notifications',
          filter: `pool_id=eq.${platformPoolId}`,
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
  }, [user?.id, platformPoolId, recompute]);

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
      accessibilityLabel={`${unread} new HotPick ${unread === 1 ? 'announcement' : 'announcements'} — open Message Center`}>
      <View style={[styles.iconWrap, {backgroundColor: colors.primary}]}>
        <Mail size={18} color={colors.onPrimary} strokeWidth={2.25} />
      </View>
      <View style={{flex: 1, minWidth: 0}}>
        <Text style={[bodyType.bold, {color: colors.primary, fontSize: 13}]}>
          {unread === 1 ? 'HotPick announcement' : `${unread} HotPick announcements`}
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
