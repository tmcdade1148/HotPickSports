import React, {useState} from 'react';
import {Text, TextInput} from '@shared/components/AppText';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {supabase} from '@shared/config/supabase';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';
import {FoundingWall} from '@shell/paywall';

/**
 * CreatePoolScreen — Form to create a new pool for the active event.
 * Generates an invite code automatically. Sets the new pool as active.
 * All Contests are private (invite-only). The public-Contest switch was
 * removed per the 2026-05-27 product call — HotPick is for groups who
 * already know each other; there's no public matchmaking.
 */
export function CreatePoolScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const user = useGlobalStore(s => s.user);
  const activeSport = useGlobalStore(s => s.activeSport);
  const createPool = useGlobalStore(s => s.createPool);

  const [poolName, setPoolName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Facade paywall (§6b): when a 2nd-or-later Contest is created during the
  // founding season, the server allows it and flags the wall. The Contest
  // already exists; the wall is informational, and dismissing it returns Home.
  const [showFoundingWall, setShowFoundingWall] = useState(false);

  const doCreate = async () => {
    if (!user?.id || !activeSport?.competition) return;

    setCreating(true);
    setError(null);

    // Log organizer acknowledgment
    await supabase.from('organizer_acknowledgments').insert({
      user_id: user.id,
      version: '1.0',
    });

    const result = await createPool({
      userId: user.id,
      competition: activeSport.competition,
      name: poolName.trim(),
      isPublic: false,
    });

    setCreating(false);

    if (result.pool) {
      if (result.showWall === 'pool_cap') {
        // Contest is created; prime with the founding wall, then return on close.
        setShowFoundingWall(true);
        return;
      }
      // Delay navigation to let the store update + HomeScreen re-render settle.
      // Without this, the JoinPoolModule unmount collides with the navigation
      // transition in Fabric's ShadowView diffing, causing a SIGSEGV.
      setTimeout(() => navigation.goBack(), 100);
    } else if (result.upgradeRequired) {
      setError(
        'You have reached the maximum number of Contests for your plan. Upgrade to create more Contests.',
      );
    } else {
      setError(result.error ?? 'Failed to create Contest. Please try again.');
    }
  };

  const handleCreate = () => {
    const trimmed = poolName.trim();
    if (trimmed.length < 3) {
      setError('Contest name must be at least 3 characters.');
      return;
    }
    if (trimmed.length > 30) {
      setError('Contest name must be 30 characters or less.');
      return;
    }
    if (!user?.id || !activeSport?.competition) return;

    Alert.alert(
      'Before You Create Your Contest',
      'HotPick Contests are for friendly competition only.\n\nCollecting money from participants — entry fees, prize pots, or any financial arrangement — is prohibited by our Terms of Service and may result in account termination.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'I Understand. Create My Contest', onPress: doCreate},
      ],
    );
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
          <Text style={styles.title}>Create Contest</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Contest Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Friends & Family"
            placeholderTextColor={colors.textSecondary}
            value={poolName}
            onChangeText={setPoolName}
            maxLength={30}
            autoFocus
          />

          <Text style={styles.privacyHint}>
            All Contests on HotPick are private. Only people you share the
            invite code with can join.
          </Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.createButton, creating && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={creating}>
            {creating ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.createButtonText}>Create Contest</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <FoundingWall
        visible={showFoundingWall}
        trigger="pool_cap"
        onClose={() => navigation.goBack()}
      />
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
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  privacyHint: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 17,
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
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
