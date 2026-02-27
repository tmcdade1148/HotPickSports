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
import {colors, spacing, borderRadius} from '@shared/theme';

/**
 * JoinPoolScreen — Enter a 6-character invite code to join an existing pool.
 * Auto-uppercases input. Sets the joined pool as active on success.
 */
export function JoinPoolScreen({navigation}: any) {
  const user = useGlobalStore(s => s.user);
  const joinPool = useGlobalStore(s => s.joinPool);

  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError('Invite code must be 6 characters.');
      return;
    }
    if (!user?.id) {
      return;
    }

    setJoining(true);
    setError(null);

    const pool = await joinPool(user.id, code);

    setJoining(false);

    if (pool) {
      navigation.goBack();
    } else {
      setError('Invalid invite code. Please check and try again.');
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
            onChangeText={text => setInviteCode(text.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
          />

          <Text style={styles.hint}>
            Ask a friend for their 6-character pool invite code.
          </Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.joinButton, joining && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={joining}>
            {joining ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.joinButtonText}>Join Pool</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
    color: colors.text,
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
    color: colors.text,
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
