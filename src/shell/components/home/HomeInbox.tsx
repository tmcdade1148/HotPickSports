// HomeInbox — small card at the top of Home indicating unread messages.
//
// Loads unread counts on mount + subscribes to organizer_notifications
// inserts via Realtime so the badge updates without a refresh. Tap →
// MessageCenter. Hides itself when there's nothing unread.
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

export function HomeInbox() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const user = useGlobalStore(s => s.user);

  const [unread, setUnread] = useState(0);
  const [latestPreview, setLatestPreview] = useState<string | null>(null);

  const recompute = useCallback(async () => {
    if (!user?.id) {
      setUnread(0);
      setLatestPreview(null);
      return;
    }
    // Resolve the user's full active pool membership across ALL
    // competitions (including the hidden Platform Pool). Can't use
    // useGlobalStore(s => s.userPools) here — that slice is scoped to
    // the active competition and would silently drop messages from
    // pools in other competitions, including platform-wide admin
    // broadcasts that live on the cross-competition Platform Pool.
    const {data: membershipRows} = await supabase
      .from('pool_members')
      .select('pool_id')
      .eq('user_id', user.id)
      .eq('status', 'active');
    const poolIds = ((membershipRows ?? []) as {pool_id: string}[]).map(r => r.pool_id);
    if (poolIds.length === 0) {
      setUnread(0);
      setLatestPreview(null);
      return;
    }

    // One query for unread broadcasts/notes across every pool the user
    // is in. The exact same surface MessageCenter consults — just
    // counted instead of listed. 30-day window matches MessageCenter.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
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
      // Moderator notes: only count when this user is in recipient list.
      if (m.notification_type === 'moderator_note') {
        if (!m.recipient_user_ids?.includes(user.id)) continue;
      }
      const lastRead = lastReadByPool.get(m.pool_id);
      if (!lastRead || new Date(m.sent_at) > new Date(lastRead)) {
        unreadCount++;
        if (!mostRecentUnread) mostRecentUnread = {message: m.message};
      }
    }
    setUnread(unreadCount);
    setLatestPreview(mostRecentUnread?.message ?? null);
  }, [user?.id]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  // Realtime: new organizer_notifications row inserted → recompute.
  // Channel scoped per-user so signing-out tears it down cleanly.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`home-inbox-${user.id}`)
      .on(
        'postgres_changes',
        {event: 'INSERT', schema: 'public', table: 'organizer_notifications'},
        () => recompute(),
      )
      .on(
        'postgres_changes',
        {event: 'UPDATE', schema: 'public', table: 'notification_read_state', filter: `user_id=eq.${user.id}`},
        () => recompute(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, recompute]);

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
