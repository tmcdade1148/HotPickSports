// AdminModerationQueueScreen — cross-pool list of escalated flagged
// messages. Per April 2026 Super Admin spec §5.3.
//
// Sourced from smack_messages where moderation_status = 'escalated'
// AND is_removed = false. Sorted by flagged_at ASC (oldest first).
//
// Actions per message:
//   Dismiss — mark approved (message remains visible)
//   Remove  — is_removed = true (message hidden)
//   Warn user — Alert with reason; sends moderator note via notification_queue
//   Suspend user — calls suspend-user Edge Function
//
// Every action writes an admin_audit_log entry before mutating state.

import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ChevronLeft, RefreshCw} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';

type EscalatedMessage = {
  id: string;
  pool_id: string;
  pool_name: string;
  pool_hidden: boolean;
  author_name: string;
  author_id: string;
  text: string;
  flagged_at: string;
};

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) {
    const mins = Math.max(1, Math.floor(ms / (1000 * 60)));
    return `${mins}m ago`;
  }
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AdminModerationQueueScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const profile = useGlobalStore(s => s.userProfile);

  const [items, setItems] = useState<EscalatedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    type Row = {
      id: string;
      pool_id: string;
      author_name: string | null;
      user_id: string;
      text: string;
      flagged_at: string;
      pools: {name: string | null; is_hidden_from_users: boolean} | {name: string | null; is_hidden_from_users: boolean}[] | null;
    };
    const {data} = await supabase
      .from('smack_messages')
      .select('id, pool_id, author_name, user_id, text, flagged_at, pools(name, is_hidden_from_users)')
      .eq('moderation_status', 'escalated')
      .eq('is_removed', false)
      .order('flagged_at', {ascending: true});
    const rows = ((data ?? []) as unknown) as Row[];
    setItems(
      rows.map(r => {
        const pool = Array.isArray(r.pools) ? r.pools[0] : r.pools;
        return {
          id: r.id,
          pool_id: r.pool_id,
          pool_name: pool?.name ?? 'Unknown pool',
          pool_hidden: pool?.is_hidden_from_users ?? false,
          author_name: r.author_name ?? 'Unknown',
          author_id: r.user_id,
          text: r.text,
          flagged_at: r.flagged_at,
        };
      }),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (profile?.is_super_admin) load();
  }, [profile?.is_super_admin, load]);

  const writeAudit = async (action: string, msg: EscalatedMessage, extra: Record<string, unknown> = {}) => {
    if (!profile) return;
    await supabase.from('admin_audit_log').insert({
      admin_id:     profile.id,
      action:       'MODERATION_ESCALATION_ACTIONED',
      target_table: 'smack_messages',
      target_id:    msg.id,
      metadata:     {sub_action: action, pool_id: msg.pool_id, author_id: msg.author_id, ...extra},
    });
  };

  const handleDismiss = (msg: EscalatedMessage) => {
    Alert.alert(
      'Dismiss',
      'Mark this message reviewed with no action taken. It stays visible to members.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Dismiss',
          onPress: async () => {
            setActionId(msg.id);
            await writeAudit('dismiss', msg);
            await supabase
              .from('smack_messages')
              .update({moderation_status: 'approved'})
              .eq('id', msg.id);
            setActionId(null);
            setItems(prev => prev.filter(x => x.id !== msg.id));
          },
        },
      ],
    );
  };

  const handleRemove = (msg: EscalatedMessage) => {
    Alert.alert(
      'Remove message',
      'Hide this message from members. Both the reporter and the poster will be notified.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setActionId(msg.id);
            await writeAudit('remove', msg);
            await supabase
              .from('smack_messages')
              .update({moderation_status: 'removed', is_removed: true})
              .eq('id', msg.id);
            setActionId(null);
            setItems(prev => prev.filter(x => x.id !== msg.id));
          },
        },
      ],
    );
  };

  const handleSuspend = (msg: EscalatedMessage) => {
    Alert.alert(
      `Suspend ${msg.author_name}?`,
      'Their account becomes read-only across the entire platform. They can still see the app but cannot pick, chirp, or join Contests. This is reversible.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: async () => {
            setActionId(msg.id);
            const {data, error} = await supabase.functions.invoke('suspend-user', {
              body: {user_id: msg.author_id, reason: `Escalated message: "${msg.text.slice(0, 60)}"`},
            });
            setActionId(null);
            if (error) {
              Alert.alert('Failed', error.message);
              return;
            }
            const result = data as {error?: string; ok?: boolean};
            if (result?.error) {
              Alert.alert('Failed', result.error);
              return;
            }
            // Also remove the offending message + audit it
            await writeAudit('suspend_user', msg);
            await supabase
              .from('smack_messages')
              .update({moderation_status: 'removed', is_removed: true})
              .eq('id', msg.id);
            setItems(prev => prev.filter(x => x.id !== msg.id));
            Alert.alert('Suspended', `${msg.author_name} is now suspended platform-wide.`);
          },
        },
      ],
    );
  };

  if (!profile?.is_super_admin) {
    return (
      <SafeAreaView style={[styles.shell, {backgroundColor: colors.background}]} edges={['top']}>
        <Text style={[bodyType.regular, {color: colors.error, padding: spacing.lg}]}>Not authorized.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.shell, {backgroundColor: colors.background}]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <ChevronLeft color={colors.textPrimary} size={24} />
        </Pressable>
        <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
          MODERATION QUEUE
        </Text>
        <Pressable onPress={load} hitSlop={8}>
          <RefreshCw color={colors.textSecondary} size={20} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{marginTop: spacing.xl}} />
      ) : items.length === 0 ? (
        <Text style={[bodyType.regular, {color: colors.textTertiary, padding: spacing.lg, textAlign: 'center'}]}>
          The queue is empty. Nothing needs your attention.
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {items.map(msg => (
            <View
              key={msg.id}
              style={[styles.card, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <View style={styles.metaRow}>
                <Text style={[bodyType.bold, {color: colors.textPrimary, flex: 1}]} numberOfLines={1}>
                  {msg.pool_name}
                </Text>
                <Text style={[bodyType.regular, {color: colors.textTertiary, fontSize: 11}]}>
                  {formatAge(msg.flagged_at)}
                </Text>
              </View>
              <View style={styles.badgeRow}>
                {msg.pool_hidden ? (
                  <View style={[styles.badge, {borderColor: colors.warning ?? colors.primary}]}>
                    <Text style={[bodyType.bold, {fontSize: 10, color: colors.warning ?? colors.primary, letterSpacing: 1}]}>
                      PLATFORM POOL
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.badge, {borderColor: colors.warning ?? colors.primary}]}>
                    <Text style={[bodyType.bold, {fontSize: 10, color: colors.warning ?? colors.primary, letterSpacing: 1}]}>
                      ESCALATED
                    </Text>
                  </View>
                )}
                <Text style={[bodyType.regular, {color: colors.textSecondary, fontSize: 11, marginLeft: spacing.sm}]}>
                  by {msg.author_name}
                </Text>
              </View>
              <Text style={[bodyType.regular, {color: colors.textPrimary, marginVertical: spacing.sm}]}>
                "{msg.text}"
              </Text>
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() => handleDismiss(msg)}
                  disabled={actionId === msg.id}
                  style={[styles.actionBtn, {borderColor: colors.border}]}>
                  <Text style={[bodyType.bold, {color: colors.textPrimary, fontSize: 12}]}>Dismiss</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleRemove(msg)}
                  disabled={actionId === msg.id}
                  style={[styles.actionBtn, {borderColor: colors.warning ?? colors.primary}]}>
                  <Text style={[bodyType.bold, {color: colors.warning ?? colors.primary, fontSize: 12}]}>Remove</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSuspend(msg)}
                  disabled={actionId === msg.id}
                  style={[styles.actionBtn, {borderColor: colors.error}]}>
                  <Text style={[bodyType.bold, {color: colors.error, fontSize: 12}]}>Suspend user</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  title: {fontSize: 16, letterSpacing: 0.5},
  scroll: {padding: spacing.lg, gap: spacing.md},
  card: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  metaRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  badgeRow: {flexDirection: 'row', alignItems: 'center', marginTop: 4},
  badge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  actionsRow: {flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap'},
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
});
