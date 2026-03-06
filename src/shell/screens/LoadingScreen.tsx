import React, {useEffect, useRef} from 'react';
import {View, Text, ActivityIndicator, StyleSheet, LogBox} from 'react-native';

// Suppress red screen for Supabase auth retry errors on iOS simulator
LogBox.ignoreLogs(['AuthRetryableFetchError', 'Network request failed']);
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDefaultEvent} from '@sports/registry';
import {colors, spacing} from '@shared/theme';

export function LoadingScreen({navigation}: any) {
  const setUser = useGlobalStore(s => s.setUser);
  const setAuthLoading = useGlobalStore(s => s.setAuthLoading);
  const refreshAvailableEvents = useGlobalStore(s => s.refreshAvailableEvents);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);
  const fetchProfile = useGlobalStore(s => s.fetchProfile);
  const fetchUserPools = useGlobalStore(s => s.fetchUserPools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const ensureGlobalPoolMembership = useGlobalStore(
    s => s.ensureGlobalPoolMembership,
  );
  const subscribeSmackUnread = useGlobalStore(s => s.subscribeSmackUnread);
  const fetchSmackUnreadCounts = useGlobalStore(
    s => s.fetchSmackUnreadCounts,
  );
  const didNavigate = useRef(false);

  useEffect(() => {
    // Populate available events from registry
    refreshAvailableEvents();

    const defaultEvent = getDefaultEvent();

    // Safety timeout — if getSession hangs, go to Welcome after 5s
    const timeout = setTimeout(() => {
      if (!didNavigate.current) {
        didNavigate.current = true;
        setAuthLoading(false);
        navigation.replace('Welcome');
      }
    }, 5000);

    supabase.auth
      .getSession()
      .then(async ({data: {session}}) => {
        if (didNavigate.current) return;
        didNavigate.current = true;
        clearTimeout(timeout);
        setAuthLoading(false);

        if (!session) {
          navigation.replace('Welcome');
          return;
        }

        setUser(session.user);
        setActiveSport(defaultEvent);

        // Fetch full profile to determine onboarding state
        const profile = await fetchProfile(session.user.id);

        // Beta user migration: first_name null → ProfileSetup
        if (!profile || !profile.first_name) {
          navigation.replace('ProfileSetup');
          return;
        }

        // Ensure user is enrolled in global pools, then load pools
        await ensureGlobalPoolMembership();
        await fetchUserPools(session.user.id, defaultEvent.competition);
        const pools = useGlobalStore.getState().userPools;

        if (pools.length > 0) {
          // Restore persisted pool selection, or default to global pool, or first pool
          const persistedId = await AsyncStorage.getItem(
            `hotpick_active_pool_${defaultEvent.competition}`,
          );
          const persistedPool = persistedId
            ? pools.find(p => p.id === persistedId)
            : null;
          const globalPool = pools.find(p => p.is_global);
          setActivePoolId(
            persistedPool?.id ?? globalPool?.id ?? pools[0].id,
          );
          const poolIds = pools.map(p => p.id);
          await fetchSmackUnreadCounts(session.user.id, poolIds);
        }

        subscribeSmackUnread();
        navigation.replace('Home');
      })
      .catch(() => {
        if (didNavigate.current) return;
        didNavigate.current = true;
        clearTimeout(timeout);
        setAuthLoading(false);
        navigation.replace('Welcome');
      });

    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigation, setUser, setAuthLoading]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>HotPick</Text>
      <Text style={styles.subtitle}>Sports</Text>
      <ActivityIndicator
        size="large"
        color={colors.primary}
        style={styles.spinner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.primary,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '300',
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  spinner: {
    marginTop: spacing.lg,
  },
});
