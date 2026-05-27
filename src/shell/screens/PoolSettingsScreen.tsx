import React, {useState, useMemo, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
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
  X,
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
  // Club Rosters section reads + writes through the affiliations slice
  // so the home screen + Contest cards see updates without an extra
  // round-trip.
  const poolAffiliationsMap = useGlobalStore(s => s.poolAffiliations);
  const loadPoolAffiliationsFn = useGlobalStore(s => s.loadPoolAffiliations);
  const partnersById = useGlobalStore(s => s.partnersById);
  const owningClub = useGlobalStore(s => {
    const p = s.userPools.find(x => x.id === poolId);
    return p?.owning_club_id ? s.partnersById?.[p.owning_club_id] : null;
  });

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

  // Partner perk + broadcast — only when pool.partner_id is set. The
  // organizer of a partner-aligned pool is the de facto Partner Admin
  // for that partner; update_partner_perk RPC and the
  // send-partner-broadcast Edge Function authorize on the same shape.
  const [partnerRow, setPartnerRow] = useState<{
    id: string;
    name: string;
    perk_text: string | null;
    perk_icon: string | null;
    club_pool_id: string | null;
  } | null>(null);
  const [perkText, setPerkText] = useState('');
  const [perkIcon, setPerkIcon] = useState('');
  const [perkSaving, setPerkSaving] = useState(false);
  const [partnerBroadcastVisible, setPartnerBroadcastVisible] = useState(false);
  const [partnerBroadcastMessage, setPartnerBroadcastMessage] = useState('');
  const [partnerBroadcastSending, setPartnerBroadcastSending] = useState(false);

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

  // Pull this pool's affiliations into the store on mount so the
  // Club Rosters section renders the live list. The store loader
  // dedupes per pool so calling it here is cheap on re-mount.
  useEffect(() => {
    if (poolId) loadPoolAffiliationsFn([poolId]).catch(() => {});
  }, [poolId, loadPoolAffiliationsFn]);

  useEffect(() => {
    if (!pool?.partner_id) {
      setPartnerRow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const {data} = await supabase
        .from('partners')
        .select('id, name, perk_text, perk_icon, club_pool_id')
        .eq('id', pool.partner_id)
        .maybeSingle();
      if (cancelled || !data) return;
      setPartnerRow(data as any);
      setPerkText(data.perk_text ?? '');
      setPerkIcon(data.perk_icon ?? '');
    })();
    return () => {
      cancelled = true;
    };
  }, [pool?.partner_id]);

  const perkDirty =
    partnerRow !== null &&
    (perkText.trim() !== (partnerRow.perk_text ?? '') ||
      perkIcon.trim() !== (partnerRow.perk_icon ?? ''));

  const handleSavePerk = async () => {
    if (!partnerRow || !perkDirty) return;
    if (perkText.length > 120) {
      Alert.alert('Perk too long', 'Max 120 characters.');
      return;
    }
    setPerkSaving(true);
    const {error} = await supabase.rpc('update_partner_perk', {
      p_partner_id: partnerRow.id,
      p_perk_text: perkText.trim().length === 0 ? null : perkText.trim(),
      p_perk_icon: perkIcon.trim().length === 0 ? null : perkIcon.trim(),
    });
    setPerkSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setPartnerRow(prev =>
      prev
        ? {
            ...prev,
            perk_text: perkText.trim() || null,
            perk_icon: perkIcon.trim() || null,
          }
        : prev,
    );
    Alert.alert('Saved', `${partnerRow.name}'s perk updated.`);
  };

  const handleSendPartnerBroadcast = async () => {
    if (!partnerRow) return;
    const message = partnerBroadcastMessage.trim();
    if (message.length === 0) return;
    setPartnerBroadcastSending(true);
    const {data, error} = await supabase.functions.invoke('send-partner-broadcast', {
      body: {partner_id: partnerRow.id, message},
    });
    setPartnerBroadcastSending(false);
    if (error) {
      Alert.alert('Could not send', error.message ?? 'Unknown error');
      return;
    }
    setPartnerBroadcastVisible(false);
    setPartnerBroadcastMessage('');
    Alert.alert(
      'Broadcast sent',
      `Reached ${data?.recipient_count ?? '—'} ${
        (data?.recipient_count ?? 0) === 1 ? 'person' : 'people'
      } on ${partnerRow.name}'s roster.`,
    );
  };

  if (!pool) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <ChevronLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Contest Settings</Text>
          <View style={{width: 24}} />
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Contest not found</Text>
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
      Alert.alert('Saved', 'Contest name updated.');
    } else {
      Alert.alert('Error', result.error ?? 'Failed to update Contest name');
    }
  };

  // Remove a Club from this Contest's roster. Confirms first; the
  // store's loader is then re-run so the list re-paints in place.
  const [removingPartnerId, setRemovingPartnerId] = useState<string | null>(null);
  const handleRemoveAffiliation = (partnerId: string, partnerName: string) => {
    Alert.alert(
      `Remove ${partnerName}?`,
      `Your Contest will leave ${partnerName}'s roster. You can re-affiliate any time.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingPartnerId(partnerId);
            const {error} = await supabase.rpc('remove_pool_affiliation', {
              p_pool_id:    poolId,
              p_partner_id: partnerId,
            });
            setRemovingPartnerId(null);
            if (error) {
              Alert.alert('Could not remove', error.message);
              return;
            }
            loadPoolAffiliationsFn([poolId]).catch(() => {});
          },
        },
      ],
    );
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
            ? 'Only the Gaffer can add codes.'
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
        message: `Join my Contest "${pool!.name}" on HotPick Sports! Use invite code: ${code}`,
      });
    } catch {
      // user cancelled
    }
  };

  const handleArchive = () => {
    Alert.alert(
      'Archive Contest',
      `Archive "${pool.name}"? Members will no longer see this Contest in their active list. This can be reversed.`,
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
                result.error ?? 'Failed to archive Contest',
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
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <ChevronLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Contest Settings</Text>
          <View style={{width: 24}} />
        </View>

        {/* Pool Name */}
        <Text style={styles.sectionTitle}>Contest Name</Text>
        <View style={styles.nameRow}>
          <TextInput
            style={styles.nameInput}
            value={poolName}
            onChangeText={setPoolName}
            maxLength={30}
            placeholder="Contest name"
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

        {/* CLUB ROSTERS — moved here from below Communication so it
            sits with the other Contest identity controls (name lives
            in the row above; "which Clubs does this Contest belong to"
            is conceptually the next thing). */}
        <Text style={styles.sectionTitle}>Club Rosters</Text>
        {/* Official Club Contest: the owning Club is non-removable;
            shown as a pinned pill at the top of the list. Additional
            affiliations are blocked at the RPC level (POOL_IS_OFFICIAL),
            so we hide the Add button below for these pools. */}
        {pool.owning_club_id && owningClub && (
          <View style={[styles.clubPillRow, {borderColor: colors.border, backgroundColor: colors.surface}]}>
            <Text style={[styles.clubPillName, {color: colors.textPrimary}]} numberOfLines={1}>
              {owningClub.name}
            </Text>
            <Text style={[styles.clubPillBadge, {color: colors.textTertiary}]}>OWNING CLUB</Text>
          </View>
        )}
        {!pool.owning_club_id && (poolAffiliationsMap[poolId] ?? []).map(aff => {
          const live = partnersById[aff.partnerId];
          const displayName = live?.name ?? aff.partnerName;
          const isRemoving = removingPartnerId === aff.partnerId;
          return (
            <View
              key={aff.partnerId}
              style={[styles.clubPillRow, {borderColor: colors.border, backgroundColor: colors.surface}]}>
              <Text style={[styles.clubPillName, {color: colors.textPrimary}]} numberOfLines={1}>
                {displayName}
              </Text>
              {aff.isPrimary && (
                <Text style={[styles.clubPillBadge, {color: colors.textTertiary}]}>LEAD</Text>
              )}
              <TouchableOpacity
                onPress={() => handleRemoveAffiliation(aff.partnerId, displayName)}
                disabled={isRemoving}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                style={styles.clubPillRemove}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${displayName} affiliation`}>
                {isRemoving ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <X size={16} color={colors.error} strokeWidth={2.25} />
                )}
              </TouchableOpacity>
            </View>
          );
        })}
        {!pool.owning_club_id && (
          <TouchableOpacity
            style={[styles.broadcastButton, {borderColor: colors.primary}]}
            onPress={() => navigation.navigate('PartnerDirectory', {poolId})}>
            <Users size={18} color={colors.primary} />
            <Text style={[styles.broadcastText, {color: colors.primary}]}>
              Add/Edit Clubs
            </Text>
          </TouchableOpacity>
        )}

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
        <Text style={styles.sectionTitle}>Contest Info</Text>
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
              <Text style={styles.foundingText}>Founding Contest</Text>
            </View>
          )}
        </View>

        {/* Privacy label — switch hidden; pools are always private at launch */}
        <View style={styles.toggleRow}>
          <Globe size={18} color={colors.textSecondary} />
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>Private Contest</Text>
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

        {/* Club Pool admin: perk editor + broadcast button live here.
            The roster *list* (above, under Contest Name) handles
            "which Clubs is this Contest affiliated with" — these
            controls are exclusively for the Club admin running their
            own Club Pool. */}

        {pool.partner_id && partnerRow && partnerRow.club_pool_id === pool.id && (
          <View style={styles.partnerCard}>
            <Text style={styles.partnerCardTitle}>
              {partnerRow.name} perk
            </Text>
            <Text style={styles.partnerCardHint}>
              Shows on every Contest on {partnerRow.name}'s roster. Max 120 chars.
            </Text>
            <View style={styles.perkInputRow}>
              <TextInput
                style={styles.perkIconInput}
                value={perkIcon}
                onChangeText={setPerkIcon}
                placeholder="🎁"
                placeholderTextColor={colors.textSecondary}
                maxLength={16}
              />
              <TextInput
                style={styles.perkTextInput}
                value={perkText}
                onChangeText={text => {
                  if (text.length <= 120) setPerkText(text);
                }}
                placeholder="$1 off any draft, Sundays."
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={120}
              />
            </View>
            <Text style={styles.perkCharCount}>{perkText.length}/120</Text>
            <TouchableOpacity
              style={[
                styles.perkSaveButton,
                (!perkDirty || perkSaving) && styles.perkSaveButtonDisabled,
              ]}
              onPress={handleSavePerk}
              disabled={!perkDirty || perkSaving}>
              {perkSaving ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={styles.perkSaveText}>Save Perk</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {pool.partner_id && partnerRow && partnerRow.club_pool_id === pool.id && (
          <TouchableOpacity
            style={[styles.broadcastButton, {borderColor: accentColor}]}
            onPress={() => {
              setPartnerBroadcastMessage('');
              setPartnerBroadcastVisible(true);
            }}>
            <Megaphone size={18} color={accentColor} />
            <Text style={[styles.broadcastText, {color: accentColor}]}>
              Send {partnerRow.name} Broadcast
            </Text>
          </TouchableOpacity>
        )}

        {/* "Add/Edit Clubs" button now lives in the Club Rosters section
            at the top of the screen — removed from here. */}

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
          <Text style={styles.archiveText}>Archive Contest</Text>
        </TouchableOpacity>
      </ScrollView>

      <BroadcastComposer
        poolId={poolId}
        poolName={pool.name}
        visible={broadcastVisible}
        onClose={() => setBroadcastVisible(false)}
      />

      <Modal
        visible={partnerBroadcastVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPartnerBroadcastVisible(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (!partnerBroadcastSending) setPartnerBroadcastVisible(false);
          }}
          accessibilityLabel="Dismiss broadcast dialog">
          <Pressable
            style={styles.modalCard}
            onPress={() => {
              /* swallow taps inside the card so backdrop dismiss doesn't fire */
            }}>
            <Text style={styles.modalTitle}>
              Broadcast from {partnerRow?.name ?? 'Club'}
            </Text>
            <Text style={styles.modalHint}>
              Sends to every member of every Contest on this Club's roster.
              Max 280 chars. Rate limit: 3 per 24h.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={partnerBroadcastMessage}
              onChangeText={text => {
                if (text.length <= 280) setPartnerBroadcastMessage(text);
              }}
              placeholder="Game day at the bar — $1 drafts, kickoff at 1pm…"
              placeholderTextColor={colors.textSecondary}
              multiline
              autoFocus
              maxLength={280}
            />
            <Text style={styles.perkCharCount}>
              {partnerBroadcastMessage.length}/280
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setPartnerBroadcastVisible(false)}
                disabled={partnerBroadcastSending}
                accessibilityRole="button"
                accessibilityLabel="Cancel">
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmit,
                  (partnerBroadcastMessage.trim().length === 0 ||
                    partnerBroadcastSending) &&
                    styles.perkSaveButtonDisabled,
                ]}
                onPress={handleSendPartnerBroadcast}
                disabled={
                  partnerBroadcastMessage.trim().length === 0 ||
                  partnerBroadcastSending
                }
                accessibilityRole="button"
                accessibilityLabel="Send broadcast"
                accessibilityState={{
                  disabled: partnerBroadcastMessage.trim().length === 0 || partnerBroadcastSending,
                }}>
                {partnerBroadcastSending ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={styles.modalSubmitText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  // Club Rosters pills — one row per affiliated Club with inline Remove.
  clubPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  clubPillName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  clubPillBadge: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
  },
  clubPillRemove: {
    padding: 4,
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
    marginBottom: spacing.sm,
  },
  partnerCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  partnerCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  partnerCardHint: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  perkInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  perkIconInput: {
    width: 56,
    minHeight: 48,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    fontSize: 22,
    textAlign: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  perkTextInput: {
    flex: 1,
    minHeight: 48,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 13,
    lineHeight: 18,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  perkCharCount: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  perkSaveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  perkSaveButtonDisabled: {
    opacity: 0.4,
  },
  perkSaveText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  modalHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 17,
  },
  modalInput: {
    minHeight: 96,
    padding: spacing.md,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  modalCancel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalSubmit: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  modalSubmitText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
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
