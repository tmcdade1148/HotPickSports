import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {colors, spacing, borderRadius} from '@shared/theme';

/**
 * CreatePoolScreen — Form to create a new pool for the active event.
 * Generates an invite code automatically. Sets the new pool as active.
 */
export function CreatePoolScreen({navigation}: any) {
  const user = useGlobalStore(s => s.user);
  const activeSport = useGlobalStore(s => s.activeSport);
  const createPool = useGlobalStore(s => s.createPool);

  const [poolName, setPoolName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmed = poolName.trim();
    if (trimmed.length < 3) {
      setError('Pool name must be at least 3 characters.');
      return;
    }
    if (trimmed.length > 30) {
      setError('Pool name must be 30 characters or less.');
      return;
    }
    if (!user?.id || !activeSport?.competition) {
      return;
    }

    setCreating(true);
    setError(null);

    const pool = await createPool({
      userId: user.id,
      competition: activeSport.competition,
      name: trimmed,
      isPublic,
    });

    setCreating(false);

    if (pool) {
      navigation.goBack();
    } else {
      setError('Failed to create pool. Please try again.');
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
          <Text style={styles.title}>Create Pool</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Pool Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Friends & Family"
            placeholderTextColor={colors.textSecondary}
            value={poolName}
            onChangeText={setPoolName}
            maxLength={30}
            autoFocus
          />

          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Public Pool</Text>
              <Text style={styles.switchHint}>
                Anyone can find and join this pool
              </Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{false: colors.border, true: colors.primary}}
              thumbColor="#FFFFFF"
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.createButton, creating && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={creating}>
            {creating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.createButtonText}>Create Pool</Text>
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
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  switchInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  switchHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  createButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
