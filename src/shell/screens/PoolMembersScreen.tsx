import React, {useEffect, useCallback, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
  StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import {ChevronLeft, Shield, Crown, UserMinus, StickyNote, X, Download} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useAuth} from '@shared/hooks/useAuth';
import {getDisplayName} from '@shared/utils/displayName';
import {AvatarBadge} from '@shared/components/AvatarBadge';
import {spacing, borderRadius} from '@shared/theme';
import type {DbPoolMember, DbProfile} from '@shared/types/database';
import {useTheme} from '@shell/theme';
import {LEXICON} from '@shared/lexicon';

type MemberWithProfile = DbPoolMember & {profile?: DbProfile};

// RFC 4180-ish CSV cell escaping: wrap in quotes if the cell contains
// a comma, quote, or newline; double any internal quotes.
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCsv(rows: Array<{
  poolie_name: string;
  first_name: string;
  last_name: string;
  email: string;
  joined_at: string;
  role: string;
  note: string;
}>): string {
  const header = ['Player Name', 'Legal First', 'Legal Last', 'Email', 'Joined', 'Role', 'Notes'];
  const lines = [header.map(csvEscape).join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.poolie_name),
      csvEscape(r.first_name),
      csvEscape(r.last_name),
      csvEscape(r.email),
      csvEscape(new Date(r.joined_at).toISOString().slice(0, 10)),
      csvEscape(r.role),
      csvEscape(r.note),
    ].join(','));
  }
  return lines.join('\n');
}

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

  // Member notes — shared across all Gaffers/Admins of the Contest.
  // RLS gates SELECT to managers, so non-managers get an empty map and
  // the indicators won't render for them anyway.
  const [notesByUser, setNotesByUser] = useState<Record<string, string>>({});
  const [editingMember, setEditingMember] = useState<MemberWithProfile | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

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

  // CSV export — managers only. Server-side RPC handles auth + audit
  // log, returns rows as JSON; client formats CSV and shares as text
  // (no file-share dep). Users paste into Sheets / Numbers / Mail.
  const [exporting, setExporting] = useState(false);
  const handleExportCsv = async () => {
    if (!canManage) return;
    Alert.alert(
      `Export ${poolMembers.length} members?`,
      "The export includes each Player's name, email, join date, role, and any private notes you've added. Don't share this file publicly — emails are PII.",
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Export',
          onPress: async () => {
            setExporting(true);
            const {data, error} = await supabase.rpc('export_pool_members', {
              p_pool_id: poolId,
            });
            setExporting(false);
            if (error) {
              Alert.alert('Export failed', error.message);
              return;
            }
            const result = data as
              | {ok: true; pool_name: string; rows: Array<{
                  poolie_name: string;
                  first_name: string;
                  last_name: string;
                  email: string;
                  joined_at: string;
                  role: string;
                  note: string;
                }>}
              | {error: string};
            if ('error' in result) {
              Alert.alert('Export failed', result.error);
              return;
            }
            const csv = formatCsv(result.rows);
            try {
              await Share.share({
                title: `${result.pool_name} — Member Export`,
                message: csv,
              });
            } catch {
              // User canceled — non-error
            }
          },
        },
      ],
    );
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

  const handleMemberAction = useCallback(
    (member: MemberWithProfile) => {
      // No actions on self or on organizer
      if (member.user_id === user?.id) return;
      if (member.role === 'organizer') return;

      // Admin can only remove members, not other admins
      if (isAdmin && member.role === 'admin') return;

      const memberName = getDisplayName(member.profile ?? null);
      const buttons: {text: string; onPress: () => void; style?: 'destructive' | 'cancel'}[] = [];

      // Note — Gaffer + Admin both can read/write. Available before
      // role mgmt actions so it's the most-frequent action sitting at
      // the top of the sheet (per Gaffer Pass §4.3).
      const hasNote = !!notesByUser[member.user_id];
      buttons.push({
        text: hasNote ? 'Edit note' : 'Add note',
        onPress: () => openNoteEditor(member),
      });

      // Organizer can promote/demote. Both transitions get a
      // confirmation dialog that spells out what changes for the
      // affected member — per Gaffer Pass §4.4.
      if (isOrganizer) {
        if (member.role === 'member') {
          buttons.push({
            text: 'Promote to Admin',
            onPress: () => {
              Alert.alert(
                `Promote ${memberName} to Admin?`,
                "Admins of this Contest can:\n" +
                "   • Send broadcasts to all members\n" +
                "   • Review and action flagged messages\n" +
                "   • Warn or remove members\n" +
                "   • Edit Contest settings and invite codes\n" +
                "   • Affiliate the Contest with Clubs\n\n" +
                "They CAN'T:\n" +
                "   • Name other Admins\n" +
                "   • Archive this Contest\n\n" +
                "You can demote them back to Player any time.",
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
          buttons.push({
            text: 'Demote to Member',
            onPress: () => {
              Alert.alert(
                `Demote ${memberName} to Player?`,
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

      // Remove (organizer can remove anyone except organizer; admin can remove members only)
      buttons.push({
        text: 'Remove from Contest',
        style: 'destructive',
        onPress: () => {
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

      buttons.push({text: 'Cancel', style: 'cancel', onPress: () => {}});

      Alert.alert(memberName, `Role: ${member.role}`, buttons);
    },
    [poolId, user?.id, isOrganizer, isAdmin, updateMemberRole, removePoolMember, notesByUser],
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
            {item.role === 'organizer'
              ? LEXICON.gaffer.short
              : item.role.charAt(0).toUpperCase() + item.role.slice(1)}
          </Text>
        </View>
      </TouchableOpacity>
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
        {canManage && (
          <TouchableOpacity
            onPress={handleExportCsv}
            disabled={exporting}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            style={styles.exportBtn}
            accessibilityRole="button"
            accessibilityLabel="Export members as CSV">
            {exporting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Download size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
        )}
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
  exportBtn: {
    marginLeft: 'auto',
    padding: spacing.xs,
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
});
