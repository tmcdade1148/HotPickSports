import React, {useEffect, useRef} from 'react';
import {View, Text, ActivityIndicator, StyleSheet, LogBox} from 'react-native';

// Suppress red screen for Supabase auth retry errors on iOS simulator
LogBox.ignoreLogs(['AuthRetryableFetchError', 'Network request failed']);
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDefaultEvent} from '@sports/registry';
import {colors, spacing} from '@shared/theme';

export function LoadingScreen({navigation}: any) {
  const setUser = useGlobalStore(s => s.setUser);
  const setAuthLoading = useGlobalStore(s => s.setAuthLoading);
  const loadPersistedPoolId = useGlobalStore(s => s.loadPersistedPoolId);
  const refreshAvailableEvents = useGlobalStore(s => s.refreshAvailableEvents);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);
  const fetchProfile = useGlobalStore(s => s.fetchProfile);
  const fetchUserPools = useGlobalStore(s => s.fetchUserPools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const didNavigate = useRef(false);

  useEffect(() => {
    // Populate available events from registry
    refreshAvailableEvents();

    const defaultEvent = getDefaultEvent();

    // Safety timeout — if getSession hangs, go to SignIn after 5s
    const timeout = setTimeout(() => {
      if (!didNavigate.current) {
        didNavigate.current = true;
        setAuthLoading(false);
        navigation.replace('SignIn');
      }
    }, 5000);

    supabase.auth.getSession().then(async ({data: {session}}) => {
      if (didNavigate.current) return;
      didNavigate.current = true;
      clearTimeout(timeout);
      setAuthLoading(false);
      if (session) {
        setUser(session.user);

        // Set the default sport so HomeScreen has it immediately
        setActiveSport(defaultEvent);

        // Await profile fetch — ensures displayName is loaded before
        // HomeScreen renders (fixes Android race condition)
        await fetchProfile(session.user.id);

        // Fetch pools and auto-select "2025 Public Beta Pool" as default
        await fetchUserPools(session.user.id, defaultEvent.competition);
        const pools = useGlobalStore.getState().userPools;
        const betaPool = pools.find(p => p.name === '2025 Public Beta Pool');
        if (betaPool) {
          setActivePoolId(betaPool.id);
        } else if (pools.length > 0) {
          // Fallback: select the first pool
          setActivePoolId(pools[0].id);
        } else {
          // Try persisted pool ID
          await loadPersistedPoolId(defaultEvent.competition);
        }

        // Fetch SmackTalk unread counts + start Realtime subscription
        const poolIds = pools.map(p => p.id);
        if (poolIds.length > 0) {
          await useGlobalStore
            .getState()
            .fetchSmackUnreadCounts(session.user.id, poolIds);
        }
        useGlobalStore.getState().subscribeSmackUnread();

        navigation.replace('Home');
      } else {
        navigation.replace('SignIn');
      }
    }).catch(() => {
      if (didNavigate.current) return;
      didNavigate.current = true;
      clearTimeout(timeout);
      setAuthLoading(false);
      navigation.replace('SignIn');
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
