import React, {useEffect, useRef} from 'react';
import {LogBox} from 'react-native';

// Suppress red screen for Supabase auth retry errors on iOS simulator
LogBox.ignoreLogs(['AuthRetryableFetchError', 'Network request failed']);
import AsyncStorage from '@react-native-async-storage/async-storage';
import BootSplash from 'react-native-bootsplash';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {
  ACTIVE_COMPETITION_KEY,
  parseActiveCompetition,
} from '@shell/stores/persistedCompetition';
import {getDefaultEvent, getEventByCompetition} from '@sports/registry';
import {resolvePendingInviteCodeOnLaunch} from '@shell/services/pendingInvite';
import {registerForPushNotifications} from '@shell/services/pushNotifications';
import {reportClientInfo} from '@shell/services/reportClientInfo';

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
    // Resolve a pending invite code for the deferred deep-link flow: restore a
    // persisted code, or (first launch only) probe the clipboard for one the
    // landing page copied. Fire-and-forget — it lands in the store well before
    // the user reaches PoolWelcome, which also re-resolves as a safety net.
    resolvePendingInviteCodeOnLaunch();

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

        // Client-build telemetry, once per cold start. Fire-and-forget — it
        // never blocks, delays or gates boot.
        //
        // Placed HERE, before the ProfileSetup and TosVersionGate bails below,
        // not after them. A Player stuck at either has a valid session and is
        // exactly the population this table exists to make visible; after the
        // bails they would stay invisible, which is the failure that made the
        // failed-signup investigation inferential in the first place.
        reportClientInfo();

        // Restore the last-selected competition (REGISTRY-03 Part B). This is
        // what makes an invite code a durable door: switched once, it stays
        // until the player switches again or the competition retires.
        //
        // Validation chain — restore wins over default derivation, and loses
        // to validation. parseActiveCompetition answers "did THIS user save
        // it?", so a value left behind by another account on a shared device
        // never restores. getEventByCompetition then answers "registered?"
        // and applies the availableUntil window, so a saved nfl_2026_pre
        // stops restoring at 2026-09-02T11:00:00Z with no extra check. It
        // looks across gated events too, so a beta tester's sim selection
        // still survives; visibility is enforced separately by the
        // profileSlice defense-in-depth once the RPC resolves. Any failure —
        // missing key, wrong uid, malformed record, unknown competition,
        // retired competition, storage error — falls back to defaultEvent,
        // i.e. exactly today's behaviour.
        let eventToActivate = defaultEvent;
        try {
          const raw = await AsyncStorage.getItem(ACTIVE_COMPETITION_KEY);
          const savedCompetition = parseActiveCompetition(raw, session.user.id);
          if (savedCompetition) {
            const match = getEventByCompetition(savedCompetition);
            if (match) eventToActivate = match;
          }
        } catch (err) {
          console.warn('[LoadingScreen] competition restore failed:', err);
        }
        setActiveSport(eventToActivate);

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
        // fetchUserPools and AsyncStorage reads need only competition
        // string. Use the resolved active sport (set inside fetchProfile
        // → loadVisibleCompetitions, which may have force-landed a beta
        // tester onto nfl_2025_sim) rather than the stale defaultEvent
        // computed before the visibility list resolved.
        const resolvedCompetition =
          useGlobalStore.getState().activeSport?.competition ?? defaultEvent.competition;
        const [, defaultId, activeId] = await Promise.all([
          fetchUserPools(session.user.id, resolvedCompetition),
          AsyncStorage.getItem(`hotpick_default_pool_${resolvedCompetition}`)
            .catch(() => null),
          AsyncStorage.getItem(`hotpick_active_pool_${resolvedCompetition}`)
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
            useGlobalStore.getState().loadDefaultPoolId(resolvedCompetition),
            fetchSmackUnreadCounts(session.user.id, poolIds),
          ]);
        }

        subscribeSmackUnread();

        // Register/refresh the push token on app launch for returning users
        // (non-blocking). postAuthFlow already does this on an *explicit* sign-in,
        // but a user who only ever reopens the app — restoring a stored session
        // here instead of signing in — never hit that path, so a missing or stale
        // push token was never replaced (user_devices stayed empty and no push
        // could deliver). The token upsert is idempotent and safe to call every
        // launch.
        registerForPushNotifications(session.user.id).catch(() => {});

        BootSplash.hide({fade: true}).catch(() => {});
        // reset, not replace — guarantees Home is the only route so a
        // back-gesture/swipe can't reach an auth screen (matches the auth/
        // onboarding terminals in postAuthFlow + PoolWelcome).
        navigation.reset({index: 0, routes: [{name: 'Home'}]});
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
