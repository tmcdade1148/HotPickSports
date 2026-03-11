import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDefaultEvent} from '@sports/registry';
import {getDisplayName} from '@shared/utils/displayName';
import {colors, spacing, borderRadius} from '@shared/theme';

export function PoolWelcomeScreen({navigation}: any) {
  const user = useGlobalStore(s => s.user);
  const userProfile = useGlobalStore(s => s.userProfile);
  const pendingInviteCode = useGlobalStore(s => s.pendingInviteCode);
  const clearPendingInviteCode = useGlobalStore(
    s => s.clearPendingInviteCode,
  );
  const joinPool = useGlobalStore(s => s.joinPool);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);
  const refreshAvailableEvents = useGlobalStore(
    s => s.refreshAvailableEvents,
  );
  const fetchUserPools = useGlobalStore(s => s.fetchUserPools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const subscribeSmackUnread = useGlobalStore(s => s.subscribeSmackUnread);
  const fetchSmackUnreadCounts = useGlobalStore(
    s => s.fetchSmackUnreadCounts,
  );

  const [inviteCode, setInviteCode] = useState('');
  const [joinedPool, setJoinedPool] = useState<{
    name: string;
  } | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const displayName = getDisplayName(userProfile);
  const hasDeepLinkInvite = !!pendingInviteCode;

  // Auto-join pool if there's a pending deep-link invite code
  useEffect(() => {
    if (pendingInviteCode && user?.id) {
      handleJoinWithCode(pendingInviteCode);
    }
  }, []);

  const handleJoinWithCode = async (code: string) => {
    if (!code.trim() || !user?.id) return;

    setJoining(true);
    setJoinError('');

    const result = await joinPool(user.id, code.trim());
    clearPendingInviteCode();

    if (result.pool) {
      setJoinedPool({name: result.pool.name});
    } else if (result.poolFull) {
      setJoinError('This pool is full and cannot accept new members.');
    } else {
      setJoinError(
        result.error ?? 'Could not join the pool. The invite code may be invalid or the pool is full.',
      );
    }
    setJoining(false);
  };

  const handleSubmitCode = () => {
    handleJoinWithCode(inviteCode);
  };

  const initializeAndNavigate = async () => {
    if (!user?.id) return;

    const defaultEvent = getDefaultEvent();
    refreshAvailableEvents();
    setActiveSport(defaultEvent);

    await fetchUserPools(user.id, defaultEvent.competition);
    const pools = useGlobalStore.getState().userPools;

    if (pools.length > 0) {
      const globalPool = pools.find(p => p.is_global);
      setActivePoolId(globalPool?.id ?? pools[0].id);
      const poolIds = pools.map(p => p.id);
      await fetchSmackUnreadCounts(user.id, poolIds);
    }
    subscribeSmackUnread();

    navigation.replace('Home');
  };

  // Deep-link joining or successful join — show confirmation
  if (hasDeepLinkInvite || joinedPool || joining) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {joining ? (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.joiningText}>Joining your pool...</Text>
            </>
          ) : joinError ? (
            <>
              <Text style={styles.title}>Hmm, that didn't work</Text>
              <Text style={styles.errorText}>{joinError}</Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={initializeAndNavigate}>
                <Text style={styles.primaryButtonText}>Continue anyway</Text>
              </TouchableOpacity>
            </>
          ) : joinedPool ? (
            <>
              <Text style={styles.checkmark}>{'\u{2705}'}</Text>
              <Text style={styles.title}>You're in!</Text>
              <Text style={styles.poolName}>{joinedPool.name}</Text>
              <Text style={styles.subtitle}>
                You're also in the HotPick NFL 2026 pool — compete with
                everyone on the platform.
              </Text>

              <View style={styles.mechanic}>
                <Text style={styles.mechanicTitle}>How HotPick works</Text>
                <Text style={styles.mechanicText}>
                  Pick winners each week. Designate one as your HotPick for
                  bonus points. Compete with your pool and climb the
                  leaderboard.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={initializeAndNavigate}>
                <Text style={styles.primaryButtonText}>Let's pick</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  // Organic path — ask for invite code
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.welcomeEmoji}>{'\u{1F44B}'}</Text>
          <Text style={styles.title}>Welcome, {displayName}!</Text>
          <Text style={styles.subtitle}>
            You're in the HotPick NFL 2026 pool — compete with everyone on
            the platform.
          </Text>

          <View style={styles.mechanic}>
            <Text style={styles.mechanicTitle}>How HotPick works</Text>
            <Text style={styles.mechanicText}>
              Pick winners each week. Designate one as your HotPick for bonus
              points. Compete with your pool and climb the leaderboard.
            </Text>
          </View>

          <View style={styles.inviteSection}>
            <Text style={styles.inviteLabel}>Have a pool invite code?</Text>
            <View style={styles.codeRow}>
              <TextInput
                style={styles.codeInput}
                placeholder="Enter code"
                placeholderTextColor={colors.textSecondary}
                value={inviteCode}
                onChangeText={text => {
                  setInviteCode(text.toUpperCase());
                  if (joinError) setJoinError('');
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                returnKeyType="go"
                onSubmitEditing={handleSubmitCode}
              />
              <TouchableOpacity
                style={[
                  styles.joinButton,
                  (!inviteCode.trim() || joining) && styles.joinButtonDisabled,
                ]}
                onPress={handleSubmitCode}
                disabled={!inviteCode.trim() || joining}>
                {joining ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.joinButtonText}>Join</Text>
                )}
              </TouchableOpacity>
            </View>
            {joinError ? (
              <Text style={styles.codeError}>{joinError}</Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={initializeAndNavigate}>
            <Text style={styles.primaryButtonText}>Skip — I'll add later</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  welcomeEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  checkmark: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  poolName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  mechanic: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    marginBottom: spacing.xl,
  },
  mechanicTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  mechanicText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  inviteSection: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  inviteLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  codeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    letterSpacing: 2,
    fontWeight: '600',
  },
  joinButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.4,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  codeError: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  joiningText: {
    marginTop: spacing.md,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
});
