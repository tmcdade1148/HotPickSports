/**
 * Unified post-auth pipeline.
 *
 * Called by all three auth methods (email, Apple, Google) after successful
 * authentication. Handles TOS acceptance, global pool enrollment, profile
 * check, pool selection restoration, and navigation.
 *
 * This eliminates duplicated post-auth logic across auth screens.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDefaultEvent} from '@sports/registry';
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
 * 2. Accept TOS (idempotent — safe to call every time)
 * 3. Ensure global pool membership
 * 4. Fetch profile
 * 5. If profile incomplete → ProfileSetup (with optional provider name)
 * 6. If profile complete → load pools, restore selection, navigate Home
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

  // Step 2: Accept TOS (idempotent — RPC no-ops if already accepted)
  await store.acceptTos(user.id);

  // Step 3: Ensure user is in global pool
  await store.ensureGlobalPoolMembership();

  // Step 4: Fetch profile
  const profile = await store.fetchProfile(user.id);

  // Step 5: Check if profile is complete
  if (!profile || !profile.first_name) {
    navigation.replace('ProfileSetup', {
      providerName: providerName ?? undefined,
    });
    return;
  }

  // Step 6: Load pools and restore selection
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
  navigation.replace('Home');
}
