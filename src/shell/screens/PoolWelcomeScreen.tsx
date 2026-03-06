import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
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

  const [joinedPool, setJoinedPool] = useState<{
    name: string;
    memberCount: number;
  } | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const displayName = getDisplayName(userProfile);
  const hasInvite = !!pendingInviteCode;

  // Auto-join pool if there's a pending invite code
  useEffect(() => {
    if (pendingInviteCode && user?.id) {
      handleJoinInvitePool();
    }
  }, []);

  const handleJoinInvitePool = async () => {
    if (!pendingInviteCode || !user?.id) return;

    setJoining(true);
    setJoinError('');

    const pool = await joinPool(user.id, pendingInviteCode);
    clearPendingInviteCode();

    if (pool) {
      // Get member count
      setJoinedPool({name: pool.name, memberCount: 0});
    } else {
      setJoinError(
        'Could not join the pool. The invite code may be invalid or the pool is full.',
      );
    }
    setJoining(false);
  };

  const handleLetsGo = async () => {
    await initializeAndNavigate();
  };

  const handleStartPool = () => {
    // Set activeSport before navigating — CreatePoolScreen needs it for competition
    const defaultEvent = getDefaultEvent();
    refreshAvailableEvents();
    setActiveSport(defaultEvent);
    navigation.replace('CreatePool');
  };

  const handleEnterCode = () => {
    const defaultEvent = getDefaultEvent();
    refreshAvailableEvents();
    setActiveSport(defaultEvent);
    navigation.replace('JoinPool');
  };

  const initializeAndNavigate = async () => {
    if (!user?.id) return;

    const defaultEvent = getDefaultEvent();
    refreshAvailableEvents();
    setActiveSport(defaultEvent);

    await fetchUserPools(user.id, defaultEvent.competition);
    const pools = useGlobalStore.getState().userPools;

    if (pools.length > 0) {
      // Default to global pool, or first pool
      const globalPool = pools.find(p => p.is_global);
      setActivePoolId(globalPool?.id ?? pools[0].id);
      const poolIds = pools.map(p => p.id);
      await fetchSmackUnreadCounts(user.id, poolIds);
    }
    subscribeSmackUnread();

    navigation.replace('Home');
  };

  // Invite path — show joined pool confirmation
  if (hasInvite || joinedPool || joining) {
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
                onPress={handleLetsGo}>
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
                onPress={handleLetsGo}>
                <Text style={styles.primaryButtonText}>Let's pick</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  // Organic path — no invite, but user is auto-enrolled in global pool
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.welcomeEmoji}>{'\u{1F44B}'}</Text>
        <Text style={styles.title}>Welcome, {displayName}!</Text>
        <Text style={styles.subtitle}>
          You're in the HotPick NFL 2026 pool — compete with everyone on the
          platform. Want to play with friends? Start your own pool or enter an
          invite code.
        </Text>

        <View style={styles.mechanic}>
          <Text style={styles.mechanicTitle}>How HotPick works</Text>
          <Text style={styles.mechanicText}>
            Pick winners each week. Designate one as your HotPick for bonus
            points. Compete with your pool and climb the leaderboard.
          </Text>
        </View>

        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleLetsGo}>
            <Text style={styles.primaryButtonText}>Let's go</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleStartPool}>
            <Text style={styles.secondaryButtonText}>Start a pool</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleEnterCode}>
            <Text style={styles.skipText}>Have an invite code?</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  buttonsContainer: {
    width: '100%',
    gap: spacing.sm,
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
  secondaryButton: {
    backgroundColor: colors.background,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipText: {
    fontSize: 14,
    color: colors.textSecondary,
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
