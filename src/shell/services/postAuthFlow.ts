/**
 * Unified post-auth pipeline.
 *
 * Called by ALL three auth methods (email, Apple, Google) after successful
 * authentication. Replaces ~60 lines of duplicated logic that was previously
 * inline in EmailEntryScreen.
 *
 * Flow:
 * 1. setUser + setActiveSport (global store hydration)
 * 2. acceptTos (idempotent — safe to call on every sign-in)
 * 3. ensureGlobalPoolMembership (joins platform pool if not already a member)
 * 4. fetchProfile → if no first_name → ProfileSetup
 * 5. Otherwise → load pools, restore pool selection, navigate Home
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDefaultEvent} from '@sports/registry';

interface ProviderName {
  firstName?: string;
  lastName?: string;
}

export interface PostAuthOptions {
  user: any;
  navigation: any;
  providerName?: ProviderName | null;
}

export async function runPostAuthFlow({
  user,
  navigation,
  providerName,
}: PostAuthOptions): Promise<void> {
  const store = useGlobalStore.getState();
  const defaultEvent = getDefaultEvent();

  // 1. Hydrate global store
  store.setUser(user);
  store.setActiveSport(defaultEvent);

  // 2. Accept TOS (idempotent — records acceptance if not already done)
  await store.acceptTos(user.id);

  // 3. Ensure membership in the global platform pool
  await store.ensureGlobalPoolMembership();

  // 4. Check if profile exists with a first name
  const profile = await store.fetchProfile(user.id);

  if (!profile || !profile.first_name) {
    // New user or incomplete profile → ProfileSetup
    navigation.replace('ProfileSetup', {
      providerName: providerName ?? undefined,
    });
    return;
  }

  // 5. Returning user — load pools and restore selection
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
    const globalPool = pools.find((p: any) => p.is_global);

    // Priority: explicit default > last active > global pool > first pool
    const startPoolId =
      defaultPool?.id ?? activePool?.id ?? globalPool?.id ?? pools[0].id;

    store.setActivePoolId(startPoolId);

    if (defaultId) {
      useGlobalStore.getState().loadDefaultPoolId(defaultEvent.competition);
    }

    const poolIds = pools.map((p: any) => p.id);
    await store.fetchSmackUnreadCounts(user.id, poolIds);
  }

  store.subscribeSmackUnread();
  navigation.replace('Home');
}
