import React, {useEffect, useRef, useState, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Keyboard,
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
import {HotPickFlame} from '@shared/components/HotPickFlame';
import {MentionAutocomplete} from '@shared/components/MentionAutocomplete';

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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatSmackTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});

  // Today
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return `Today @ ${timeStr}`;

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday @ ${timeStr}`;

  // Within this week (2-6 days ago)
  if (diffDays < 7) {
    return `${DAY_NAMES[date.getDay()]} @ ${timeStr}`;
  }

  // Within last week (7-13 days ago)
  if (diffDays < 14) {
    return `Last ${DAY_NAMES[date.getDay()]} @ ${timeStr}`;
  }

  // Beyond 14 days
  return 'More than a week ago';
}

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
  const [replyTo, setReplyTo] = useState<{id: string; authorName: string} | null>(null);
  const [mentions, setMentions] = useState<{userId: string; name: string}[]>([]);
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});
  const [expandedReplies, setExpandedReplies] = useState<Record<string, DbSmackMessage[]>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const isInitialLoad = useRef(true);
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
        .is('reply_to', null)
        .order('created_at', {ascending: false})
        .limit(50);

      if (data) {
        // Filter out messages from blocked users
        const filtered = (data as DbSmackMessage[]).reverse().filter(
          m => !blockedUserIds.has(m.user_id),
        );
        setMessages(filtered);
        setHasOlderMessages(data.length === 50);
        // Fetch reactions for all messages
        const msgIds = filtered.map(m => m.id);
        if (msgIds.length > 0) {
          await fetchReactions(msgIds);
          await fetchReplyCounts(msgIds);
        }
      }
    };

    isInitialLoad.current = true;
    fetchMessages().then(() => {
      // Scroll to bottom after initial load
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({animated: false});
        isInitialLoad.current = false;
      }, 100);
    });

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
          if (msg.user_id && blockedUserIds.has(msg.user_id)) return;

          if ((msg as any).reply_to) {
            // It's a reply — increment parent's reply count + append if expanded
            const parentId = (msg as any).reply_to;
            setReplyCounts(prev => ({...prev, [parentId]: (prev[parentId] ?? 0) + 1}));
            setExpandedReplies(prev => {
              if (!prev[parentId]) return prev;
              return {...prev, [parentId]: [...prev[parentId], msg]};
            });
          } else {
            // Top-level message — add to main feed
            setMessages(prev => [...prev, msg]);
          }
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

  // ── Load older messages (scroll-to-top pagination) ─────────────────
  const loadMore = async () => {
    if (loadingMore || !hasOlderMessages || messages.length === 0) return;
    setLoadingMore(true);
    const cursor = messages[0]?.created_at;
    const {data} = await supabase
      .from('smack_messages')
      .select('*')
      .eq('pool_id', poolId)
      .is('reply_to', null)
      .lt('created_at', cursor)
      .order('created_at', {ascending: false})
      .limit(50);

    if (data && data.length > 0) {
      const filtered = (data as DbSmackMessage[]).reverse().filter(
        m => !blockedUserIds.has(m.user_id),
      );
      setMessages(prev => {
        const combined = [...filtered, ...prev];
        // Cap at 200 messages — drop oldest
        return combined.length > 200 ? combined.slice(combined.length - 200) : combined;
      });
      setHasOlderMessages(data.length === 50);
      const msgIds = filtered.map(m => m.id);
      if (msgIds.length > 0) await fetchReactions(msgIds);
    } else {
      setHasOlderMessages(false);
    }
    setLoadingMore(false);
  };

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

  // ── Fetch reply counts for top-level messages ───────────────────────
  const fetchReplyCounts = async (parentIds: string[]) => {
    if (parentIds.length === 0) return;
    const {data} = await supabase
      .from('smack_messages')
      .select('reply_to')
      .in('reply_to', parentIds);
    if (data) {
      const counts: Record<string, number> = {};
      for (const row of data) {
        if (row.reply_to) {
          counts[row.reply_to] = (counts[row.reply_to] ?? 0) + 1;
        }
      }
      setReplyCounts(prev => ({...prev, ...counts}));
    }
  };

  // ── Toggle expanded replies for a message ──────────────────────────
  const toggleReplies = async (parentId: string) => {
    if (expandedReplies[parentId]) {
      setExpandedReplies(prev => {
        const next = {...prev};
        delete next[parentId];
        return next;
      });
      return;
    }
    const {data} = await supabase
      .from('smack_messages')
      .select('*')
      .eq('reply_to', parentId)
      .order('created_at', {ascending: true})
      .limit(50);
    if (data) {
      const filtered = (data as DbSmackMessage[]).filter(
        m => !blockedUserIds.has(m.user_id),
      );
      setExpandedReplies(prev => ({...prev, [parentId]: filtered}));
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
      // Optimistic remove
      setReactions(prev => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).filter(r => r.id !== existing.id),
      }));
      const {error} = await supabase.rpc('remove_smack_reaction', {
        p_message_id: messageId,
        p_reaction: emoji,
      });
      if (error) {
        // Rollback on failure
        setReactions(prev => ({
          ...prev,
          [messageId]: [...(prev[messageId] ?? []), existing],
        }));
      }
    } else {
      // Optimistic add
      const optimistic: DbSmackReaction = {
        id: `temp-${Date.now()}`,
        message_id: messageId,
        user_id: user.id,
        reaction: emoji,
        created_at: new Date().toISOString(),
      };
      setReactions(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] ?? []), optimistic],
      }));
      const {error} = await supabase.rpc('add_smack_reaction', {
        p_message_id: messageId,
        p_reaction: emoji,
      });
      if (error) {
        // Rollback on failure
        setReactions(prev => ({
          ...prev,
          [messageId]: (prev[messageId] ?? []).filter(r => r.id !== optimistic.id),
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

            // Push notification to pool organizer
            const {data: organizer} = await supabase
              .from('pool_members')
              .select('user_id')
              .eq('pool_id', poolId)
              .eq('role', 'organizer')
              .limit(1)
              .maybeSingle();

            if (organizer?.user_id && organizer.user_id !== user.id) {
              const flaggedMsg = messages.find(m => m.id === messageId);
              await supabase.from('notification_queue').insert({
                user_id: organizer.user_id,
                notification_type: 'organizer_broadcast',
                title: 'Message flagged in SmackTalk',
                body: `${flaggedMsg?.author_name ?? 'A member'}'s message was flagged as inappropriate`,
                data: {pool_id: poolId, message_id: messageId, escalate_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()},
                pool_id: poolId,
              });
            }
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
    const text = newMessage.trim();
    setNewMessage('');

    const {error: sendError} = await supabase.rpc('send_smack_message', {
      p_pool_id: poolId,
      p_text: text,
      p_reply_to: replyTo?.id ?? null,
      p_mentions: mentions.map(m => m.userId),
    });

    if (sendError) {
      console.error('[SmackTalk] send_smack_message RPC error:', sendError.message);
      Alert.alert('Send failed', sendError.message);
    }

    setReplyTo(null);
    setMentions([]);
    setSending(false);
  };

  // ── Render message ──────────────────────────────────────────────────
  const renderMessage = ({item}: {item: DbSmackMessage}) => {
    const isMe = item.user_id === user?.id;
    const time = formatSmackTime(new Date(item.created_at));
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

    // ── System message rendering ───────────────────────────────────
    const isSystemMessage = (item as any).message_type !== 'user' || item.user_id === null;
    if (isSystemMessage) {
      return (
        <View>
          <View style={styles.systemBubble}>
            <View style={styles.systemHeader}>
              <HotPickFlame size={16} active />
              <Text style={[styles.sender, {color: colors.primary, marginBottom: 0}]}>HotPick</Text>
            </View>
            <Text style={styles.systemText}>{item.text}</Text>
            <Text style={styles.time}>{time}</Text>
          </View>
          {/* Reactions on system messages */}
          {summaries.length > 0 && (
            <View style={styles.reactionRow}>
              {summaries.map(s => {
                const iReacted = s.userIds.includes(user?.id ?? '');
                return (
                  <TouchableOpacity
                    key={s.reaction}
                    style={[styles.reactionBadge, iReacted && styles.reactionBadgeMine]}
                    onPress={() => handleReaction(item.id, s.reaction)}>
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

        {/* Reply count + expanded replies — tucked directly under parent */}
        {(replyCounts[item.id] ?? 0) > 0 && (
          <TouchableOpacity
            style={{alignSelf: isMe ? 'flex-end' : 'flex-start', paddingHorizontal: 16, paddingTop: 2, paddingBottom: 2}}
            onPress={() => toggleReplies(item.id)}>
            <Text style={{fontSize: 12, fontWeight: '600', color: colors.primary}}>
              {expandedReplies[item.id]
                ? '▾ Hide replies'
                : `▸ ${replyCounts[item.id]} ${replyCounts[item.id] === 1 ? 'reply' : 'replies'}`}
            </Text>
          </TouchableOpacity>
        )}
        {expandedReplies[item.id]?.map(reply => (
          <View key={reply.id} style={[styles.replyBubble, isMe && {alignSelf: 'flex-end', marginLeft: 0, marginRight: 24}]}>
            <Text style={styles.sender}>{reply.author_name}</Text>
            <Text style={styles.messageText}>{reply.text}</Text>
            <Text style={styles.time}>{formatSmackTime(new Date(reply.created_at))}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    // KAV notes:
    //   behavior="padding" + keyboardVerticalOffset=0 is correct for a KAV
    //   that lives inside a tab screen. The KAV's bottom edge already sits
    //   above the tab bar, so RN's padding math (keyboard_height -
    //   tab_bar_height + verticalOffset) only needs offset=0. Any positive
    //   offset shows up as a literal white gap between input and keyboard.
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}>
      {messages.length === 0 ? (
        // Tap-to-dismiss: when the chat is empty there's no FlatList to
        // drag, so the empty state itself dismisses the keyboard on tap.
        <Pressable style={styles.emptyState} onPress={Keyboard.dismiss}>
          <Text style={styles.emptyTitle}>SmackTalk</Text>
          <Text style={styles.emptyText}>
            No messages yet. Be the first to talk trash!
          </Text>
        </Pressable>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          // Dragging down on the message list closes the keyboard, the
          // standard iOS Messages gesture. "interactive" follows the finger;
          // "on-drag" closes on any drag — either works, interactive feels
          // more native. Message long-press for reactions still works via
          // keyboardShouldPersistTaps="handled".
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            // Auto-scroll to bottom only on initial load and new messages, not loadMore
            if (!loadingMore) {
              flatListRef.current?.scrollToEnd({animated: !isInitialLoad.current});
            }
          }}
          onScroll={({nativeEvent}) => {
            if (nativeEvent.contentOffset.y < 50 && hasOlderMessages && !loadingMore) {
              loadMore();
            }
          }}
          scrollEventThrottle={200}
          maintainVisibleContentPosition={{minIndexForVisible: 0}}
        />
      )}

      {/* Mention autocomplete — above input */}
      {(() => {
        const atIdx = newMessage.lastIndexOf('@');
        const mentionQuery = atIdx >= 0 ? newMessage.slice(atIdx + 1).split(/\s/)[0] : '';
        if (atIdx < 0 || mentionQuery.length === 0) return null;
        return (
          <MentionAutocomplete
            poolId={poolId}
            query={mentionQuery}
            currentUserId={user?.id ?? ''}
            onSelect={({userId, name}) => {
              // Replace @partial with @fullName
              const before = newMessage.slice(0, atIdx);
              setNewMessage(`${before}@${name} `);
              setMentions(prev => [...prev, {userId, name}]);
            }}
          />
        );
      })()}

      {/* Reply chip */}
      {replyTo && (
        <View style={[styles.replyChip, {backgroundColor: colors.surface, borderColor: colors.border}]}>
          <Text style={{color: colors.textSecondary, fontSize: 12}}>
            Replying to @{replyTo.authorName}
          </Text>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Text style={{color: colors.textSecondary, fontSize: 14, fontWeight: '700', paddingLeft: 8}}>×</Text>
          </TouchableOpacity>
        </View>
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
            {/* Reply — only for user messages (not system) */}
            {selectedMessageId && (() => {
              const msg = messages.find(m => m.id === selectedMessageId);
              return msg && msg.user_id !== null && (msg as any).message_type !== 'system';
            })() && (
              <TouchableOpacity
                style={styles.reportButton}
                onPress={() => {
                  const msg = messages.find(m => m.id === selectedMessageId);
                  if (msg) {
                    setReplyTo({id: msg.id, authorName: msg.author_name});
                  }
                  setSelectedMessageId(null);
                }}>
                <Text style={styles.reportText}>💬 Reply</Text>
              </TouchableOpacity>
            )}
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
  systemBubble: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  systemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  systemText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  replyBubble: {
    marginLeft: 24,
    marginTop: 4,
    backgroundColor: colors.surface,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  replyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: spacing.xs,
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
