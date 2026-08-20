/**
 * Unified post-auth pipeline.
 *
 * Called by all three auth methods (email, Apple, Google) after successful
 * authentication. Handles TOS acceptance (new users only), global pool
 * enrollment, profile check, pool selection restoration, and navigation.
 *
 * Onboarding gate: profiles.poolie_name. Per OAuth Onboarding Spec §4.1
 * this is the single gate distinguishing new from returning users. A
 * user without a poolie_name sees the welcome screen; a user with one
 * goes directly to Home.
 *
 * OAuth name capture (spec §2.2 / §3.1): first_name / last_name are
 * written to profiles inside socialAuth.ts at sign-in time — not passed
 * through navigation params. This screen reads from profiles only.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {useGlobalStore} from '@shell/stores/globalStore';
import {
  ACTIVE_COMPETITION_KEY,
  parseActiveCompetition,
} from '@shell/stores/persistedCompetition';
import {getDefaultEvent, getEventByCompetition} from '@sports/registry';
import {registerForPushNotifications} from '@shell/services/pushNotifications';
import {logError} from '@shared/logging/logError';
import type {User} from '@supabase/supabase-js';

interface PostAuthOptions {
  user: User;
  navigation: any;
}

/**
 * Run the full post-auth flow after any successful authentication.
 *
 * Flow:
 * 1. Set user + active sport in store
 * 2. Ensure global pool membership
 * 3. Fetch profile
 * 4. If new user (no tos_accepted_at) → accept TOS, then ProfileSetup
 * 5. If returning user with outdated TOS → TosVersionGate
 * 6. If profile missing poolie_name → ProfileSetup (onboarding gate)
 * 7. If profile complete → load pools, restore selection, navigate Home
 */
export async function runPostAuthFlow({
  user,
  navigation,
}: PostAuthOptions): Promise<void> {
  const store = useGlobalStore.getState();
  // visibleCompetitions hasn't loaded yet at post-auth time (loaded by
  // fetchProfile below). Falls back to public events only — beta users
  // will see the gated comp(s) re-appear after the RPC resolves.
  const defaultEvent = getDefaultEvent(store.visibleCompetitions);

  // Restore the persisted competition (REGISTRY-03 Part B), same validated
  // contract as LoadingScreen and through the same codec so the two cannot
  // drift: the record must belong to THIS user, then getEventByCompetition
  // applies the availableUntil window. signOut also clears the key, so a
  // deliberate signout always yields the default; the uid check is what
  // covers an app killed without signing out. Any failure falls back to
  // defaultEvent — no new failure modes on the auth path.
  let initialEvent = defaultEvent;
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_COMPETITION_KEY);
    const saved = parseActiveCompetition(raw, user.id);
    if (saved) {
      const match = getEventByCompetition(saved);
      if (match) initialEvent = match;
    }
  } catch {
    // keep defaultEvent
  }

  // Step 1: Set auth state
  store.setUser(user);
  store.setActiveSport(initialEvent);

  // Step 2: Ensure user is in global pool
  await store.ensureGlobalPoolMembership();

  // Step 3: Fetch profile
  const profile = await store.fetchProfile(user.id);

  // Step 4: New user — show TOS gate before profile setup
  if (!profile || !profile.tos_accepted_at) {
    navigation.replace('TosVersionGate', {isNewUser: true});
    return;
  }

  // Step 5: Returning user — check TOS version
  const currentTosVersion = await store.fetchCurrentTosVersion();
  if (currentTosVersion && store.needsTosUpdate(currentTosVersion)) {
    navigation.replace('TosVersionGate');
    return;
  }

  // Step 6: Onboarding gate — poolie_name is the single marker of a
  // completed profile. The DB CHECK constraint already guarantees any
  // non-null value has content after trim.
  if (!profile.poolie_name) {
    navigation.replace('ProfileSetup');
    return;
  }

  // Step 7: Load pools and restore selection.
  // activeSport may have been force-landed onto a tester's sandbox (nfl_2025_sim)
  // inside fetchProfile, AFTER the `store` snapshot was captured — so re-read
  // getState() fresh; the captured `store.activeSport` is stale. Mirrors
  // LoadingScreen.tsx:137.
  const resolvedCompetition =
    useGlobalStore.getState().activeSport?.competition ?? initialEvent.competition;
  await store.fetchUserPools(user.id, resolvedCompetition);
  const pools = useGlobalStore.getState().userPools;

  if (pools.length > 0) {
    let defaultId: string | null = null;
    let activeId: string | null = null;
    try {
      defaultId = await AsyncStorage.getItem(
        `hotpick_default_pool_${resolvedCompetition}`,
      );
      activeId = await AsyncStorage.getItem(
        `hotpick_active_pool_${resolvedCompetition}`,
      );
    } catch {
      // proceed with fallbacks
    }

    const defaultPool = defaultId
      ? pools.find(p => p.id === defaultId)
      : null;
    const activePool = activeId
      ? pools.find(p => p.id === activeId)
      : null;
    const globalPool = pools.find(p => p.is_global);

    // Partner pool auto-default
    const partnerPools = pools
      .filter(p => (p.brand_config as any)?.is_branded)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const firstPartnerPool = partnerPools[0] ?? null;

    const startPoolId =
      defaultPool?.id ??
      firstPartnerPool?.id ??
      activePool?.id ??
      globalPool?.id ??
      pools[0].id;

    store.setActivePoolId(startPoolId);

    if (defaultId) {
      store.loadDefaultPoolId(defaultEvent.competition);
    }

    const poolIds = pools.map(p => p.id);
    await store.fetchSmackUnreadCounts(user.id, poolIds);
  }

  store.subscribeSmackUnread();

  // Load hardware for History tab gate (non-blocking)
  store.loadUserHardware();

  // Register push token for returning users (non-blocking).
  // Was `.catch(() => {})` — see the matching note in LoadingScreen. The three
  // unguarded awaits inside registerForPushNotifications reject outward to
  // here, and an empty catch erased them. This is the explicit-sign-in path;
  // LoadingScreen is the restored-session path. Both are instrumented because
  // which one runs depends on how the Player got into the app.
  // ENTRY TRACE — before the call, not in its catch. This is the
  // explicit-sign-in path. Tom has not signed out in three weeks, so this site
  // should NOT have run in that window; a row here is the signature of the
  // sign-out/sign-in test rather than of an ordinary relaunch, which is what
  // makes the two call sites distinguishable in the log.
  logError('push-trace: postAuthFlow call site REACHED', {
    screen: 'postAuthFlow',
    action: 'pre-registerForPushNotifications',
    userId: user.id,
  });
  registerForPushNotifications(user.id).catch(err => {
    logError(err, {
      screen: 'postAuthFlow',
      action: 'registerForPushNotifications',
      userId: user.id,
    });
  });

  // reset (not replace) so Welcome/EmailEntry/onboarding screens are cleared
  // from the stack. With replace, the stack ended up [Welcome, Home] (Welcome
  // was reached via navigate), so an Android back-gesture / iOS edge-swipe from
  // Home popped back to Welcome and looked like a sign-out.
  navigation.reset({index: 0, routes: [{name: 'Home'}]});
}
