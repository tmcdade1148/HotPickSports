import React, {useEffect, useRef} from 'react';
import {LogBox} from 'react-native';

// Suppress red screen for Supabase auth retry errors on iOS simulator
LogBox.ignoreLogs(['AuthRetryableFetchError', 'Network request failed']);
import AsyncStorage from '@react-native-async-storage/async-storage';
import BootSplash from 'react-native-bootsplash';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDefaultEvent} from '@sports/registry';

/**
 * LoadingScreen — bootstraps auth session and navigates to the first real screen.
 *
 * CRITICAL: This component returns `null` while bootstrapping. Returning any
 * React view (even a matching background View) causes a "double splash" effect
 * on Android 12+ where the native splash briefly overlaps with a React-rendered
 * layer. Returning `null` keeps the native BootSplash visible until BootSplash.hide()
 * fires right before navigation, which then fades cleanly to the destination screen.
 *
 * The native splash stays visible from the moment the user taps the icon, through
 * auth bootstrap, until BootSplash.hide() is called just before navigation.replace().
 */
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
        BootSplash.hide({fade: true}).catch(() => {});
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
          BootSplash.hide({fade: true}).catch(() => {});
          navigation.replace('Welcome');
          return;
        }

        setUser(session.user);
        setActiveSport(defaultEvent);

        // ── ROUND 1 (parallel) ──────────────────────────────────────
        // fetchProfile, fetchCurrentTosVersion, and ensureGlobalPoolMembership
        // all need only userId — none depend on each other.
        const [profile, currentTosVersion] = await Promise.all([
          fetchProfile(session.user.id),
          useGlobalStore.getState().fetchCurrentTosVersion(),
          ensureGlobalPoolMembership(),
        ]);

        // Bail checks (same logic, using already-fetched values)
        if (!profile || !profile.first_name) {
          BootSplash.hide({fade: true}).catch(() => {});
          navigation.replace('ProfileSetup');
          return;
        }

        if (currentTosVersion && useGlobalStore.getState().needsTosUpdate(currentTosVersion)) {
          BootSplash.hide({fade: true}).catch(() => {});
          navigation.replace('TosVersionGate');
          return;
        }

        // ── ROUND 2 (parallel) ──────────────────────────────────────
        // fetchUserPools and AsyncStorage reads need only competition string.
        const [, defaultId, activeId] = await Promise.all([
          fetchUserPools(session.user.id, defaultEvent.competition),
          AsyncStorage.getItem(`hotpick_default_pool_${defaultEvent.competition}`)
            .catch(() => null),
          AsyncStorage.getItem(`hotpick_active_pool_${defaultEvent.competition}`)
            .catch(() => null),
        ]);

        const pools = useGlobalStore.getState().userPools;

        if (pools.length > 0) {
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

          // ── ROUND 3 (parallel) ────────────────────────────────────
          const poolIds = pools.map(p => p.id);
          await Promise.all([
            useGlobalStore.getState().loadDefaultPoolId(defaultEvent.competition),
            fetchSmackUnreadCounts(session.user.id, poolIds),
          ]);
        }

        subscribeSmackUnread();
        BootSplash.hide({fade: true}).catch(() => {});
        navigation.replace('Home');
      })
      .catch(() => {
        if (didNavigate.current) return;
        didNavigate.current = true;
        clearTimeout(timeout);
        setAuthLoading(false);
        BootSplash.hide({fade: true}).catch(() => {});
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

  return null;
}
