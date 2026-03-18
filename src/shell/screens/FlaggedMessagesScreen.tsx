import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import {ChevronLeft, Check, X, Eye, MessageSquare} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useAuth} from '@shared/hooks/useAuth';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDisplayName} from '@shared/utils/displayName';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

import type {DbSmackMessage} from '@shared/types/database';

/**
 * FlaggedMessagesScreen — Admin moderation queue for flagged SmackTalk messages.
 *
 * Shows all flagged messages in a pool with pending moderation status.
 * Organizers and admins can:
 *   - Approve: clear the flag, message returns to normal
 *   - Remove: message is permanently hidden with "removed by moderator" text
 *   - Send Note: DM the poster or the flagger via SmackTalk
 *   - View original message text even while flagged
 *
 * Accessed from PoolSettingsScreen for organizer/admin roles.
 */
export function FlaggedMessagesScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const poolId = route.params?.poolId as string;
  const {user} = useAuth();
  const userProfile = useGlobalStore(s => s.userProfile);
  const fetchFlaggedCounts = useGlobalStore(s => s.fetchFlaggedCounts);

  const [flaggedMessages, setFlaggedMessages] = useState<DbSmackMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Note modal state
  const [noteTarget, setNoteTarget] = useState<{
    messageId: string;
    targetUserId: string;
    targetName: string;
    targetRole: 'poster' | 'flagger';
  } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [sendingNote, setSendingNote] = useState(false);

  // Cache of user names for flaggers
  const [flaggerNames, setFlaggerNames] = useState<Record<string, string>>({});

  const fetchFlagged = useCallback(async () => {
    setIsLoading(true);
    const {data} = await supabase
      .from('smack_messages')
      .select('*')
      .eq('pool_id', poolId)
      .eq('is_flagged', true)
      .order('flagged_at', {ascending: false});

    if (data) {
      const msgs = data as DbSmackMessage[];
      setFlaggedMessages(msgs);

      // Fetch flagger names
      const flaggerIds = [...new Set(msgs.map(m => m.flagged_by).filter(Boolean))] as string[];
      if (flaggerIds.length > 0) {
        const {data: profiles} = await supabase
          .from('profiles')
          .select('id, first_name, last_name, poolie_name, display_name_preference')
          .in('id', flaggerIds);
        if (profiles) {
          const names: Record<string, string> = {};
          for (const p of profiles) {
            const pref = p.display_name_preference ?? 'first_name';
            if (pref === 'poolie_name' && p.poolie_name) {
              names[p.id] = p.poolie_name;
            } else {
              names[p.id] = [p.first_name, p.last_name?.charAt(0)]
                .filter(Boolean)
                .join(' ') || 'Unknown';
            }
          }
          setFlaggerNames(names);
        }
      }
    }
    setIsLoading(false);
  }, [poolId]);

  useEffect(() => {
    fetchFlagged();
  }, [fetchFlagged]);

  // Realtime: listen for new flags
  useEffect(() => {
    const channel = supabase
      .channel(`flagged:${poolId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'smack_messages',
          filter: `pool_id=eq.${poolId}`,
        },
        () => {
          fetchFlagged();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poolId, fetchFlagged]);

  const handleApprove = (messageId: string) => {
    Alert.alert(
      'Approve Message',
      'This will clear the flag and restore the message. Continue?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Approve',
          onPress: async () => {
            await supabase
              .from('smack_messages')
              .update({
                moderation_status: 'approved',
                moderated_by: user?.id,
                moderated_at: new Date().toISOString(),
              })
              .eq('id', messageId);

            await supabase.from('pool_events').insert({
              pool_id: poolId,
              event_type: 'SMACKTALK_FLAGGED',
              user_id: user?.id,
              metadata: {message_id: messageId, action: 'approved'},
            });

            setFlaggedMessages(prev =>
              prev.map(m =>
                m.id === messageId
                  ? {...m, moderation_status: 'approved' as const, moderated_by: user?.id ?? null, moderated_at: new Date().toISOString()}
                  : m,
              ),
            );
            fetchFlaggedCounts();
          },
        },
      ],
    );
  };

  const handleRemove = (messageId: string) => {
    Alert.alert(
      'Remove Message',
      'This will permanently hide this message from the chat. This cannot be undone. Continue?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('smack_messages')
              .update({
                moderation_status: 'removed',
                moderated_by: user?.id,
                moderated_at: new Date().toISOString(),
              })
              .eq('id', messageId);

            await supabase.from('pool_events').insert({
              pool_id: poolId,
              event_type: 'SMACKTALK_REMOVED',
              user_id: user?.id,
              metadata: {message_id: messageId, action: 'removed'},
            });

            setFlaggedMessages(prev =>
              prev.map(m =>
                m.id === messageId
                  ? {...m, moderation_status: 'removed' as const, moderated_by: user?.id ?? null, moderated_at: new Date().toISOString()}
                  : m,
              ),
            );
            fetchFlaggedCounts();
          },
        },
      ],
    );
  };

  const handleSendNote = async () => {
    if (!noteTarget || !noteText.trim() || !user?.id || sendingNote) return;

    setSendingNote(true);
    const adminName = getDisplayName(userProfile);

    // Write to organizer_notifications so it appears in the user's Message Center
    const pool = useGlobalStore.getState().userPools.find(p => p.id === poolId);
    const competition = pool?.competition ?? 'nfl_2026';

    await supabase.from('organizer_notifications').insert({
      pool_id: poolId,
      organizer_id: user.id,
      competition,
      notification_type: 'moderator_note',
      message: `[To ${noteTarget.targetName}] ${noteText.trim()}`,
      recipient_count: 1,
      recipient_user_ids: [noteTarget.targetUserId],
      sent_at: new Date().toISOString(),
    });

    setSendingNote(false);
    setNoteText('');
    setNoteTarget(null);
    Alert.alert('Sent', `Note delivered to ${noteTarget.targetName}'s Message Center.`);
  };

  const renderItem = ({item}: {item: DbSmackMessage}) => {
    const isPending = item.moderation_status === 'pending';
    const isApproved = item.moderation_status === 'approved';
    const isRemoved = item.moderation_status === 'removed';
    const isExpanded = expandedId === item.id;

    const flagTime = item.flagged_at
      ? new Date(item.flagged_at).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    const flaggerName = item.flagged_by ? flaggerNames[item.flagged_by] ?? 'Unknown' : 'Unknown';

    const statusColor = isApproved
      ? colors.success
      : isRemoved
        ? colors.error ?? '#E53935'
        : colors.warning;

    const statusLabel = isApproved
      ? 'Approved'
      : isRemoved
        ? 'Removed'
        : 'Pending Review';

    return (
      <View style={[styles.card, {borderLeftColor: statusColor}]}>
        {/* Header: author + flag time */}
        <View style={styles.cardHeader}>
          <Text style={[styles.authorName, {color: colors.textPrimary}]}>
            {item.author_name}
          </Text>
          <Text style={[styles.flagTime, {color: colors.textSecondary}]}>
            Flagged {flagTime}
          </Text>
        </View>

        {/* Flagged by */}
        <Text style={[styles.flaggedBy, {color: colors.textSecondary}]}>
          Reported by: {flaggerName}
        </Text>

        {/* Status badge */}
        <View style={[styles.statusBadge, {backgroundColor: statusColor}]}>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>

        {/* Message text — tap to reveal if flagged */}
        <TouchableOpacity
          onPress={() => setExpandedId(isExpanded ? null : item.id)}
          style={styles.messagePreview}>
          {isExpanded ? (
            <Text style={[styles.messageText, {color: colors.textPrimary}]}>
              {item.text}
            </Text>
          ) : (
            <View style={styles.hiddenRow}>
              <Eye size={14} color={colors.textSecondary} />
              <Text style={[styles.hiddenText, {color: colors.textSecondary}]}>
                Tap to view message
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Action buttons */}
        {isPending && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={() => handleApprove(item.id)}>
              <Check size={16} color="#FFFFFF" />
              <Text style={styles.actionText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.removeButton]}
              onPress={() => handleRemove(item.id)}>
              <X size={16} color="#FFFFFF" />
              <Text style={styles.actionText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Note buttons — always available */}
        <View style={styles.noteRow}>
          <TouchableOpacity
            style={[styles.noteButton, {borderColor: colors.secondary}]}
            onPress={() =>
              setNoteTarget({
                messageId: item.id,
                targetUserId: item.user_id,
                targetName: item.author_name,
                targetRole: 'poster',
              })
            }>
            <MessageSquare size={14} color={colors.secondary} />
            <Text style={[styles.noteButtonText, {color: colors.secondary}]}>
              Note to Poster
            </Text>
          </TouchableOpacity>
          {item.flagged_by && (
            <TouchableOpacity
              style={[styles.noteButton, {borderColor: colors.textSecondary}]}
              onPress={() =>
                setNoteTarget({
                  messageId: item.id,
                  targetUserId: item.flagged_by!,
                  targetName: flaggerName,
                  targetRole: 'flagger',
                })
              }>
              <MessageSquare size={14} color={colors.textSecondary} />
              <Text style={[styles.noteButtonText, {color: colors.textSecondary}]}>
                Note to Reporter
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const pendingCount = flaggedMessages.filter(
    m => m.moderation_status === 'pending',
  ).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, {color: colors.textPrimary}]}>
            Flagged Messages
          </Text>
          {pendingCount > 0 && (
            <View style={[styles.pendingBadge, {backgroundColor: colors.warning}]}>
              <Text style={styles.pendingText}>{pendingCount}</Text>
            </View>
          )}
        </View>
        <View style={{width: 40}} />
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : flaggedMessages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, {color: colors.textPrimary}]}>
            No flagged messages
          </Text>
          <Text style={[styles.emptySubtitle, {color: colors.textSecondary}]}>
            Flagged messages from your pool will appear here for review.
          </Text>
        </View>
      ) : (
        <FlatList
          data={flaggedMessages}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Note Composer Modal */}
      <Modal
        visible={noteTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setNoteTarget(null);
          setNoteText('');
        }}>
        <Pressable
          style={styles.noteOverlay}
          onPress={() => {
            setNoteTarget(null);
            setNoteText('');
          }}>
          <Pressable
            style={[styles.noteModal, {backgroundColor: colors.surface}]}
            onPress={() => {}}>
            <Text style={[styles.noteModalTitle, {color: colors.textPrimary}]}>
              Note to {noteTarget?.targetName}
            </Text>
            <Text style={[styles.noteModalSubtitle, {color: colors.textSecondary}]}>
              This will be delivered to their Message Center privately.
            </Text>
            <TextInput
              style={[styles.noteInput, {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background}]}
              placeholder="Write your note..."
              placeholderTextColor={colors.textSecondary}
              value={noteText}
              onChangeText={setNoteText}
              multiline
              maxLength={500}
              autoFocus
            />
            <View style={styles.noteActions}>
              <TouchableOpacity
                style={[styles.noteCancelButton, {borderColor: colors.border}]}
                onPress={() => {
                  setNoteTarget(null);
                  setNoteText('');
                }}>
                <Text style={[styles.noteCancelText, {color: colors.textSecondary}]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.noteSendButton,
                  {backgroundColor: colors.primary},
                  (!noteText.trim() || sendingNote) && {opacity: 0.5},
                ]}
                onPress={handleSendNote}
                disabled={!noteText.trim() || sendingNote}>
                <Text style={styles.noteSendText}>
                  {sendingNote ? 'Sending...' : 'Send Note'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
    },
    headerCenter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
    },
    pendingBadge: {
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    pendingText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    loading: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: spacing.sm,
    },
    emptySubtitle: {
      fontSize: 14,
      textAlign: 'center',
    },
    list: {
      padding: spacing.md,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderLeftWidth: 4,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    authorName: {
      fontSize: 15,
      fontWeight: '600',
    },
    flagTime: {
      fontSize: 12,
    },
    flaggedBy: {
      fontSize: 12,
      marginBottom: spacing.sm,
    },
    statusBadge: {
      alignSelf: 'flex-start',
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginBottom: spacing.sm,
    },
    statusText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    messagePreview: {
      paddingVertical: spacing.sm,
    },
    messageText: {
      fontSize: 15,
      lineHeight: 20,
    },
    hiddenRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    hiddenText: {
      fontSize: 13,
      fontStyle: 'italic',
    },
    actionRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: borderRadius.md,
    },
    approveButton: {
      backgroundColor: colors.success,
    },
    removeButton: {
      backgroundColor: colors.error ?? '#E53935',
    },
    actionText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    // ── Note buttons ──────────────────────────────────────────────
    noteRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    noteButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: borderRadius.md,
      borderWidth: 1,
    },
    noteButtonText: {
      fontSize: 13,
      fontWeight: '500',
    },
    // ── Note composer modal ───────────────────────────────────────
    noteOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    noteModal: {
      width: '85%',
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
    },
    noteModalTitle: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 4,
    },
    noteModalSubtitle: {
      fontSize: 13,
      marginBottom: spacing.md,
    },
    noteInput: {
      minHeight: 80,
      maxHeight: 150,
      borderWidth: 1,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 15,
      textAlignVertical: 'top',
    },
    noteActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    noteCancelButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      alignItems: 'center',
    },
    noteCancelText: {
      fontSize: 14,
      fontWeight: '500',
    },
    noteSendButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: borderRadius.md,
      alignItems: 'center',
    },
    noteSendText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
  });
