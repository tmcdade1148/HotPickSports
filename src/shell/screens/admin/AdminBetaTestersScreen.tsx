// AdminBetaTestersScreen — super-admin tool for managing the beta-tester
// allowlist on the gated nfl_2025_sim competition (and any future gated
// competition).
//
// Flow:
//   1. Fetch current testers via admin_list_beta_testers RPC
//   2. Add by email via admin_add_beta_tester_by_email RPC (resolves
//      email → user_id server-side, errors if no account exists)
//   3. Remove via admin_remove_beta_tester RPC
//
// Every action is audited server-side in admin_audit_log. Effects on
// the tester's device: nfl_2025_sim appears in their sport switcher +
// they force-land on it after next cold start. Removal hides it again.

import React, {useCallback, useEffect, useState} from 'react';
import {Text, TextInput} from '@shared/components/AppText';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ChevronLeft, Plus, RefreshCw, Trash2, Users} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';
import {RequireSuperAdmin} from '@shell/components/RequireSuperAdmin';

// Hardcoded for now — the only gated competition. When a second gated
// competition is added, this becomes a picker at the top of the screen.
const COMPETITION = 'nfl_2025_sim';
const COMPETITION_LABEL = 'NFL 2025 SIM';

type Tester = {user_id: string; email: string};

export function AdminBetaTestersScreen() {
  return (
    <RequireSuperAdmin>
      <AdminBetaTestersScreenImpl />
    </RequireSuperAdmin>
  );
}

function AdminBetaTestersScreenImpl() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const [testers, setTesters] = useState<Tester[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [busyEmail, setBusyEmail] = useState(false);
  const [busyRemoveId, setBusyRemoveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {data, error} = await supabase.rpc('admin_list_beta_testers', {
      p_competition: COMPETITION,
    });
    if (error) {
      Alert.alert('Could not load testers', error.message);
      setTesters([]);
    } else {
      setTesters((data ?? []) as Tester[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const email = emailInput.trim();
    if (!email) return;
    setBusyEmail(true);
    const {error} = await supabase.rpc('admin_add_beta_tester_by_email', {
      p_competition: COMPETITION,
      p_email: email,
    });
    setBusyEmail(false);
    if (error) {
      Alert.alert('Could not add', error.message);
      return;
    }
    setEmailInput('');
    await load();
  };

  const handleRemove = (tester: Tester) => {
    Alert.alert(
      'Remove tester',
      `Revoke ${tester.email}'s access to ${COMPETITION_LABEL}? They'll drop back to the public app on their next cold start. Their pool memberships aren't deleted.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyRemoveId(tester.user_id);
            const {error} = await supabase.rpc('admin_remove_beta_tester', {
              p_competition: COMPETITION,
              p_user_id: tester.user_id,
            });
            setBusyRemoveId(null);
            if (error) {
              Alert.alert('Could not remove', error.message);
              return;
            }
            await load();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.shell, {backgroundColor: colors.background}]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <ChevronLeft color={colors.textPrimary} size={24} />
        </Pressable>
        <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
          BETA TESTERS
        </Text>
        <Pressable onPress={load} hitSlop={8}>
          <RefreshCw color={colors.textSecondary} size={20} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={[styles.contextCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Users size={18} color={colors.primary} />
            <View style={{flex: 1}}>
              <Text style={[bodyType.bold, {color: colors.textPrimary, fontSize: 13}]}>
                {COMPETITION_LABEL}
              </Text>
              <Text style={[bodyType.regular, {color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16}]}>
                Hidden from the public app. Listed users see it in the sport switcher and force-land on it after their next cold start.
              </Text>
            </View>
          </View>

          {/* Add by email */}
          <View style={[styles.addCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.bold, styles.sectionLabel, {color: colors.textSecondary}]}>
              ADD A TESTER
            </Text>
            <View style={styles.addRow}>
              <TextInput
                value={emailInput}
                onChangeText={setEmailInput}
                placeholder="tester@example.com"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!busyEmail}
                style={[styles.input, {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                }]}
                onSubmitEditing={handleAdd}
              />
              <Pressable
                onPress={handleAdd}
                disabled={!emailInput.trim() || busyEmail}
                style={({pressed}) => [
                  styles.addBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: !emailInput.trim() || busyEmail ? 0.4 : pressed ? 0.85 : 1,
                  },
                ]}>
                {busyEmail
                  ? <ActivityIndicator color={colors.onPrimary} size="small" />
                  : <Plus size={18} color={colors.onPrimary} strokeWidth={2.5} />}
              </Pressable>
            </View>
            <Text style={[bodyType.regular, styles.hint, {color: colors.textTertiary}]}>
              Must match an existing account email. Errors if no user found.
            </Text>
          </View>

          {/* Current list */}
          <Text style={[bodyType.bold, styles.sectionLabel, {color: colors.textSecondary, marginTop: spacing.lg, marginLeft: spacing.xs}]}>
            CURRENT TESTERS ({testers.length})
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{marginTop: spacing.lg}} />
          ) : testers.length === 0 ? (
            <Text style={[bodyType.regular, {color: colors.textTertiary, padding: spacing.md, textAlign: 'center'}]}>
              No testers on the allowlist yet.
            </Text>
          ) : (
            testers.map(t => (
              <View
                key={t.user_id}
                style={[styles.row, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text
                    style={[bodyType.bold, {color: colors.textPrimary, fontSize: 14}]}
                    numberOfLines={1}>
                    {t.email}
                  </Text>
                  <Text
                    style={[bodyType.regular, {color: colors.textTertiary, fontSize: 11, marginTop: 2}]}
                    numberOfLines={1}>
                    {t.user_id}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleRemove(t)}
                  disabled={busyRemoveId === t.user_id}
                  hitSlop={8}
                  style={({pressed}) => [
                    styles.removeBtn,
                    {borderColor: colors.error, opacity: pressed ? 0.7 : 1},
                  ]}>
                  {busyRemoveId === t.user_id
                    ? <ActivityIndicator color={colors.error} size="small" />
                    : <Trash2 size={16} color={colors.error} strokeWidth={2.25} />}
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  scroll: {padding: spacing.lg, gap: spacing.sm},
  contextCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  addCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  sectionLabel: {fontSize: 10, letterSpacing: 1.5},
  addRow: {flexDirection: 'row', gap: spacing.sm, alignItems: 'center'},
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    fontSize: 14,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {fontSize: 11, lineHeight: 15},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
