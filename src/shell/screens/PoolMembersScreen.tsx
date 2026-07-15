import React, {useEffect, useCallback, useState} from 'react';
import {Text, TextInput} from '@shared/components/AppText';
import {
  View,
  FlatList,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import {ChevronLeft, Shield, Crown, UserMinus, StickyNote, X, Check, Clock} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useAuth} from '@shared/hooks/useAuth';
import {getDisplayName} from '@shared/utils/displayName';
import {AvatarBadge} from '@shared/components/AvatarBadge';
import {spacing, borderRadius} from '@shared/theme';
import type {DbPoolMember, DbProfile} from '@shared/types/database';
import {useTheme} from '@shell/theme';
import {roleLabel, LEXICON} from '@shared/lexicon';
import {FoundingWall, usePaywallConfig, useFoundingGafferFlag} from '@shell/paywall';

type MemberWithProfile = DbPoolMember & {profile?: DbProfile};

// Gaffer Approval Gate — a pending applicant as returned by the organizer-gated
// get_pending_applicants RPC. `contact` is the applicant's email and is the ONE
// place it's exposed, to the Gaffer only. Never merged into the shared
// poolMembers list.
type PendingApplicant = {
  user_id: string;
  display_name: string;
  real_name: string;
  contact: string;
  applied_at: string;
};

function applicantName(a: PendingApplicant): string {
  return a.display_name || a.real_name || 'This applicant';
}

// Trigger A is Gaffer-side derived (no server write): the wall shows when a
// Gaffer opens a Contest they run that's at/over its member cap. Shown once per
// pool per app session — this module-level set survives remounts within a
// session and resets on app restart.
const seenMemberCapWall = new Set<string>();

