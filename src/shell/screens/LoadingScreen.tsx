import React, {useEffect, useRef} from 'react';
import {View, Image, StyleSheet, LogBox} from 'react-native';

// Suppress red screen for Supabase auth retry errors on iOS simulator
LogBox.ignoreLogs(['AuthRetryableFetchError', 'Network request failed']);
import AsyncStorage from '@react-native-async-storage/async-storage';
import BootSplash from 'react-native-bootsplash';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDefaultEvent} from '@sports/registry';

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
    // Dismiss native splash — LoadingScreen has matching background
    BootSplash.hide({fade: true}).catch(() => {});

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
          // Priority: default pool → last active pool → global pool → first pool
          let defaultId: string | null = null;
          let activeId: string | null = null;
          try {
            defaultId = await AsyncStorage.getItem(
              `hotpick_default_pool_${defaultEvent.competition}`,
            );
            activeId = await AsyncStorage.getItem(
              `hotpick_active_pool_${defaultEvent.competition}`,
            );
          } catch {
            // AsyncStorage read failed — proceed with fallbacks
          }

          const defaultPool = defaultId
            ? pools.find(p => p.id === defaultId)
            : null;
          const activePool = activeId
            ? pools.find(p => p.id === activeId)
            : null;
          // Partner pools get priority when no manual default is set
          const partnerPools = pools
            .filter(p => (p.brand_config as any)?.is_branded)
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          const firstPartnerPool = partnerPools[0] ?? null;
          const globalPool = pools.find(p => p.is_global);
          const startPoolId =
            defaultPool?.id ??
            firstPartnerPool?.id ??
            activePool?.id ??
            globalPool?.id ??
            pools[0].id;

          setActivePoolId(startPoolId);

          // Load the default pool ID into store state for the star icon
          if (defaultId) {
            useGlobalStore.getState().loadDefaultPoolId(defaultEvent.competition);
          }

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
      <Image
        source={require('../../../assets/hotpick-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: '30%',
    // ✅ PERMITTED EXCEPTION — matches native splash exactly.
    // See CLAUDE.md Section 16 — Splash Screen Color Exception.
    backgroundColor: '#082640',
  },
  logo: {
    width: 240,
    height: 240,
  },
});
