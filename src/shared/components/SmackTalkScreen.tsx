import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import {supabase} from '@shared/config/supabase';
import {useAuth} from '@shared/hooks/useAuth';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDisplayName} from '@shared/utils/displayName';
import {spacing, borderRadius} from '@shared/theme';
import {PoweredByHotPick} from '@shell/components/PoweredByHotPick';
import type {DbSmackMessage} from '@shared/types/database';
import {useTheme} from '@shell/theme';

interface SmackTalkScreenProps {
  poolId: string;
}

/**
 * SmackTalkScreen — Real-time pool chat.
 * Shared across all templates (tournament, season, series).
 * Subscribes to Supabase Realtime for instant message delivery.
 */
export function SmackTalkScreen({poolId}: SmackTalkScreenProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const [messages, setMessages] = useState<DbSmackMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const {user} = useAuth();
  const userProfile = useGlobalStore(s => s.userProfile);
  const markPoolAsRead = useGlobalStore(s => s.markPoolAsRead);
  const flatListRef = useRef<FlatList<DbSmackMessage>>(null);

  useEffect(() => {
    // Mark pool as read on open
    markPoolAsRead(poolId);

    // Fetch existing messages
    const fetchMessages = async () => {
      const {data} = await supabase
        .from('smack_messages')
        .select('*')
        .eq('pool_id', poolId)
        .order('created_at', {ascending: true});

      if (data) {
        setMessages(data as DbSmackMessage[]);
      }
    };

    fetchMessages();

    // Subscribe to new messages via Realtime
    const channel = supabase
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
          setMessages(prev => [...prev, msg]);
          // Mark as read immediately since user is viewing this screen
          markPoolAsRead(poolId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poolId, markPoolAsRead]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user?.id || sending) {
      return;
    }

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

  const renderMessage = ({item}: {item: DbSmackMessage}) => {
    const isMe = item.user_id === user?.id;
    const time = new Date(item.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        {!isMe && (
          <Text style={styles.sender}>
            {item.author_name}
          </Text>
        )}
        <Text style={[styles.messageText, isMe && styles.messageTextMe]}>
          {item.text}
        </Text>
        <Text style={[styles.time, isMe && styles.timeMe]}>{time}</Text>
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

      <PoweredByHotPick />
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
    marginBottom: spacing.sm,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
  },
  sender: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
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
    color: colors.textSecondary,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timeMe: {
    color: 'rgba(255,255,255,0.7)',
  },
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
