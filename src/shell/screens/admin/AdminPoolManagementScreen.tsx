// AdminPoolManagementScreen — paginated list of every pool on the
// platform with filter chips + inline suspend/unsuspend. Per April 2026
// Super Admin spec §5.4.
//
// Filters: status (active / suspended / archived / hidden) and a free
// text search across pool name + competition. No detail screen for v1
// — the inline action sheet handles suspend/unsuspend, which covers
// the spec's primary use case. Member browsing of an arbitrary pool is
// rare enough that we can defer a dedicated detail screen.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ChevronLeft} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';

type PoolRow = {
  id: string;
  name: string | null;
  competition: string;
  is_suspended: boolean;
  is_archived: boolean;
  is_hidden_from_users: boolean;
  organizer_id: string | null;
  member_count: number;
};

type StatusFilter = 'all' | 'active' | 'suspended' | 'archived' | 'hidden';

export function AdminPoolManagementScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const profile = useGlobalStore(s => s.userProfile);

  const [pools, setPools] = useState<PoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    type Row = {
      id: string;
      name: string | null;
      competition: string;
      is_suspended: boolean;
      is_archived: boolean;
      is_hidden_from_users: boolean;
      organizer_id: string | null;
    };
    const {data} = await supabase
      .from('pools')
      .select('id, name, competition, is_suspended, is_archived, is_hidden_from_users, organizer_id')
      .is('deleted_at', null)
      .order('name', {ascending: true});

    const list = ((data ?? []) as Row[]).map(r => ({...r, member_count: 0}));

    // Member counts in parallel chunks
    await Promise.all(
      list.map(async p => {
        const {count} = await supabase
          .from('pool_members')
          .select('user_id', {count: 'exact', head: true})
          .eq('pool_id', p.id)
          .eq('status', 'active');
        p.member_count = count ?? 0;
      }),
    );

    setPools(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (profile?.is_super_admin) load();
  }, [profile?.is_super_admin, load]);

  const filtered = useMemo(() => {
    return pools.filter(p => {
      if (filter === 'active' && (p.is_suspended || p.is_archived)) return false;
      if (filter === 'suspended' && !p.is_suspended) return false;
      if (filter === 'archived' && !p.is_archived) return false;
      if (filter === 'hidden' && !p.is_hidden_from_users) return false;
      if (filter === 'all') {/* no status filter */}
      if (filter !== 'hidden' && p.is_hidden_from_users && filter !== 'all') {
        // Don't show hidden pools in active/suspended/archived buckets
        // unless explicitly viewing 'all' or 'hidden'.
        return false;
      }
      if (search.trim().length > 0) {
        const q = search.toLowerCase();
        const hit =
          (p.name ?? '').toLowerCase().includes(q) ||
          p.competition.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [pools, filter, search]);

  const handleAction = (p: PoolRow) => {
    const buttons: {text: string; onPress?: () => void; style?: 'destructive' | 'cancel'}[] = [];
    if (p.is_suspended) {
      buttons.push({
        text: 'Unsuspend',
        onPress: async () => {
          setActionId(p.id);
          const {data, error} = await supabase.functions.invoke('suspend-pool', {
            body: {pool_id: p.id, action: 'unsuspend', reason: 'Admin unsuspend'},
          });
          setActionId(null);
          if (error) return Alert.alert('Failed', error.message);
          const result = data as {error?: string};
          if (result?.error) return Alert.alert('Failed', result.error);
          load();
        },
      });
    } else if (!p.is_archived) {
      buttons.push({
        text: 'Suspend',
        style: 'destructive',
        onPress: () => {
          // Two-step: ask for a reason via a second alert.
          Alert.prompt(
            `Suspend ${p.name ?? 'this Contest'}?`,
            'The pool becomes read-only for all members. Required: short reason for the audit log.',
            [
              {text: 'Cancel', style: 'cancel'},
              {
                text: 'Suspend',
                style: 'destructive',
                onPress: async (reason?: string) => {
                  const r = (reason ?? '').trim();
                  if (r.length === 0) {
                    Alert.alert('Reason required');
                    return;
                  }
                  setActionId(p.id);
                  const {data, error} = await supabase.functions.invoke('suspend-pool', {
                    body: {pool_id: p.id, reason: r, action: 'suspend'},
                  });
                  setActionId(null);
                  if (error) return Alert.alert('Failed', error.message);
                  const result = data as {error?: string};
                  if (result?.error) return Alert.alert('Failed', result.error);
                  load();
                },
              },
            ],
            'plain-text',
          );
        },
      });
    }
    buttons.push({text: 'Cancel', style: 'cancel'});
    Alert.alert(p.name ?? '—', `${p.competition} · ${p.member_count} members`, buttons);
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
          POOL MANAGEMENT
        </Text>
        <View style={{width: 24}} />
      </View>

      <View style={{paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm}}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or competition"
          placeholderTextColor={colors.textTertiary}
          style={[styles.search, {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface}]}
          autoCorrect={false}
        />
        <View style={styles.filterRow}>
          {(['active', 'suspended', 'archived', 'hidden', 'all'] as StatusFilter[]).map(f => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.chip,
                {
                  backgroundColor: filter === f ? colors.primary : 'transparent',
                  borderColor: filter === f ? colors.primary : colors.border,
                },
              ]}>
              <Text
                style={[
                  bodyType.bold,
                  {fontSize: 11, color: filter === f ? colors.onPrimary : colors.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase'},
                ]}>
                {f}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{marginTop: spacing.xl}} />
      ) : filtered.length === 0 ? (
        <Text style={[bodyType.regular, {color: colors.textTertiary, padding: spacing.lg, textAlign: 'center'}]}>
          No pools match.
        </Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={p => p.id}
          contentContainerStyle={{padding: spacing.lg, gap: spacing.sm}}
          renderItem={({item: p}) => (
            <Pressable
              onPress={() => handleAction(p)}
              disabled={actionId === p.id}
              style={[styles.row, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <View style={{flex: 1, minWidth: 0}}>
                <Text style={[bodyType.bold, {color: colors.textPrimary}]} numberOfLines={1}>
                  {p.name ?? '—'}
                </Text>
                <Text style={[bodyType.regular, {color: colors.textSecondary, fontSize: 12, marginTop: 2}]} numberOfLines={1}>
                  {p.competition} · {p.member_count} members
                </Text>
              </View>
              <View style={styles.badgeStack}>
                {p.is_suspended && <Badge text="SUSPENDED" color={colors.error} />}
                {p.is_archived && <Badge text="ARCHIVED" color={colors.textTertiary} />}
                {p.is_hidden_from_users && <Badge text="HIDDEN" color={colors.warning ?? colors.primary} />}
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Badge({text, color}: {text: string; color: string}) {
  return (
    <View style={[styles.badge, {borderColor: color}]}>
      <Text style={{fontSize: 9, fontWeight: '700', color, letterSpacing: 0.8}}>{text}</Text>
    </View>
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
  search: {
    height: 40,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    fontSize: 14,
  },
  filterRow: {flexDirection: 'row', gap: 6, flexWrap: 'wrap'},
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  badgeStack: {alignItems: 'flex-end', gap: 4},
  badge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
});
