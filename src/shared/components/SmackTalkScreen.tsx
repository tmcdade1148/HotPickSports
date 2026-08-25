import React, {useEffect, useRef, useState, useCallback} from 'react';
import {Text, TextInput} from '@shared/components/AppText';
import {
  AppState,
  type AppStateStatus,
  View,
  TouchableOpacity,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Alert,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {supabase} from '@shared/config/supabase';
import {logError} from '@shared/logging/logError';
import {useAuth} from '@shared/hooks/useAuth';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDisplayName} from '@shared/utils/displayName';
import {SMACK_REACTIONS} from '@shared/config/smackTalk';
import {
  LEXICON,
  chirpsOffHeading,
  chirpsOffBody,
  chirpsOffStartCta,
  chirpsOffJoinCta,
} from '@shared/lexicon';
import {spacing, borderRadius} from '@shared/theme';

import type {DbSmackMessage, DbSmackReaction} from '@shared/types/database';
import {useTheme} from '@shell/theme';
import {useNavReserve} from '@shared/hooks/useNavReserve';
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
  const navReserve = useNavReserve();
  // The composer reserves room for the TAB BAR (navReserve = NAV_BAR_HEIGHT +
  // insets.bottom, a constant). That reserve is only correct while the composer
  // is sitting on the tab bar. Once the keyboard lifts it, the tab bar is gone
  // behind the keyboard but the reserve rode up with the row and reads as a gap
  // between the composer and the keyboard.
  //
  // So: track the keyboard and swap the reserve for a small gap while it's up.
  // This is the padding only — the KAV's behavior values and
  // keyboardVerticalOffset={0} are deliberately untouched (see the notes on the
  // KAV below); the avoidance strategy was never the bug.
  //
  // NOT platform-gated, unlike the same listener pattern in ProfileSetupScreen /
  // PoolWelcomeScreen — those gate to Android because they're synthesising room
  // that iOS's behavior="padding" already provides. Here BOTH platforms lift the
  // composer (iOS by padding, Android by shrinking to "height"), so both carry
  // the stale reserve up with it.
  //
  // Event choice is per platform, and it matters: iOS fires will* IN STEP with
  // the keyboard animation, so the reserve is gone as the composer rises rather
  // than snapping shut a frame after it lands. Android doesn't fire will*
  // reliably — only did* — so it takes those and accepts the smaller jump.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardUp(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
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
  const [refreshing, setRefreshing] = useState(false);

  // Gaffer (organizer) identity for this pool — drives the Gaffer badge on a
  // message. Select the primitive, not the pool object, so this doesn't churn
  // renders. (It also fed the welcome-opener pre-fill, which is gone; the
  // contestName and isGaffer that existed only for that went with it.)
  const organizerId = useGlobalStore(
    s =>
      (s.userPools.find(p => p.id === poolId) ??
        s.visiblePools.find(p => p.id === poolId))?.organizer_id ?? null,
  );

  // Per-Contest Chirps posting switch (pools.chirps_enabled). Selected the same
  // primitive-only way as organizerId above.
  //
  // Default TRUE for anything but an explicit false: the column defaults true in
  // the database, so undefined here can only mean "not loaded yet" or an older
  // cached shape, and in both cases the existing behaviour is the safe answer.
  // Nothing is riding on this being right — RLS is the enforcement (a client
  // hide is a curtain, not a lock). This only decides what the user is offered.
  const chirpsEnabled = useGlobalStore(
    s =>
      (s.userPools.find(p => p.id === poolId) ??
        s.visiblePools.find(p => p.id === poolId))?.chirps_enabled !== false,
  );

  const navigation = useNavigation<any>();

  // Bumped on every optimistic reaction change. fetchReactions captures it and
  // discards its result if it changed mid-flight — so a stale full-replace
  // refetch can't briefly drop a reaction the user just added/removed before
  // its own realtime echo lands (the echo fires a fresh fetch right after).
  const reactionVersion = useRef(0);

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

  // The Gaffer welcome-opener PRE-FILL WAS REMOVED. It put words in the
  // Gaffer's mouth, and every Contest sending the same "personal" welcome read
  // as fake. The composer now starts empty for everyone, Gaffer included.
  //
  // The 'welcome' message_type is NOT retired: rows already carry it and
  // rendering treats them as ordinary chirps. We simply stop producing it — new
  // messages are always 'user'.

  // ── Realtime instrumentation ─────────────────────────────────────────
  // Both .subscribe() calls below were bare, so a channel that never connected
  // was indistinguishable from a working one. These log to client_error_log via
  // the existing logError sink — a device console is unreadable after the fact,
  // and the point is having data on Monday.
  //
  // EVERY status is logged, not only failures, because three outcomes need
  // telling apart and two of them look identical under error-only logging:
  //   1. no rows at all       -> callback never fired; setup never completed
  //   2. SUBSCRIBED, no INSERT-received rows -> channel up, events not
  //      delivering; look at the socket/service, not the RLS policies
  //   3. CHANNEL_ERROR/TIMED_OUT -> connection failure; directly actionable
  //
  // The channel name goes in the MESSAGE, not just the context: logError dedups
  // on (screen + message) for 30s, so two channels reporting the same status
  // would otherwise collapse into a single row and lose which one spoke.
  // No message content, no PII — existence, channel, status, pool only.
  const logChannelStatus = useCallback(
    (channel: 'messages' | 'reactions', status: string) => {
      logError(`realtime ${channel} channel: ${status}`, {
        screen: 'SmackTalkScreen',
        action: 'realtimeSubscribe',
        channel,
        status,
        poolId,
      });
    },
    [poolId],
  );

  // ── Fetch messages + reactions ──────────────────────────────────────
  // Hoisted out of the mount effect so the focus/foreground refetches below can
  // call the SAME loader. Before this, the fetch ran on [poolId, blockedUserIds]
  // only, which made Realtime the ONLY path to a new message after first load —
  // so a dropped channel meant a force-quit was the sole way to see a new chirp.
  const fetchMessages = useCallback(async () => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, blockedUserIds]);

  useEffect(() => {
    markPoolAsRead(poolId);

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
          // Arrival log — proves the handler FIRED. Without it, "SUBSCRIBED and
          // silent" is indistinguishable from "SUBSCRIBED, delivering, and the
          // UI drops it", and those have opposite fixes. Logged BEFORE the
          // blocked-user filter, so a message discarded by the client still
          // records that delivery worked. Existence only — no content, no PII.
          logError('realtime messages channel: INSERT received', {
            screen: 'SmackTalkScreen',
            action: 'realtimeArrival',
            channel: 'messages',
            poolId,
          });
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
      .subscribe(status => logChannelStatus('messages', status));

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
      .subscribe(status => logChannelStatus('reactions', status));

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(rxnChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, blockedUserIds, fetchMessages]);

  // ── Refetch on focus and on foreground ───────────────────────────────
  // Symptom fix, NOT a Realtime fix: a new chirp currently needs a force-quit to
  // appear. These two paths reload the feed whether or not the channel is
  // healthy, so they hold even if the (still undiagnosed) Realtime fault stays.
  // Deliberately no scroll — the user may be reading older messages.
  useFocusEffect(
    useCallback(() => {
      fetchMessages();
    }, [fetchMessages]),
  );

  // useFocusEffect covers tab focus but NOT an app foreground while this screen
  // is already focused — the common case for a chirp arriving while the phone is
  // in a pocket. The global useForegroundRefetch refreshes unread COUNTS, never
  // an open message list, so this screen needs its own listener. Same
  // background/inactive → active guard as that hook.
  useEffect(() => {
    let previous: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', next => {
      const wasBackgrounded = previous === 'background' || previous === 'inactive';
      previous = next;
      if (wasBackgrounded && next === 'active') fetchMessages();
    });
    return () => sub.remove();
  }, [fetchMessages]);

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
    const version = reactionVersion.current;
    const {data} = await supabase
      .from('smack_reactions')
      .select('*')
      .in('message_id', messageIds);

    // If the user toggled a reaction while this fetch was in flight, its result
    // is stale — applying it would briefly clobber the optimistic state (the
    // flicker). Drop it; the realtime echo of that toggle fires a fresh fetch.
    if (reactionVersion.current !== version) return;

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

  // ── Pull-to-refresh — re-run the existing initial-load query (same fetch the
  //    mount effect runs). No new Realtime subscription. ──────────────────────
  const refreshMessages = useCallback(async () => {
    setRefreshing(true);
    try {
      const {data} = await supabase
        .from('smack_messages')
        .select('*')
        .eq('pool_id', poolId)
        .is('reply_to', null)
        .order('created_at', {ascending: false})
        .limit(50);
      if (data) {
        const filtered = (data as DbSmackMessage[]).reverse().filter(
          m => !blockedUserIds.has(m.user_id),
        );
        setMessages(filtered);
        setHasOlderMessages(data.length === 50);
        const msgIds = filtered.map(m => m.id);
        if (msgIds.length > 0) {
          await fetchReactions(msgIds);
          await fetchReplyCounts(msgIds);
        }
      }
    } finally {
      setRefreshing(false);
    }
    // fetchReactions/fetchReplyCounts are stable component helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, blockedUserIds]);

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
    // Invalidate any reaction fetch already in flight so it can't overwrite the
    // optimistic update below (see reactionVersion / fetchReactions).
    reactionVersion.current += 1;

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
      'Report this Chirp?',
      "A Gaffer or Admin of this Contest will review it within 24 hours. If they take action, you and the person who posted it will be notified. If nothing happens in 24 hours, HotPick staff will step in.\n\nThe message will be hidden in the meantime.",
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
                title: 'Message flagged in Chirps',
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
      `Block ${authorName}? Their messages will be hidden in all your Contests. You can unblock from Settings.`,
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
      // Always 'user' now. The only thing that ever sent 'welcome' was the
      // Gaffer pre-fill, which is gone; the type itself still exists for the
      // rows that already carry it.
      p_message_type: 'user',
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
    // System posts (e.g. pick_lock) have a NULL author; everything authored by
    // a real user — normal chirps AND the Gaffer's 'welcome' opener — renders as
    // a chirp so the author + Gaffer badge show. (Keying off message_type !==
    // 'user' here would render the opener as an anonymous "HotPick" system row.)
    const isSystemMessage = item.user_id === null;
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
                  <View style={styles.senderRow}>
                    <Text style={styles.sender}>{item.author_name}</Text>
                    {organizerId !== null && item.user_id === organizerId && (
                      <Text style={styles.gafferBadge}>{LEXICON.gaffer.short}</Text>
                    )}
                  </View>
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
    //   iOS: behavior="padding" + keyboardVerticalOffset=0 — the KAV's bottom
    //   edge already sits above the tab bar, so RN's padding math only needs
    //   offset=0; any positive offset shows as a white gap above the keyboard.
    //   Android: Expo SDK 55 enables edge-to-edge by default, which makes the
    //   manifest's windowSoftInputMode="adjustResize" ineffective — so a
    //   behavior={undefined} KAV is a no-op and the keyboard covers the input.
    //   "height" makes the KAV shrink to the space above the keyboard, lifting
    //   the composer into view.
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>
      {messages.length === 0 ? (
        // Tap-to-dismiss: when the chat is empty there's no FlatList to
        // drag, so the empty state itself dismisses the keyboard on tap.
        <Pressable style={styles.emptyState} onPress={Keyboard.dismiss}>
          <Text style={styles.emptyTitle}>All quiet in here now.</Text>
          <Text style={styles.emptyText}>
            But this is where you find out what your friends really think of your team.
          </Text>
        </Pressable>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshMessages}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
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

      {/* POSTING SURFACE. When this Contest's Chirps switch is off, the whole
          composer goes — input, send, mention autocomplete and reply chip — and
          the explainer takes its place. The FEED above is untouched: system
          messages (score updates, pick locks, week results) keep landing and
          keep rendering, which is why the tab itself stays put. A missing tab
          reads as a broken build; a present tab with clean system posts and a
          reason reads as intentional. */}
      {chirpsEnabled ? (
      <>
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

      {/* Tab-bar reserve only while the keyboard is DOWN — see the note by the
          keyboard listener above. With the keyboard up the row sits on the
          keyboard, so the full reserve would be a gap; spacing.sm is breathing
          room, so the composer reads as deliberately placed rather than flush
          against the keyboard by accident. */}
      <View
        style={[
          styles.inputRow,
          {paddingBottom: keyboardUp ? spacing.sm : navReserve},
        ]}>
        <TextInput
          style={styles.input}
          placeholder="Speak your mind…"
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
      </>
      ) : (
        <View style={[styles.chirpsOffBox, {paddingBottom: navReserve}]}>
          <Text style={styles.chirpsOffHeading}>{chirpsOffHeading}</Text>
          <Text style={styles.chirpsOffBodyText}>{chirpsOffBody}</Text>
          <View style={styles.chirpsOffActions}>
            <TouchableOpacity
              style={styles.chirpsOffPrimary}
              onPress={() => navigation.navigate('CreatePool')}>
              <Text style={styles.chirpsOffPrimaryText}>{chirpsOffStartCta}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chirpsOffSecondary}
              onPress={() => navigation.navigate('JoinPool')}>
              <Text style={styles.chirpsOffSecondaryText}>{chirpsOffJoinCta}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  sender: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
    marginBottom: 2,
  },
  gafferBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.onPrimary,
    backgroundColor: colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  messageTextMe: {
    color: colors.onPrimary,
  },
  time: {
    fontSize: 10,
    color: colors.textTertiary,
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
    color: colors.error,
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
  // ── Chirps-off explainer (replaces the composer) ─────────────────
  chirpsOffBox: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  chirpsOffHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  chirpsOffBodyText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  chirpsOffActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chirpsOffPrimary: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  chirpsOffPrimaryText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  chirpsOffSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  chirpsOffSecondaryText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
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
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
