import React, {useEffect, useRef, useState, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Alert,
  StyleSheet,
} from 'react-native';
import {supabase} from '@shared/config/supabase';
import {useAuth} from '@shared/hooks/useAuth';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDisplayName} from '@shared/utils/displayName';
import {SMACK_REACTIONS} from '@shared/config/smackTalk';
import {spacing, borderRadius} from '@shared/theme';

import type {DbSmackMessage, DbSmackReaction} from '@shared/types/database';
import {useTheme} from '@shell/theme';

interface SmackTalkScreenProps {
  poolId: string;
}

/** Aggregated reaction count per emoji on a message */
interface ReactionSummary {
  reaction: string;
  count: number;
  userIds: string[];
  userNames: string[];
}

/**
 * SmackTalkScreen — Real-time pool chat with reactions and moderation.
 * Shared across all templates (tournament, season, series).
 * Subscribes to Supabase Realtime for instant message delivery.
 *
 * Features:
 * - Long-press a message → reaction picker (6 emojis + Report)
 * - Reaction badges below messages with counts
 * - Tap a reaction badge → see who reacted
 * - Report → flags message, greys it out, notifies organizer/admins
 */
export function SmackTalkScreen({poolId}: SmackTalkScreenProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const [messages, setMessages] = useState<DbSmackMessage[]>([]);
  const [reactions, setReactions] = useState<Record<string, DbSmackReaction[]>>({});
  const [reactionNames, setReactionNames] = useState<Record<string, string>>({});
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [reactorModal, setReactorModal] = useState<ReactionSummary | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const {user} = useAuth();
  const userProfile = useGlobalStore(s => s.userProfile);
  const markPoolAsRead = useGlobalStore(s => s.markPoolAsRead);
  const flatListRef = useRef<FlatList<DbSmackMessage>>(null);

  // ── Load blocked users ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const loadBlocked = async () => {
      const {data} = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', user.id);
      if (data) {
        setBlockedUserIds(new Set(data.map(r => r.blocked_id)));
      }
    };
    loadBlocked();
  }, [user?.id]);

  // ── Fetch messages + reactions ──────────────────────────────────────
  useEffect(() => {
    markPoolAsRead(poolId);

    const fetchMessages = async () => {
      const {data} = await supabase
        .from('smack_messages')
        .select('*')
        .eq('pool_id', poolId)
        .order('created_at', {ascending: true});

      if (data) {
        // Filter out messages from blocked users
        const filtered = (data as DbSmackMessage[]).filter(
          m => !blockedUserIds.has(m.user_id),
        );
        setMessages(filtered);
        // Fetch reactions for all messages
        const msgIds = filtered.map(m => m.id);
        if (msgIds.length > 0) {
          await fetchReactions(msgIds);
        }
      }
    };

    fetchMessages();

    // Realtime: new messages
    const msgChannel = supabase
      .channel(`smacktalk:${poolId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'smack_messages',
          filter: `pool_id=eq.${poolId}`,
        },
        payload => {
          const msg = payload.new as DbSmackMessage;
          // Skip messages from blocked users
          if (blockedUserIds.has(msg.user_id)) return;
          setMessages(prev => [...prev, msg]);
          markPoolAsRead(poolId);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'smack_messages',
          filter: `pool_id=eq.${poolId}`,
        },
        payload => {
          const updated = payload.new as DbSmackMessage;
          setMessages(prev =>
            prev.map(m => (m.id === updated.id ? updated : m)),
          );
        },
      )
      .subscribe();

    // Realtime: reactions
    const rxnChannel = supabase
      .channel(`smacktalk-rxn:${poolId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'smack_reactions',
        },
        () => {
          // Re-fetch all reactions on any change
          const msgIds = messages.map(m => m.id);
          if (msgIds.length > 0) {
            fetchReactions(msgIds);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(rxnChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, blockedUserIds]);

  const fetchReactions = async (messageIds: string[]) => {
    const {data} = await supabase
      .from('smack_reactions')
      .select('*')
      .in('message_id', messageIds);

    if (data) {
      const byMessage: Record<string, DbSmackReaction[]> = {};
      const userIdsSet = new Set<string>();
      for (const r of data as DbSmackReaction[]) {
        if (!byMessage[r.message_id]) byMessage[r.message_id] = [];
        byMessage[r.message_id].push(r);
        userIdsSet.add(r.user_id);
      }
      setReactions(byMessage);

      // Fetch names for reactors
      const userIds = Array.from(userIdsSet);
      if (userIds.length > 0) {
        const {data: profiles} = await supabase
          .from('profiles')
          .select('id, first_name, last_name, poolie_name, display_name_preference')
          .in('id', userIds);
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
          setReactionNames(names);
        }
      }
    }
  };

  // ── Get aggregated reaction summaries for a message ─────────────────
  const getReactionSummaries = useCallback(
    (messageId: string): ReactionSummary[] => {
      const msgReactions = reactions[messageId] ?? [];
      const byEmoji: Record<string, {count: number; userIds: string[]; userNames: string[]}> = {};
      for (const r of msgReactions) {
        if (!byEmoji[r.reaction]) {
          byEmoji[r.reaction] = {count: 0, userIds: [], userNames: []};
        }
        byEmoji[r.reaction].count++;
        byEmoji[r.reaction].userIds.push(r.user_id);
        byEmoji[r.reaction].userNames.push(reactionNames[r.user_id] ?? 'Unknown');
      }
      return Object.entries(byEmoji).map(([reaction, data]) => ({
        reaction,
        ...data,
      }));
    },
    [reactions, reactionNames],
  );

  // ── Add / toggle reaction ───────────────────────────────────────────
  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user?.id) return;
    setSelectedMessageId(null);

    // Check if user already reacted with this emoji
    const existing = (reactions[messageId] ?? []).find(
      r => r.user_id === user.id && r.reaction === emoji,
    );

    if (existing) {
      // Remove reaction
      await supabase.from('smack_reactions').delete().eq('id', existing.id);
      setReactions(prev => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).filter(r => r.id !== existing.id),
      }));
    } else {
      // Add reaction
      const {data} = await supabase
        .from('smack_reactions')
        .insert({
          message_id: messageId,
          user_id: user.id,
          reaction: emoji,
        })
        .select()
        .single();

      if (data) {
        setReactions(prev => ({
          ...prev,
          [messageId]: [...(prev[messageId] ?? []), data as DbSmackReaction],
        }));
      }
    }
  };

  // ── Report / flag a message ─────────────────────────────────────────
  const handleReport = async (messageId: string) => {
    setSelectedMessageId(null);

    Alert.alert(
      'Report Message',
      'Flag this message as inappropriate? The pool organizer and admins will be notified and the message will be hidden pending review.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;

            // Flag the message
            await supabase
              .from('smack_messages')
              .update({
                is_flagged: true,
                flagged_by: user.id,
                flagged_at: new Date().toISOString(),
                flag_reason: 'inappropriate',
                moderation_status: 'pending',
              })
              .eq('id', messageId);

            // Update local state immediately
            setMessages(prev =>
              prev.map(m =>
                m.id === messageId
                  ? {
                      ...m,
                      is_flagged: true,
                      flagged_by: user.id,
                      flagged_at: new Date().toISOString(),
                      flag_reason: 'inappropriate',
                      moderation_status: 'pending' as const,
                    }
                  : m,
              ),
            );

            // Notify organizer + admins via pool_events
            await supabase.from('pool_events').insert({
              pool_id: poolId,
              event_type: 'SMACKTALK_FLAGGED',
              user_id: user.id,
              metadata: {
                message_id: messageId,
                reason: 'inappropriate',
              },
            });
          },
        },
      ],
    );
  };

  // ── Block user ─────────────────────────────────────────────────────
  const handleBlockUser = (messageId: string) => {
    setSelectedMessageId(null);
    const msg = messages.find(m => m.id === messageId);
    if (!msg || !user?.id) return;

    const authorName = msg.author_name || 'this user';
    Alert.alert(
      'Block User',
      `Block ${authorName}? Their messages will be hidden in all your pools. You can unblock from Settings.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const {error} = await supabase
              .from('user_blocks')
              .insert({blocker_id: user.id, blocked_id: msg.user_id});

            if (!error) {
              // Update local state immediately
              setBlockedUserIds(prev => new Set([...prev, msg.user_id]));
              setMessages(prev => prev.filter(m => m.user_id !== msg.user_id));
            }
          },
        },
      ],
    );
  };

  // ── Send message ────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!newMessage.trim() || !user?.id || sending) return;

    setSending(true);
    setNewMessage('');

    await supabase.from('smack_messages').insert({
      pool_id: poolId,
      user_id: user.id,
      author_name: getDisplayName(userProfile),
      text: newMessage.trim(),
    });

    setSending(false);
  };

  // ── Render message ──────────────────────────────────────────────────
  const renderMessage = ({item}: {item: DbSmackMessage}) => {
    const isMe = item.user_id === user?.id;
    const time = new Date(item.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const isFlagged = item.is_flagged && item.moderation_status !== 'approved';
    const isRemoved = item.moderation_status === 'removed';
    const summaries = getReactionSummaries(item.id);

    if (isRemoved) {
      return (
        <View style={[styles.bubble, styles.bubbleRemoved]}>
          <Text style={styles.removedText}>Message removed by moderator</Text>
        </View>
      );
    }

    return (
      <View>
        <Pressable
          onLongPress={() => setSelectedMessageId(item.id)}
          delayLongPress={400}>
          <View
            style={[
              styles.bubble,
              isMe ? styles.bubbleMe : styles.bubbleThem,
              isFlagged && styles.bubbleFlagged,
            ]}>
            {isFlagged ? (
              <View style={styles.flaggedOverlay}>
                <Text style={styles.flaggedText}>Message flagged: under review</Text>
              </View>
            ) : (
              <>
                {!isMe && (
                  <Text style={styles.sender}>{item.author_name}</Text>
                )}
                <Text style={[styles.messageText, isMe && styles.messageTextMe]}>
                  {item.text}
                </Text>
                <Text style={[styles.time, isMe && styles.timeMe]}>{time}</Text>
              </>
            )}
          </View>
        </Pressable>

        {/* Reaction badges */}
        {summaries.length > 0 && !isFlagged && (
          <View style={[styles.reactionRow, isMe && styles.reactionRowMe]}>
            {summaries.map(s => {
              const iReacted = s.userIds.includes(user?.id ?? '');
              return (
                <TouchableOpacity
                  key={s.reaction}
                  style={[styles.reactionBadge, iReacted && styles.reactionBadgeMine]}
                  onPress={() => setReactorModal(s)}>
                  <Text style={styles.reactionEmoji}>{s.reaction}</Text>
                  {s.count > 1 && (
                    <Text style={[styles.reactionCount, {color: colors.textSecondary}]}>
                      {s.count}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>SmackTalk</Text>
          <Text style={styles.emptyText}>
            No messages yet. Be the first to talk trash!
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({animated: true})
          }
        />
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Talk trash..."
          placeholderTextColor={colors.textSecondary}
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={500}
          editable={!sending}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!newMessage.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!newMessage.trim() || sending}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>

      {/* Reaction Picker Modal — appears on long-press */}
      <Modal
        visible={selectedMessageId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMessageId(null)}>
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setSelectedMessageId(null)}>
          <View style={[styles.pickerContainer, {backgroundColor: colors.surface}]}>
            <View style={styles.pickerRow}>
              {SMACK_REACTIONS.allowed.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.pickerEmoji}
                  onPress={() =>
                    selectedMessageId && handleReaction(selectedMessageId, emoji)
                  }>
                  <Text style={styles.pickerEmojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Report + Block — only for other people's messages */}
            {selectedMessageId &&
              messages.find(m => m.id === selectedMessageId)?.user_id !== user?.id && (
                <>
                  <TouchableOpacity
                    style={styles.reportButton}
                    onPress={() =>
                      selectedMessageId && handleReport(selectedMessageId)
                    }>
                    <Text style={styles.reportText}>⚠️ Report Inappropriate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.reportButton}
                    onPress={() =>
                      selectedMessageId && handleBlockUser(selectedMessageId)
                    }>
                    <Text style={styles.reportText}>🚫 Block User</Text>
                  </TouchableOpacity>
                </>
              )}
          </View>
        </Pressable>
      </Modal>

      {/* Reactor List Modal — shows who reacted */}
      <Modal
        visible={reactorModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReactorModal(null)}>
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setReactorModal(null)}>
          <View style={[styles.reactorContainer, {backgroundColor: colors.surface}]}>
            <Text style={[styles.reactorTitle, {color: colors.textPrimary}]}>
              {reactorModal?.reaction}
            </Text>
            {reactorModal?.userNames.map((name, i) => (
              <Text
                key={`${name}-${i}`}
                style={[styles.reactorName, {color: colors.textPrimary}]}>
                {name}
              </Text>
            ))}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bubble: {
    maxWidth: '80%',
    padding: spacing.sm,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xs,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
  },
  bubbleFlagged: {
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  bubbleRemoved: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
    marginBottom: spacing.sm,
  },
  flaggedOverlay: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  flaggedText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  removedText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  sender: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A0A0A0',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  messageTextMe: {
    color: '#FFFFFF',
  },
  time: {
    fontSize: 10,
    color: '#A0A0A0',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timeMe: {
    color: 'rgba(255,255,255,0.7)',
  },
  // ── Reaction badges ──────────────────────────────────────────────
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  reactionRowMe: {
    alignSelf: 'flex-end',
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 3,
  },
  reactionBadgeMine: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  // ── Reaction picker ──────────────────────────────────────────────
  pickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pickerContainer: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    minWidth: 280,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  pickerEmoji: {
    padding: spacing.sm,
  },
  pickerEmojiText: {
    fontSize: 28,
  },
  reportButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  reportText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.error ?? '#E53935',
  },
  // ── Reactor list modal ───────────────────────────────────────────
  reactorContainer: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    minWidth: 200,
    alignItems: 'center',
  },
  reactorTitle: {
    fontSize: 32,
    marginBottom: spacing.md,
  },
  reactorName: {
    fontSize: 16,
    paddingVertical: 4,
  },
  // ── Input row ────────────────────────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  sendButton: {
    marginLeft: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    minHeight: 40,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
