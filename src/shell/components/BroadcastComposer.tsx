import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
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
  const poolMembers = useGlobalStore(s => s.poolMembers);

  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [broadcastsUsed, setBroadcastsUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  const remaining = MAX_PER_DAY - broadcastsUsed;
  const memberCount = poolMembers.filter(
    m => m.user_id !== useGlobalStore.getState().user?.id,
  ).length;
  const canSend = message.trim().length > 0 && remaining > 0 && !sending;

  useEffect(() => {
    if (visible) {
      setMessage('');
      setLoading(true);
      fetchBroadcastsToday(poolId).then(count => {
        setBroadcastsUsed(count);
        setLoading(false);
      });
    }
  }, [visible, poolId, fetchBroadcastsToday]);

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
              placeholder="Write a message to your pool..."
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

            {/* Send button */}
            <TouchableOpacity
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!canSend}>
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Send size={18} color="#FFFFFF" />
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