export function PoolMembersScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const poolId = route.params?.poolId as string;

  const {user} = useAuth();
  const poolMembers = useGlobalStore(s => s.poolMembers);
  const isLoadingMembers = useGlobalStore(s => s.isLoadingMembers);
  const fetchPoolMembers = useGlobalStore(s => s.fetchPoolMembers);
  const removePoolMember = useGlobalStore(s => s.removePoolMember);
  const updateMemberRole = useGlobalStore(s => s.updateMemberRole);
  const poolRoles = useGlobalStore(s => s.poolRoles);

  const myRole = poolRoles[poolId];
  const isOrganizer = myRole === 'organizer';
  const isAdmin = myRole === 'admin';
  const canManage = isOrganizer || isAdmin;

  // Trigger A (§6a) — derived founding wall for the Gaffer of an at-cap Contest.
  const userPools = useGlobalStore(s => s.userPools);
  const pool = userPools.find(p => p.id === poolId);
  const {config: paywallConfig} = usePaywallConfig();
  const isFoundingGaffer = useFoundingGafferFlag();
  const [showFoundingWall, setShowFoundingWall] = useState(false);

  useEffect(() => {
    if (
      isOrganizer &&
      paywallConfig?.foundingSeasonActive &&
      pool?.member_limit != null &&
      poolMembers.length >= pool.member_limit &&
      !seenMemberCapWall.has(poolId)
    ) {
      seenMemberCapWall.add(poolId);
      setShowFoundingWall(true);
    }
  }, [isOrganizer, paywallConfig, pool?.member_limit, poolMembers.length, poolId]);

  // League tier: this pool is a League's own Club Pool, so roles read as
  // Chairman/Director rather than Gaffer/Assistant Gaffer. (The internal
  // roles are identical; only the labels differ — see roleLabel().)
  const managedClub = useGlobalStore(s => s.managedClub);
  const isLeagueTier = managedClub?.clubPoolId === poolId;
  const assistantLabel = roleLabel('admin', isLeagueTier);   // Assistant Gaffer | Director
  const memberLabel = roleLabel('member', isLeagueTier);     // Player

  // Member notes — shared across all Gaffers/Admins of the Contest.
  // RLS gates SELECT to managers, so non-managers get an empty map and
  // the indicators won't render for them anyway.
  const [notesByUser, setNotesByUser] = useState<Record<string, string>>({});
  const [editingMember, setEditingMember] = useState<MemberWithProfile | null>(null);
  const [actionMember, setActionMember] = useState<MemberWithProfile | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // --- Gaffer Approval Gate: pending applicants (Gaffer-only) ---
  // Kept in local state, never in the shared poolMembers list, so applicant
  // email (contact) is confined to this screen and only for the organizer. The
  // RPC is itself organizer-gated; the isOrganizer guard mirrors it client-side
  // so an Assistant Gaffer/admin never even issues the query.
  const [pendingApplicants, setPendingApplicants] = useState<PendingApplicant[]>([]);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchPendingApplicants = useCallback(async () => {
    if (!poolId || !isOrganizer) return;
    const {data, error} = await supabase.rpc('get_pending_applicants', {
      p_pool_id: poolId,
    });
    if (error) return;
    const result = data as {
      ok?: boolean;
      applicants?: PendingApplicant[];
      error?: string;
    };
    if (result?.ok && Array.isArray(result.applicants)) {
      setPendingApplicants(result.applicants);
    }
  }, [poolId, isOrganizer]);

  useEffect(() => {
    fetchPendingApplicants();
  }, [fetchPendingApplicants]);

  const handleApprove = async (applicant: PendingApplicant) => {
    setActioningId(applicant.user_id);
    const {data, error} = await supabase.rpc('approve_pending_member', {
      p_pool_id: poolId,
      p_user_id: applicant.user_id,
    });
    setActioningId(null);
    if (error) {
      Alert.alert('Could not approve', error.message);
      return;
    }
    const result = data as {ok?: boolean; error?: string; cap?: number};
    if (result?.error === 'cap_exceeded') {
      // Plain informative alert — NOT the FoundingWall. cap_exceeded means the
      // approve was BLOCKED (founding season off); FoundingWall announces the
      // opposite ("we let you through"), so it must never appear here.
      Alert.alert(
        'Contest is full',
        `This Contest is at its limit of ${result.cap} ${LEXICON.player.plural}. ` +
          `${applicantName(applicant)} stays pending until a spot opens.`,
      );
      return;
    }
    if (result?.error) {
      Alert.alert('Could not approve', result.error);
      return;
    }
    // Approved — drop from pending and refetch members so the new active
    // member (and the header count) update.
    setPendingApplicants(prev => prev.filter(a => a.user_id !== applicant.user_id));
    fetchPoolMembers(poolId);
  };

  const handleReject = (applicant: PendingApplicant) => {
    // Confirm — reject is silent to the applicant (their pending state simply
    // ends). A mis-tap would strand them waiting forever, so gate it.
    Alert.alert(
      `Reject ${applicantName(applicant)}?`,
      "They won't be added to this Contest. They can request to join again later.",
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setActioningId(applicant.user_id);
            const {data, error} = await supabase.rpc('reject_pending_member', {
              p_pool_id: poolId,
              p_user_id: applicant.user_id,
            });
            setActioningId(null);
            if (error) {
              Alert.alert('Could not reject', error.message);
              return;
            }
            const result = data as {ok?: boolean; error?: string};
            if (result?.error) {
              Alert.alert('Could not reject', result.error);
              return;
            }
            setPendingApplicants(prev =>
              prev.filter(a => a.user_id !== applicant.user_id),
            );
          },
        },
      ],
    );
  };

  const fetchNotes = useCallback(async () => {
    if (!poolId || !canManage) return;
    const {data} = await supabase
      .from('pool_member_notes')
      .select('user_id, note_text')
      .eq('pool_id', poolId);
    const map: Record<string, string> = {};
    for (const row of (data ?? []) as {user_id: string; note_text: string}[]) {
      map[row.user_id] = row.note_text;
    }
    setNotesByUser(map);
  }, [poolId, canManage]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const openNoteEditor = (member: MemberWithProfile) => {
    setEditingMember(member);
    setEditNoteText(notesByUser[member.user_id] ?? '');
  };

  const closeNoteEditor = () => {
    setEditingMember(null);
    setEditNoteText('');
  };

  const handleSaveNote = async () => {
    if (!editingMember) return;
    setSavingNote(true);
    const {data, error} = await supabase.rpc('update_member_note', {
      p_pool_id: poolId,
      p_user_id: editingMember.user_id,
      p_note: editNoteText,
    });
    setSavingNote(false);
    if (error) {
      Alert.alert('Could not save note', error.message);
      return;
    }
    const result = data as {error?: string; ok?: boolean; cleared?: boolean};
    if (result?.error) {
      Alert.alert('Could not save note', result.error);
      return;
    }
    // Mirror locally so the row indicator updates without a refetch.
    setNotesByUser(prev => {
      const next = {...prev};
      const trimmed = editNoteText.trim();
      if (trimmed.length === 0) {
        delete next[editingMember.user_id];
      } else {
        next[editingMember.user_id] = trimmed;
      }
      return next;
    });
    closeNoteEditor();
  };

  useEffect(() => {
    if (poolId) {
      fetchPoolMembers(poolId);
    }
  }, [poolId, fetchPoolMembers]);

  // Build the action list for a member. Rendered in a custom modal (below) —
  // a native Alert can't be used here because Android caps alerts at 3 buttons
  // and silently dropped the Cancel. Each confirm step is still its own alert.
  const getMemberActions = useCallback(
    (member: MemberWithProfile): {label: string; destructive?: boolean; onPress: () => void}[] => {
      const memberName = getDisplayName(member.profile ?? null);
      const actions: {label: string; destructive?: boolean; onPress: () => void}[] = [];

      const hasNote = !!notesByUser[member.user_id];
      actions.push({
        label: hasNote ? 'Edit note' : 'Add note',
        onPress: () => {
          setActionMember(null);
          openNoteEditor(member);
        },
      });

      if (isOrganizer) {
        if (member.role === 'member') {
          actions.push({
            label: `Promote to ${assistantLabel}`,
            onPress: () => {
              setActionMember(null);
              Alert.alert(
                `Promote ${memberName} to ${assistantLabel}?`,
                `${assistantLabel}s of this Contest can:\n` +
                "   • Send broadcasts to all members\n" +
                "   • Review and action flagged messages\n" +
                "   • Warn or remove members\n" +
                "   • Edit Contest settings and invite codes\n" +
                "   • Affiliate the Contest with Leagues\n\n" +
                "They CAN'T:\n" +
                `   • Name other ${assistantLabel}s\n` +
                "   • Archive this Contest\n\n" +
                `You can demote them back to ${memberLabel} any time.`,
                [
                  {text: 'Cancel', style: 'cancel'},
                  {
                    text: 'Promote',
                    onPress: async () => {
                      const result = await updateMemberRole(poolId, member.user_id, 'admin');
                      if (!result.success) {
                        Alert.alert('Error', result.error ?? 'Failed to update role');
                      }
                    },
                  },
                ],
              );
            },
          });
        } else if (member.role === 'admin') {
          actions.push({
            label: `Demote to ${memberLabel}`,
            onPress: () => {
              setActionMember(null);
              Alert.alert(
                `Demote ${memberName} to ${memberLabel}?`,
                "They'll lose access to:\n" +
                "   • Broadcasts\n" +
                "   • Flagged-message review\n" +
                "   • Member moderation tools\n" +
                "   • Contest settings\n\n" +
                "They'll keep their picks and standings. You can " +
                "re-promote them later if needed.",
                [
                  {text: 'Cancel', style: 'cancel'},
                  {
                    text: 'Demote',
                    style: 'destructive',
                    onPress: async () => {
                      const result = await updateMemberRole(poolId, member.user_id, 'member');
                      if (!result.success) {
                        Alert.alert('Error', result.error ?? 'Failed to update role');
                      }
                    },
                  },
                ],
              );
            },
          });
        }
      }

      actions.push({
        label: 'Remove from Contest',
        destructive: true,
        onPress: () => {
          setActionMember(null);
          Alert.alert(
            'Remove Member',
            `Remove ${memberName} from this Contest? They will no longer see Contest content.`,
            [
              {text: 'Cancel', style: 'cancel'},
              {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                  const result = await removePoolMember(poolId, member.user_id);
                  if (!result.success) {
                    Alert.alert('Error', result.error ?? 'Failed to remove member');
                  }
                },
              },
            ],
          );
        },
      });

      return actions;
    },
    [
      poolId,
      isOrganizer,
      assistantLabel,
      memberLabel,
      updateMemberRole,
      removePoolMember,
      notesByUser,
      openNoteEditor,
    ],
  );

  const handleMemberAction = useCallback(
    (member: MemberWithProfile) => {
      // No actions on self or on organizer; admin can't act on another admin.
      if (member.user_id === user?.id) return;
      if (member.role === 'organizer') return;
      if (isAdmin && member.role === 'admin') return;
      setActionMember(member);
    },
    [user?.id, isAdmin],
  );

  const renderMember = ({item}: {item: MemberWithProfile}) => {
    const isMe = item.user_id === user?.id;
    const memberName = getDisplayName(item.profile ?? null);
    const joinDate = new Date(item.joined_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const canTap =
      canManage && !isMe && item.role !== 'organizer' && !(isAdmin && item.role === 'admin');

    return (
      <TouchableOpacity
        style={[styles.memberRow, isMe && styles.memberRowMe]}
        onPress={() => canTap && handleMemberAction(item)}
        activeOpacity={canTap ? 0.7 : 1}>
        <AvatarBadge avatarKey={item.profile?.avatar_key ?? null} name={memberName} size={40} />

        {/* Info */}
        <View style={styles.memberInfo}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.memberName, isMe && styles.memberNameMe]}
              numberOfLines={1}>
              {isMe ? `${memberName} (You)` : memberName}
            </Text>
            {item.profile?.first_name && (
              <Text style={styles.realName} numberOfLines={1}>
                {item.profile.first_name}{item.profile.last_name ? ` ${item.profile.last_name.charAt(0).toUpperCase()}.` : ''}
              </Text>
            )}
            {item.role === 'organizer' && (
              <Crown size={14} color={colors.primary} />
            )}
            {item.role === 'admin' && (
              <Shield size={14} color={colors.secondary} />
            )}
          </View>
          <Text style={styles.joinDate}>Joined {joinDate}</Text>
          {canManage && notesByUser[item.user_id] && (
            <View style={styles.noteRow}>
              <StickyNote size={11} color={colors.textTertiary} strokeWidth={2.25} />
              <Text style={styles.noteExcerpt} numberOfLines={1}>
                {notesByUser[item.user_id]}
              </Text>
            </View>
          )}
        </View>

        {/* Role badge */}
        <View
          style={[
            styles.roleBadge,
            item.role === 'organizer' && styles.roleBadgeOrganizer,
            item.role === 'admin' && styles.roleBadgeAdmin,
          ]}>
          <Text
            style={[
              styles.roleText,
              item.role === 'organizer' && styles.roleTextOrganizer,
              item.role === 'admin' && styles.roleTextAdmin,
            ]}>
            {roleLabel(item.role, isLeagueTier)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Gaffer-only pending-approval block, rendered ABOVE the members list. Regular
  // players never see it (isOrganizer gate) and can't obtain contact info (the
  // RPC that supplies it is organizer-gated).
  const renderPendingBlock = () => {
    if (!isOrganizer || pendingApplicants.length === 0) return null;
    return (
      <View style={styles.pendingSection}>
        <View style={styles.pendingSectionHeader}>
          <Clock size={15} color={colors.warning ?? colors.primary} />
          <Text style={styles.pendingSectionTitle}>
            Pending approval ({pendingApplicants.length})
          </Text>
        </View>
        {pendingApplicants.map(applicant => {
          const busy = actioningId === applicant.user_id;
          return (
            <View key={applicant.user_id} style={styles.pendingRow}>
              <View style={styles.pendingInfo}>
                <Text style={styles.pendingName} numberOfLines={1}>
                  {applicantName(applicant)}
                </Text>
                {!!applicant.contact && (
                  <Text style={styles.pendingContact} numberOfLines={1}>
                    {applicant.contact}
                  </Text>
                )}
              </View>
              <View style={styles.pendingActions}>
                <TouchableOpacity
                  style={[styles.rejectBtn, busy && styles.pendingBtnDisabled]}
                  onPress={() => handleReject(applicant)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Reject ${applicantName(applicant)}`}>
                  <X size={18} color={colors.error} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.acceptBtn, busy && styles.pendingBtnDisabled]}
                  onPress={() => handleApprove(applicant)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Accept ${applicantName(applicant)}`}>
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Check size={18} color={colors.onPrimary} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
        <Text style={styles.pendingHint}>
          Approve to add them to this Contest. Contact is shown to you only.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Members</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{poolMembers.length}</Text>
        </View>
      </View>

      {isLoadingMembers ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={[...poolMembers].sort((a, b) => {
            const nameA = (a.profile?.poolie_name || '').toLowerCase();
            const nameB = (b.profile?.poolie_name || '').toLowerCase();
            return nameA.localeCompare(nameB);
          })}
          keyExtractor={item => item.user_id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          ListHeaderComponent={renderPendingBlock()}
          ListEmptyComponent={
            <View style={styles.empty}>
              <UserMinus size={32} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No members found</Text>
            </View>
          }
        />
      )}

      {/* Note editor — shared across Gaffer + Admin per Gaffer Pass §4.3.
          Visible to managers only (gated by the action sheet). */}
      <Modal
        visible={editingMember !== null}
        transparent
        animationType="fade"
        onRequestClose={closeNoteEditor}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalBackdropPress} onPress={closeNoteEditor} />
          <View style={styles.noteCard}>
            <View style={styles.noteHeader}>
              <Text style={styles.noteTitle}>
                Note on {editingMember ? getDisplayName(editingMember.profile ?? null) : ''}
              </Text>
              <TouchableOpacity onPress={closeNoteEditor} hitSlop={8}>
                <X size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.noteHint}>
              Shared with the Gaffer and any Admins of this Contest. Other
              members can't see it.
            </Text>
            <TextInput
              style={styles.noteInput}
              value={editNoteText}
              onChangeText={text => {
                if (text.length <= 500) setEditNoteText(text);
              }}
              placeholder="e.g. Paid Venmo Sept 5 · Picks up at Mike's"
              placeholderTextColor={colors.textTertiary}
              multiline
              autoFocus
              maxLength={500}
            />
            <Text style={styles.noteCharCount}>{editNoteText.length} / 500</Text>
            <View style={styles.noteActions}>
              <TouchableOpacity
                onPress={closeNoteEditor}
                style={styles.noteCancel}>
                <Text style={styles.noteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveNote}
                disabled={savingNote}
                style={[styles.noteSave, savingNote && {opacity: 0.6}]}>
                {savingNote ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={styles.noteSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Member action sheet — replaces the native Alert (Android capped it at
          3 buttons and dropped Cancel). Always shows every available action
          plus a clear Cancel. */}
      <Modal
        visible={actionMember !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMember(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalBackdropPress}
            onPress={() => setActionMember(null)}
          />
          <View style={styles.actionCard}>
            <Text style={styles.actionTitle} numberOfLines={1}>
              {actionMember ? getDisplayName(actionMember.profile ?? null) : ''}
            </Text>
            <Text style={styles.actionSubtitle}>
              {actionMember ? roleLabel(actionMember.role, isLeagueTier) : ''}
            </Text>
            <View style={styles.actionList}>
              {actionMember &&
                getMemberActions(actionMember).map(action => (
                  <TouchableOpacity
                    key={action.label}
                    style={styles.actionRow}
                    onPress={action.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}>
                    <Text
                      style={[
                        styles.actionRowText,
                        action.destructive && styles.actionRowTextDestructive,
                      ]}>
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
            <TouchableOpacity
              style={styles.actionCancel}
              onPress={() => setActionMember(null)}
              accessibilityRole="button"
              accessibilityLabel="Cancel">
              <Text style={styles.actionCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <FoundingWall
        visible={showFoundingWall}
        trigger="member_cap"
        contestName={pool?.name}
        isFoundingGaffer={isFoundingGaffer}
        onClose={() => setShowFoundingWall(false)}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  countBadge: {
    backgroundColor: colors.primary + '20',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  memberRowMe: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  memberInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  memberNameMe: {
    color: colors.primary,
    fontWeight: '700',
  },
  realName: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    flexShrink: 1,
  },
  joinDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  noteExcerpt: {
    flex: 1,
    fontSize: 11,
    fontStyle: 'italic',
    color: colors.textTertiary,
  },

  // Note editor modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalBackdropPress: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  noteCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  actionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: spacing.md,
  },
  actionList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionRow: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  actionRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  actionRowTextDestructive: {
    color: colors.error,
  },
  actionCancel: {
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  actionCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  noteHint: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  noteInput: {
    minHeight: 100,
    maxHeight: 200,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  noteCharCount: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'right',
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  noteCancel: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  noteCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  noteSave: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    minWidth: 80,
    alignItems: 'center',
  },
  noteSaveText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },

  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.border,
  },
  roleBadgeOrganizer: {
    backgroundColor: colors.primary + '15',
  },
  roleBadgeAdmin: {
    backgroundColor: colors.secondary + '15',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  roleTextOrganizer: {
    color: colors.primary,
  },
  roleTextAdmin: {
    color: colors.secondary,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Gaffer Approval Gate — pending-approval block (Gaffer-only, above the list).
  pendingSection: {
    marginBottom: spacing.lg,
  },
  pendingSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  pendingSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: (colors.warning ?? colors.primary) + '40',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pendingInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  pendingName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pendingContact: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pendingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rejectBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.error,
  },
  acceptBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  pendingBtnDisabled: {
    opacity: 0.5,
  },
  pendingHint: {
    fontSize: 12,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
});
