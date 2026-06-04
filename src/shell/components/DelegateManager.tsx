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
type DelegateTarget =
  | {kind: 'pool'; poolId: string}
  | {kind: 'partner'; partnerId: string};

interface Props {
  /** What the delegates attach to: a Contest (pool) or a League (partner). */
  target: DelegateTarget;
  /** Singular delegate-role label, e.g. "Assistant Gaffer" | "Director". */
  roleNoun: string;
  /** Which role value counts as a delegate row in the list. */
  delegateRole: 'admin' | 'director';
  /** True when the viewer may add/remove (Gaffer for a Contest, Chairman for a League). */
  canManage: boolean;
  /** Render the component's own title + hint. Set false when the host
   *  screen supplies a section header in its own style. Defaults true. */
  showHeader?: boolean;
}

function mapError(code: string | undefined, label: string): string {
  switch (code) {
    case 'NOT_ORGANIZER':
    case 'NOT_CHAIRMAN':
      return `Only the owner can add ${label}s.`;
    case 'EMPTY_EMAIL':
      return 'Enter an email address.';
    case 'ALREADY_ORGANIZER':
      return `That person already runs this — they can't also be ${label === 'Director' ? 'a' : 'an'} ${label}.`;
    default:
      return code ?? 'Something went wrong. Please try again.';
  }
}

export function DelegateManager({target, roleNoun, delegateRole, canManage, showHeader = true}: Props) {
  const {colors} = useTheme();
  const listPoolDelegates = useGlobalStore(s => s.listPoolDelegates);
  const grantPoolDelegate = useGlobalStore(s => s.grantPoolDelegate);
  const revokePoolDelegate = useGlobalStore(s => s.revokePoolDelegate);
  const listPartnerMembers = useGlobalStore(s => s.listPartnerMembers);
  const grantPartnerDirector = useGlobalStore(s => s.grantPartnerDirector);
  const revokePartnerMember = useGlobalStore(s => s.revokePartnerMember);

  const [rows, setRows] = useState<PoolDelegate[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const label = roleNoun;
  const targetId = target.kind === 'pool' ? target.poolId : target.partnerId;

  const load = useCallback(async () => {
    setLoading(true);
    const data =
      target.kind === 'pool'
        ? await listPoolDelegates(target.poolId)
        : await listPartnerMembers(target.partnerId);
    setRows(data);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, targetId, listPoolDelegates, listPartnerMembers]);

  useEffect(() => {
    load();
  }, [load]);

  const onAdd = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    const res =
      target.kind === 'pool'
        ? await grantPoolDelegate(target.poolId, trimmed)
        : await grantPartnerDirector(target.partnerId, trimmed);
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
        : `${who} will lose ${label} access.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const arg =
              row.status === 'pending'
                ? {email: row.email ?? undefined}
                : {userId: row.userId ?? undefined};
            const res =
              target.kind === 'pool'
                ? await revokePoolDelegate(target.poolId, arg)
                : await revokePartnerMember(target.partnerId, arg);
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

  // The owner (Chairman/Gaffer) is shown by the host screen; this manager
  // lists the delegates (Directors / Assistant Gaffers + pending).
  const delegates = rows.filter(r => r.role === delegateRole);

  return (
    <View style={styles.wrap}>
      {showHeader && (
        <>
          <Text style={[bodyType.bold, styles.title, {color: colors.textPrimary}]}>
            {label}s
          </Text>
          <Text style={[bodyType.regular, styles.hint, {color: colors.textSecondary}]}>
            {label}s get the same tools you do, except adding other {label}s.
          </Text>
        </>
      )}

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
