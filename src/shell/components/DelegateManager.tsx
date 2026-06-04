// DelegateManager — the "add people who help you run this" control, shared by
// League Tools (Chairman adds Directors) and Gaffer Tools (Gaffer adds
// Assistant Gaffers). Both are the same primitive: the pool's organizer
// grants `admin` to an email. Only the organizer (canManage) sees the
// add/remove controls; delegates can view the list.
//
// Adding an email that isn't a HotPick user yet parks a pending grant; the
// role attaches when that person signs up with that exact email (server-side
// claim trigger). Pending rows render with a "Pending" badge.

import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Clock, UserPlus, X} from 'lucide-react-native';
import {useGlobalStore, PoolDelegate} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {roleLabel} from '@shared/lexicon';

interface Props {
  poolId: string;
  /** League tier → Director vocabulary; otherwise Assistant Gaffer. */
  isLeagueTier: boolean;
  /** True when the viewer is the organizer (Chairman/Gaffer) of this pool. */
  canManage: boolean;
}

function mapError(code: string | undefined, label: string): string {
  switch (code) {
    case 'NOT_ORGANIZER':
      return `Only the owner can add ${label}s.`;
    case 'EMPTY_EMAIL':
      return 'Enter an email address.';
    case 'ALREADY_ORGANIZER':
      return `That person already runs this — they can't also be ${label === 'Director' ? 'a' : 'an'} ${label}.`;
    default:
      return code ?? 'Something went wrong. Please try again.';
  }
}

export function DelegateManager({poolId, isLeagueTier, canManage}: Props) {
  const {colors} = useTheme();
  const listPoolDelegates = useGlobalStore(s => s.listPoolDelegates);
  const grantPoolDelegate = useGlobalStore(s => s.grantPoolDelegate);
  const revokePoolDelegate = useGlobalStore(s => s.revokePoolDelegate);

  const [rows, setRows] = useState<PoolDelegate[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const label = roleLabel('admin', isLeagueTier); // Director | Assistant Gaffer

  const load = useCallback(async () => {
    setLoading(true);
    const data = await listPoolDelegates(poolId);
    setRows(data);
    setLoading(false);
  }, [poolId, listPoolDelegates]);

  useEffect(() => {
    load();
  }, [load]);

  const onAdd = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    const res = await grantPoolDelegate(poolId, trimmed);
    setSubmitting(false);
    if (!res.success) {
      Alert.alert('Could Not Add', mapError(res.error, label));
      return;
    }
    setEmail('');
    Alert.alert(
      res.pending ? `${label} Invited` : `${label} Added`,
      res.pending
        ? `${trimmed} isn't on HotPick yet. They'll get ${label} access automatically when they create an account with that exact email.`
        : `${trimmed} now has ${label} access.`,
    );
    load();
  };

  const onRemove = (row: PoolDelegate) => {
    const who = row.email ?? 'this person';
    Alert.alert(
      `Remove ${label}?`,
      row.status === 'pending'
        ? `Cancel the pending ${label} invite for ${who}?`
        : `${who} will lose ${label} access. They keep their picks and standings.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const res = await revokePoolDelegate(
              poolId,
              row.status === 'pending'
                ? {email: row.email ?? undefined}
                : {userId: row.userId ?? undefined},
            );
            if (!res.success) {
              Alert.alert('Error', res.error ?? 'Failed to remove.');
              return;
            }
            load();
          },
        },
      ],
    );
  };

  // The organizer (Chairman/Gaffer) themselves is shown by the host screen;
  // this manager lists the delegates (admins + pending).
  const delegates = rows.filter(r => r.role === 'admin');

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.bold, styles.title, {color: colors.textPrimary}]}>
        {label}s
      </Text>
      <Text style={[bodyType.regular, styles.hint, {color: colors.textSecondary}]}>
        {label}s get the same tools you do, except adding other {label}s.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{marginVertical: spacing.md}} />
      ) : delegates.length === 0 ? (
        <Text style={[bodyType.regular, styles.empty, {color: colors.textTertiary}]}>
          No {label}s yet.
        </Text>
      ) : (
        delegates.map((row, i) => (
          <View
            key={`${row.userId ?? row.email ?? i}`}
            style={[styles.row, {borderColor: colors.border}]}>
            <View style={styles.rowLeft}>
              <Text
                style={[bodyType.regular, {color: colors.textPrimary}]}
                numberOfLines={1}>
                {row.email ?? '—'}
              </Text>
              {row.status === 'pending' && (
                <View style={[styles.pendingPill, {backgroundColor: colors.surfaceElevated}]}>
                  <Clock size={11} color={colors.textSecondary} strokeWidth={2.5} />
                  <Text style={[bodyType.bold, styles.pendingText, {color: colors.textSecondary}]}>
                    Pending
                  </Text>
                </View>
              )}
            </View>
            {canManage && (
              <Pressable
                onPress={() => onRemove(row)}
                hitSlop={8}
                accessibilityLabel={`Remove ${row.email ?? label}`}>
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        ))
      )}

      {canManage && (
        <View style={styles.addRow}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={`Email to add as ${label}`}
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            style={[
              bodyType.regular,
              styles.input,
              {borderColor: colors.border, color: colors.textPrimary},
            ]}
          />
          <Pressable
            onPress={onAdd}
            disabled={submitting || email.trim().length === 0}
            style={[
              styles.addBtn,
              {backgroundColor: colors.primary},
              (submitting || email.trim().length === 0) && {opacity: 0.5},
            ]}>
            {submitting ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <UserPlus size={16} color={colors.onPrimary} />
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {marginTop: spacing.md},
  title: {fontSize: 15, marginBottom: spacing.xs},
  hint: {fontSize: 13, marginBottom: spacing.sm},
  empty: {fontSize: 13, marginBottom: spacing.sm},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.sm},
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  pendingText: {fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4},
  addRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md},
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
