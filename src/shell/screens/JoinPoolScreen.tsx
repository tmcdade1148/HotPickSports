import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

/**
 * JoinPoolScreen — Enter a pool invite code (6–12 alphanumeric chars).
 * Auto-uppercases input, strips whitespace and hyphens (forgiving entry —
 * "JOES-2026" works just like "JOES2026"). Sets the joined pool as active
 * on success. Server-side `join_pool_by_invite` is authoritative.
 */
const INVITE_CODE_RE = /^[0-9A-Z]+$/;
const INVITE_CODE_MIN = 6;
const INVITE_CODE_MAX = 12;

export function JoinPoolScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const user = useGlobalStore(s => s.user);
  const joinPool = useGlobalStore(s => s.joinPool);

  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizeCode = (raw: string) =>
    raw.toUpperCase().replace(/[\s-]/g, '');

  const handleJoin = async () => {
    const code = normalizeCode(inviteCode);
    if (code.length < INVITE_CODE_MIN || code.length > INVITE_CODE_MAX) {
      setError(`Invite code must be ${INVITE_CODE_MIN}–${INVITE_CODE_MAX} characters.`);
      return;
    }
    if (!INVITE_CODE_RE.test(code)) {
      setError('Invite code can only contain letters and numbers.');
      return;
    }
    if (!user?.id) {
      return;
    }

    setJoining(true);
    setError(null);

    const result = await joinPool(user.id, code);

    setJoining(false);

    if (result.pool) {
      navigation.goBack();
    } else if (result.poolFull) {
      setError('This pool is full and cannot accept new members.');
    } else {
      setError(result.error ?? 'Invalid invite code. Please check and try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Join Pool</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Invite Code</Text>
          <TextInput
            style={styles.input}
            placeholder="ABC123"
            placeholderTextColor={colors.textSecondary}
            value={inviteCode}
            onChangeText={text => setInviteCode(normalizeCode(text))}
            maxLength={INVITE_CODE_MAX}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
          />

          <Text style={styles.hint}>
            Ask a friend for their pool invite code ({INVITE_CODE_MIN}–{INVITE_CODE_MAX} letters and numbers).
          </Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.joinButton, joining && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={joining}>
            {joining ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.joinButtonText}>Join Pool</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  backButton: {
    fontSize: 16,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  form: {
    padding: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: spacing.md,
  },
  hint: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  joinButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  joinButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
