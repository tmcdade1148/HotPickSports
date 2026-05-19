import React, {useState, useMemo, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import {
  ChevronLeft,
  Copy,
  Share2,
  Archive,
  Globe,
  Award,
  Megaphone,
  AlertTriangle,
  Plus,
  Star,
  Users,
  XCircle,
} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {BroadcastComposer} from '@shell/components/BroadcastComposer';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';
import type {BrandConfig} from '@shell/theme/types';
import {HOTPICK_DEFAULTS} from '@shell/theme/defaults';

interface InviteCodeRow {
  id: string;
  code: string;
  label: string | null;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
}

export function PoolSettingsScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const poolId = route.params?.poolId as string;

  const userPools = useGlobalStore(s => s.userPools);
  const poolMembers = useGlobalStore(s => s.poolMembers);
  const updatePoolSettings = useGlobalStore(s => s.updatePoolSettings);
  const archivePool = useGlobalStore(s => s.archivePool);

  const pool = useMemo(
    () => userPools.find(p => p.id === poolId),
    [userPools, poolId],
  );

  const poolBrand = useMemo(() => {
    const bc = pool?.brand_config as unknown as BrandConfig | null | undefined;
    return bc?.is_branded ? bc : null;
  }, [pool]);
  const accentColor = poolBrand?.secondary_color ?? HOTPICK_DEFAULTS.primary_color;

  const [poolName, setPoolName] = useState(pool?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [broadcastVisible, setBroadcastVisible] = useState(false);

  // Invite codes — full list for this pool. Only organizers can read these
  // (RLS policy on pool_invite_codes). Writes go through SECURITY DEFINER RPCs.
  const [codes, setCodes] = useState<InviteCodeRow[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addingCode, setAddingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const fetchCodes = useCallback(async () => {
    if (!poolId) return;
    setCodesLoading(true);
    const {data} = await supabase
      .from('pool_invite_codes')
      .select('id, code, label, is_primary, is_active, created_at')
      .eq('pool_id', poolId)
      .eq('is_active', true)
      .order('is_primary', {ascending: false})
      .order('created_at', {ascending: true});
    setCodes((data ?? []) as InviteCodeRow[]);
    setCodesLoading(false);
  }, [poolId]);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  if (!pool) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <ChevronLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pool Settings</Text>
          <View style={{width: 24}} />
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Pool not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasNameChanged = poolName.trim() !== pool.name;
  const memberCount = poolMembers.length;
  const startDate = new Date(pool.pool_start_date).toLocaleDateString(
    undefined,
    {month: 'long', day: 'numeric', year: 'numeric'},
  );

  const handleSaveName = async () => {
    if (!hasNameChanged) return;
    setSaving(true);
    const result = await updatePoolSettings(poolId, {
      name: poolName.trim(),
    });
    setSaving(false);
    if (result.success) {
      Alert.alert('Saved', 'Pool name updated.');
    } else {
      Alert.alert('Error', result.error ?? 'Failed to update pool name');
    }
  };

  const handleAddCode = async () => {
    setCodeError(null);
    const normalized = newCode.toUpperCase().replace(/[\s-]/g, '');
    if (normalized.length < 6 || normalized.length > 12) {
      setCodeError('Code must be 6–12 characters.');
      return;
    }
    if (!/^[0-9A-Z]+$/.test(normalized)) {
      setCodeError('Letters and numbers only.');
      return;
    }
    setAddingCode(true);
    const {data, error} = await supabase.rpc('add_pool_invite_code', {
      p_pool_id: poolId,
      p_code: normalized,
      p_label: newLabel.trim() || null,
      p_is_primary: false,
    });
    setAddingCode(false);
    if (error || data?.error) {
      const msg = data?.error === 'CODE_TAKEN'
        ? 'That code is already in use. Try another.'
        : data?.error === 'INVALID_CODE'
          ? 'Code must be 6–12 letters and numbers.'
          : data?.error === 'NOT_ORGANIZER'
            ? 'Only the organizer can add codes.'
            : (error?.message ?? 'Could not add code.');
      setCodeError(msg);
      return;
    }
    setNewCode('');
    setNewLabel('');
    fetchCodes();
  };

  const handleSetPrimary = async (codeId: string) => {
    const {data, error} = await supabase.rpc('set_pool_invite_code_primary', {
      p_code_id: codeId,
    });
    if (error || data?.error) {
      Alert.alert('Error', error?.message ?? data?.error ?? 'Could not set primary.');
      return;
    }
    fetchCodes();
  };

  const handleDeactivateCode = (row: InviteCodeRow) => {
    if (row.is_primary) {
      Alert.alert(
        'Cannot deactivate primary',
        'Set another code as primary first, then you can deactivate this one.',
      );
      return;
    }
    Alert.alert(
      'Deactivate code?',
      `"${row.code}" will stop working immediately. This cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            const {data, error} = await supabase.rpc(
              'deactivate_pool_invite_code',
              {p_code_id: row.id},
            );
            if (error || data?.error) {
              Alert.alert('Error', error?.message ?? data?.error ?? 'Could not deactivate.');
              return;
            }
            fetchCodes();
          },
        },
      ],
    );
  };

  const handleCopyAnyCode = (code: string) => {
    Clipboard.setString(code);
    Alert.alert('Copied', `${code} copied to clipboard.`);
  };

  const handleShareAnyCode = async (code: string) => {
    try {
      await Share.share({
        message: `Join my pool "${pool!.name}" on HotPick Sports! Use invite code: ${code}`,
      });
    } catch {
      // user cancelled
    }
  };

  const handleArchive = () => {
    Alert.alert(
      'Archive Pool',
      `Archive "${pool.name}"? Members will no longer see this pool in their active list. This can be reversed.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            const result = await archivePool(poolId);
            if (result.success) {
              navigation.goBack();
            } else {
              Alert.alert(
                'Error',
                result.error ?? 'Failed to archive pool',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <ChevronLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pool Settings</Text>
          <View style={{width: 24}} />
        </View>

        {/* Pool Name */}
        <Text style={styles.sectionTitle}>Pool Name</Text>
        <View style={styles.nameRow}>
          <TextInput
            style={styles.nameInput}
            value={poolName}
            onChangeText={setPoolName}
            maxLength={30}
            placeholder="Pool name"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="done"
            onSubmitEditing={handleSaveName}
          />
          {hasNameChanged && (
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSaveName}
              disabled={saving}>
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Invite Codes — list view, multiple codes per pool. */}
        {!pool.is_global && (
          <>
            <Text style={styles.sectionTitle}>Invite Codes</Text>
            {codesLoading && codes.length === 0 ? (
              <Text style={styles.codesHint}>Loading…</Text>
            ) : codes.length === 0 ? (
              <Text style={styles.codesHint}>No active invite codes yet.</Text>
            ) : (
              codes.map(row => (
                <View key={row.id} style={styles.codeCard}>
                  <View style={styles.codeHeaderRow}>
                    <Text style={[styles.codeText, {color: accentColor}]}>
                      {row.code}
                    </Text>
                    {row.is_primary && (
                      <View style={[styles.primaryBadge, {borderColor: accentColor}]}>
                        <Star size={10} color={accentColor} />
                        <Text style={[styles.primaryBadgeText, {color: accentColor}]}>
                          PRIMARY
                        </Text>
                      </View>
                    )}
                  </View>
                  {row.label && (
                    <Text style={styles.codeLabel}>{row.label}</Text>
                  )}
                  <View style={styles.codeActions}>
                    <TouchableOpacity
                      style={[styles.codeButton, {borderColor: accentColor}]}
                      onPress={() => handleCopyAnyCode(row.code)}>
                      <Copy size={14} color={accentColor} />
                      <Text style={[styles.codeButtonText, {color: accentColor}]}>Copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.codeButton, {borderColor: accentColor}]}
                      onPress={() => handleShareAnyCode(row.code)}>
                      <Share2 size={14} color={accentColor} />
                      <Text style={[styles.codeButtonText, {color: accentColor}]}>Share</Text>
                    </TouchableOpacity>
                    {!row.is_primary && (
                      <>
                        <TouchableOpacity
                          style={[styles.codeButton, {borderColor: accentColor}]}
                          onPress={() => handleSetPrimary(row.id)}>
                          <Star size={14} color={accentColor} />
                          <Text style={[styles.codeButtonText, {color: accentColor}]}>
                            Make primary
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.codeButton, {borderColor: colors.error}]}
                          onPress={() => handleDeactivateCode(row)}>
                          <XCircle size={14} color={colors.error} />
                          <Text style={[styles.codeButtonText, {color: colors.error}]}>
                            Deactivate
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              ))
            )}

            {/* Add new code */}
            <View style={styles.addCodeCard}>
              <Text style={styles.addCodeTitle}>Add another code</Text>
              <Text style={styles.codesHint}>
                6–12 letters and numbers. Memorable codes work better on signage
                — e.g. WINGS26, BARNIGHT, MAIN.
              </Text>
              <TextInput
                style={styles.addCodeInput}
                value={newCode}
                onChangeText={text =>
                  setNewCode(text.toUpperCase().replace(/[\s-]/g, ''))
                }
                placeholder="WINGS26"
                placeholderTextColor={colors.textSecondary}
                maxLength={12}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TextInput
                style={styles.addCodeInput}
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder='Label (optional, e.g. "Bar night poster")'
                placeholderTextColor={colors.textSecondary}
                maxLength={40}
              />
              {codeError && <Text style={styles.codeErrorText}>{codeError}</Text>}
              <TouchableOpacity
                style={[
                  styles.addCodeButton,
                  {backgroundColor: accentColor},
                  (addingCode || newCode.length < 6) && styles.codeButtonDisabled,
                ]}
                onPress={handleAddCode}
                disabled={addingCode || newCode.length < 6}>
                <Plus size={14} color={colors.onPrimary} />
                <Text style={[styles.addCodeButtonText, {color: colors.onPrimary}]}>
                  {addingCode ? 'Adding…' : 'Add code'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Pool Info */}
        <Text style={styles.sectionTitle}>Pool Info</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Members</Text>
            <Text style={styles.infoValue}>{memberCount}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Member Limit</Text>
            <Text style={styles.infoValue}>
              {pool.member_limit ?? 'Unlimited'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Start Date</Text>
            <Text style={styles.infoValue}>{startDate}</Text>
          </View>
          {pool.is_founding_pool && (
            <View style={styles.foundingBadge}>
              <Award size={14} color={colors.primary} />
              <Text style={styles.foundingText}>Founding Pool</Text>
            </View>
          )}
        </View>

        {/* Privacy label — switch hidden; pools are always private at launch */}
        <View style={styles.toggleRow}>
          <Globe size={18} color={colors.textSecondary} />
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>Private Pool</Text>
            <Text style={styles.toggleDesc}>
              Only people with the invite code can join
            </Text>
          </View>
        </View>

        {/* Communication & Moderation */}
        <Text style={styles.sectionTitle}>Communication</Text>
        <TouchableOpacity
          style={[styles.broadcastButton, {borderColor: accentColor}]}
          onPress={() => setBroadcastVisible(true)}>
          <Megaphone size={18} color={accentColor} />
          <Text style={[styles.broadcastText, {color: accentColor}]}>Send Broadcast</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Partner</Text>
        <TouchableOpacity
          style={[styles.broadcastButton, {borderColor: colors.primary}]}
          onPress={() => navigation.navigate('PartnerDirectory', {poolId})}>
          <Users size={18} color={colors.primary} />
          <Text style={[styles.broadcastText, {color: colors.primary}]}>
            {pool.partner_id ? 'Change roster alignment' : 'Align with a partner'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Moderation</Text>
        <TouchableOpacity
          style={[styles.broadcastButton, {borderColor: colors.warning}]}
          onPress={() => navigation.navigate('FlaggedMessages', {poolId})}>
          <AlertTriangle size={18} color={colors.warning} />
          <Text style={[styles.broadcastText, {color: colors.warning}]}>Flagged Messages</Text>
        </TouchableOpacity>

        {/* Danger Zone */}
        <Text style={[styles.sectionTitle, styles.dangerTitle]}>
          Danger Zone
        </Text>
        <TouchableOpacity style={styles.archiveButton} onPress={handleArchive}>
          <Archive size={18} color={colors.error} />
          <Text style={styles.archiveText}>Archive Pool</Text>
        </TouchableOpacity>
      </ScrollView>

      <BroadcastComposer
        poolId={poolId}
        poolName={pool.name}
        visible={broadcastVisible}
        onClose={() => setBroadcastVisible(false)}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
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
    color: colors.textPrimary,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  // Invite-code list
  codeCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  codeText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  primaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  primaryBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  codeLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  codeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.xs,
  },
  codeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  codeButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  codeButtonDisabled: {
    opacity: 0.5,
  },
  codesHint: {
    fontSize: 12,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  addCodeCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    gap: spacing.sm,
  },
  addCodeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  addCodeInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeErrorText: {
    fontSize: 12,
    color: colors.error,
  },
  addCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  addCodeButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  foundingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  foundingText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  toggleDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  toggleIndicator: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleIndicatorOn: {
    backgroundColor: colors.primary,
  },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.onPrimary,
  },
  toggleDotOn: {
    alignSelf: 'flex-end',
  },
  broadcastButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
  },
  broadcastText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  dangerTitle: {
    color: colors.error,
    marginTop: spacing.xl,
  },
  archiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.error,
    marginHorizontal: spacing.lg,
  },
  archiveText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
