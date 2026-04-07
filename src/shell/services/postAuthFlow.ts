/**
 * Unified post-auth pipeline.
 *
 * Called by all three auth methods (email, Apple, Google) after successful
 * authentication. Handles TOS acceptance (new users only), global pool
 * enrollment, profile check, pool selection restoration, and navigation.
 *
 * This eliminates duplicated post-auth logic across auth screens.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDefaultEvent} from '@sports/registry';
import {registerForPushNotifications} from '@shell/services/pushNotifications';
import type {User} from '@supabase/supabase-js';

interface ProviderName {
  firstName: string | null;
  lastName: string | null;
}

interface PostAuthOptions {
  user: User;
  navigation: any;
  /** Name from OAuth provider (Apple only sends this on first sign-in) */
  providerName?: ProviderName | null;
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
 * 6. If profile incomplete → ProfileSetup
 * 7. If profile complete → load pools, restore selection, navigate Home
 */
export async function runPostAuthFlow({
  user,
  navigation,
  providerName,
}: PostAuthOptions): Promise<void> {
  const store = useGlobalStore.getState();
  const defaultEvent = getDefaultEvent();

  // Step 1: Set auth state
  store.setUser(user);
  store.setActiveSport(defaultEvent);

  // Step 2: Ensure user is in global pool
  await store.ensureGlobalPoolMembership();

  // Step 3: Fetch profile
  const profile = await store.fetchProfile(user.id);

  // Step 4: New user — show TOS gate before profile setup
  if (!profile || !profile.tos_accepted_at) {
    navigation.replace('TosVersionGate', {
      isNewUser: true,
      providerName: providerName ?? undefined,
    });
    return;
  }

  // Step 5: Returning user — check TOS version
  const currentTosVersion = await store.fetchCurrentTosVersion();
  if (currentTosVersion && store.needsTosUpdate(currentTosVersion)) {
    navigation.replace('TosVersionGate');
    return;
  }

  // Step 6: Check if profile is complete
  if (!profile.first_name) {
    navigation.replace('ProfileSetup', {
      providerName: providerName ?? undefined,
    });
    return;
  }

  // Step 7: Load pools and restore selection
  await store.fetchUserPools(user.id, defaultEvent.competition);
  const pools = useGlobalStore.getState().userPools;

  if (pools.length > 0) {
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

  // Register push token for returning users (non-blocking)
  registerForPushNotifications(user.id).catch(() => {});

  navigation.replace('Home');
}
