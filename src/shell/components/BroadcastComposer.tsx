import React, {useState, useEffect} from 'react';
import {Text, TextInput} from '@shared/components/AppText';
import {
  View,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {X, Send} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';
import {LEXICON} from '@shared/lexicon';

const MAX_CHARS = 160;
const MAX_PER_DAY = 3;

interface BroadcastComposerProps {
  poolId: string;
  poolName: string;
  visible: boolean;
  onClose: () => void;
}

export function BroadcastComposer({
  poolId,
  poolName,
  visible,
  onClose,
}: BroadcastComposerProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const broadcastToPool = useGlobalStore(s => s.broadcastToPool);
  const fetchBroadcastsToday = useGlobalStore(s => s.fetchBroadcastsToday);
  const fetchPoolMembers = useGlobalStore(s => s.fetchPoolMembers);
  const poolMembers = useGlobalStore(s => s.poolMembers);

  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [broadcastsUsed, setBroadcastsUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  const remaining = MAX_PER_DAY - broadcastsUsed;
  const memberCount = poolMembers.filter(
    m => m.user_id !== useGlobalStore.getState().user?.id,
  ).length;
  // memberCount > 0 is NEW. A broadcast the app believes reaches nobody still
  // consumes one of only three sends per 24h, so a Gaffer who tries twice has
  // spent two thirds of the day's allowance before anything is diagnosed.
  // This is a courtesy guard, never authority — the server counts for itself.
  const canSend =
    message.trim().length > 0 && remaining > 0 && memberCount > 0 && !sending;

  useEffect(() => {
    if (!visible) return;
    setMessage('');
    setLoading(true);
    // THE FIX. poolMembers has exactly one populator, fetchPoolMembers, and its
    // only other caller is PoolMembersScreen — so before this the composer's
    // count was a side effect of having visited a different screen. Settings →
    // Broadcast without passing through Members left it at its initial [] and
    // the composer told a Gaffer with twelve members that they had zero.
    //
    // The surface that DISPLAYS the number fetches the number. Do not "fix"
    // this by calling fetchPoolMembers from a navigator or at boot — that is
    // the same fragility moved one screen further out.
    //
    // Await BOTH before clearing loading: the whole content block below is
    // gated on `loading`, so nothing renders a count mid-flight. A momentary 0
    // that corrects itself is indistinguishable from the bug being fixed.
    //
    // .finally, not .then — a failed fetch must still clear the spinner. The
    // count then stays 0 and the zero-guard blocks the send, which is the
    // conservative outcome: better to refuse than to send blind.
    Promise.all([fetchBroadcastsToday(poolId), fetchPoolMembers(poolId)])
      .then(([count]) => setBroadcastsUsed(count))
      .finally(() => setLoading(false));
  }, [visible, poolId, fetchBroadcastsToday, fetchPoolMembers]);

  const handleSend = () => {
    if (!canSend) return;

    Alert.alert(
      'Send Broadcast',
      `Send this message to ${memberCount} member${memberCount !== 1 ? 's' : ''} of ${poolName}?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Send',
          onPress: async () => {
            setSending(true);
            const result = await broadcastToPool(poolId, message.trim());
            setSending(false);

            if (result.success) {
              Alert.alert(
                'Sent',
                `Message delivered to ${result.recipients} member${result.recipients !== 1 ? 's' : ''}.`,
              );
              onClose();
            } else if (result.error === 'rate_limited') {
              setBroadcastsUsed(MAX_PER_DAY);
              Alert.alert(
                'Rate Limit',
                'You have reached the maximum of 3 broadcasts per day.',
              );
            } else {
              Alert.alert(
                'Error',
                result.error ?? 'Failed to send broadcast',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <X size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Broadcast</Text>
          <View style={{width: 24}} />
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <View style={styles.content}>
            {/* Rate limit info */}
            <View style={styles.rateInfo}>
              <Text
                style={[
                  styles.rateText,
                  remaining === 0 && styles.rateTextExhausted,
                ]}>
                {remaining} broadcast{remaining !== 1 ? 's' : ''} remaining
                today
              </Text>
            </View>

            {/* Message input */}
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={text => setMessage(text.slice(0, MAX_CHARS))}
              placeholder="Write a message to your Contest..."
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={MAX_CHARS}
              editable={remaining > 0}
              autoFocus
            />

            {/* Character count */}
            <Text
              style={[
                styles.charCount,
                message.length > MAX_CHARS - 20 && styles.charCountWarning,
              ]}>
              {message.length}/{MAX_CHARS}
            </Text>

            {/* Zero-member state. Legitimately reachable — a brand-new Contest
                whose Gaffer has invited nobody yet — so this is NOT an error.
                One quiet line in secondary text, no Alert (the Player hasn't
                acted, there is nothing to interrupt) and no error styling. */}
            {memberCount === 0 && (
              <Text style={styles.zeroMembers}>
                This {LEXICON.contest.singular} has no other members yet. Invite
                someone and you'll be able to send a broadcast.
              </Text>
            )}

            {/* Send button */}
            <TouchableOpacity
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!canSend}>
              {sending ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <>
                  <Send size={18} color={colors.onPrimary} />
                  <Text style={styles.sendButtonText}>
                    Send to {memberCount} member
                    {memberCount !== 1 ? 's' : ''}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  rateInfo: {
    marginBottom: spacing.md,
  },
  rateText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  rateTextExhausted: {
    color: colors.error,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  charCountWarning: {
    color: colors.error,
  },
  // Deliberately textSecondary, NOT colors.error — an empty new Contest is a
  // normal state, not a failure, and the copy must not read like one.
  zeroMembers: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
