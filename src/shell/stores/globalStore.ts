import {create} from 'zustand';
import type {DbPool} from '@shared/types/database';
import type {BrandConfig} from '@shell/theme/types';
import {supabase} from '@shared/config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getEventsByPriority, getEventByCompetition} from '@sports/registry';
import {deactivateDeviceTokens} from '@shell/services/pushNotifications';
import {setMonitoringUser} from '@shared/monitoring/sentry';
import {createSmackUnreadSlice} from './slices/smackUnreadSlice';
import {createDelegateSlice} from './slices/delegateSlice';
import {createHistoryHardwareSlice} from './slices/historyHardwareSlice';
import {createBroadcastsSlice} from './slices/broadcastsSlice';
import {createAffiliationsSlice} from './slices/affiliationsSlice';
import {createHomeRecapSlice} from './slices/homeRecapSlice';
import {createPoolIndicatorsSlice} from './slices/poolIndicatorsSlice';
import {createPartnerModuleSlice} from './slices/partnerModuleSlice';
import {createPoolAdminSlice} from './slices/poolAdminSlice';
import {createDemoSlice} from './slices/demoSlice';
import {createProfileSlice} from './slices/profileSlice';
import type {GlobalState} from './globalStore.types';
// Re-exported so existing consumers keep importing these from globalStore.
export type {
  PoolAffiliation,
  PoolDelegate,
  UserHardwareItem,
  PlayerArchetype,
} from './globalStore.types';

const POOL_STORAGE_PREFIX = 'hotpick_active_pool_';
const DEFAULT_POOL_PREFIX = 'hotpick_default_pool_';

/**
 * DEV-only: AsyncStorage key for the active competition so Metro hot reloads
 * don't reset the developer back to the default event. Production builds must
 * never read this value — LoadingScreen handles the gating.
 */
export const DEV_ACTIVE_COMPETITION_KEY = 'hotpick_dev_active_competition';

/** AsyncStorage key for a competition's active pool */
function poolStorageKey(competition: string): string {
  return `${POOL_STORAGE_PREFIX}${competition}`;
}

/** AsyncStorage key for a competition's default pool (loads on app open) */
function defaultPoolStorageKey(competition: string): string {
  return `${DEFAULT_POOL_PREFIX}${competition}`;
}

/** Generate a random 6-character alphanumeric invite code. */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const useGlobalStore = create<GlobalState>((set, get) => ({
  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  user: null,
  isAuthLoading: true,
  setUser: user => {
    // Tag monitoring events with the auth user id only (no PII). No-ops when
    // monitoring isn't active.
    setMonitoringUser(user?.id ?? null);
    set({user});
  },
  setAuthLoading: isAuthLoading => set({isAuthLoading}),
  signOut: async () => {
    // Clean up Realtime subscription
    get().unsubscribeSmackUnread();

    // Deactivate push tokens for this device (is_active = false, never DELETE)
    const userId = get().user?.id;
    if (userId) {
      await deactivateDeviceTokens(userId).catch(() => {});
    }

    // Clear all per-competition pool + default pool keys plus the
    // DEV-only persisted active competition. The latter is critical
    // for the multi-account dev flow: without it, a previous user's
    // sim choice persists into the next user's session and bypasses
    // their visibility allowlist (LoadingScreen's DEV restore uses
    // getAllEventsUnfiltered).
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(
      k =>
        k.startsWith(POOL_STORAGE_PREFIX) ||
        k.startsWith(DEFAULT_POOL_PREFIX) ||
        k === DEV_ACTIVE_COMPETITION_KEY,
    );
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
    await supabase.auth.signOut();
    setMonitoringUser(null);
    set({
      user: null,
      userProfile: null,
      managedClub: null,
      priorSportHistory: {},
      visibleCompetitions: [],
      visibleCompetitionsLoaded: false,
      activePoolId: null,
      defaultPoolId: null,
      userPools: [],
      poolRoles: {},
      poolsByCompetition: {},
      smackUnreadCounts: {},
      showGlobalPool: false,
      pendingInviteCode: null,
      activeBrandConfig: null,
    });
  },

  // ---------------------------------------------------------------------------
  // Active event cards (Home Screen)
  // ---------------------------------------------------------------------------
  activeEventCards: [],
  availableEvents: [],

  refreshAvailableEvents: () => {
    const all = getEventsByPriority(get().visibleCompetitions);
    set({
      availableEvents: all,
      activeEventCards: all.filter(e => e.status === 'active').slice(0, 2),
    });
  },

  // ---------------------------------------------------------------------------
  // Profile, managed League, visible competitions, onboarding/TOS helpers
  // (extracted into slices/profileSlice.ts — same set/get, same behaviour)
  // ---------------------------------------------------------------------------
  ...createProfileSlice(set, get),

  // ---------------------------------------------------------------------------
  // Invite code (deep link flow)
  // ---------------------------------------------------------------------------
  pendingInviteCode: null,
  setPendingInviteCode: code => set({pendingInviteCode: code}),
  clearPendingInviteCode: () => set({pendingInviteCode: null}),

  // ---------------------------------------------------------------------------
  // Active event context
  // ---------------------------------------------------------------------------
  activeSport: null,
  setActiveSport: sport => {
    const current = get().activeSport;
    if (current === null) {
      // Initial set (app boot) — just set the sport and cached pools.
      // Don't clear activePoolId or fire loadPersistedPoolId here;
      // LoadingScreen handles pool selection after fetching pools.
      const cached = get().poolsByCompetition[sport.competition] ?? [];
      set({activeSport: sport, userPools: cached});
    } else if (current.competition !== sport.competition) {
      // User switching between sports — clear pool and restore cache
      const cached = get().poolsByCompetition[sport.competition] ?? [];
      set({activeSport: sport, userPools: cached, activePoolId: null});
      // Restore persisted pool selection for this competition
      get().loadPersistedPoolId(sport.competition);
    } else {
      set({activeSport: sport});
    }
    // DEV only: persist competition so Metro hot reloads preserve selection.
    // Production ignores this value — see LoadingScreen for the read path.
    if (__DEV__) {
      AsyncStorage.setItem(DEV_ACTIVE_COMPETITION_KEY, sport.competition).catch(
        () => {},
      );
    }
  },

  // ---------------------------------------------------------------------------
  // New-user onboarding demo (spec: docs/DEMO_WEEK_SPEC.md)
  // (extracted into slices/demoSlice.ts — same set/get, same behaviour)
  // ---------------------------------------------------------------------------
  ...createDemoSlice(set, get),

  // ---------------------------------------------------------------------------
  // Pool state
  // ---------------------------------------------------------------------------
  activePoolId: null,
  defaultPoolId: null,
  userPools: [],
  visiblePools: [],
  poolRoles: {},
  manualGlobalJoins: {},
  poolsByCompetition: {},
  isLoadingPools: false,

  setActivePoolId: poolId => {
    // Update brand config from the selected pool
    const pool = poolId
      ? get().userPools.find(p => p.id === poolId)
      : null;
    const brandConfig = (pool?.brand_config as unknown as BrandConfig) ?? null;


    set({activePoolId: poolId, activeBrandConfig: brandConfig});
    const competition = get().activeSport?.competition;
    if (poolId && competition) {
      AsyncStorage.setItem(poolStorageKey(competition), poolId);
    } else if (competition) {
      AsyncStorage.removeItem(poolStorageKey(competition));
    }
  },

  setDefaultPoolId: poolId => {
    set({defaultPoolId: poolId});
    const competition = get().activeSport?.competition;
    if (competition) {
      AsyncStorage.setItem(defaultPoolStorageKey(competition), poolId);
    }
  },

  loadDefaultPoolId: async (competition: string) => {
    try {
      const poolId = await AsyncStorage.getItem(
        defaultPoolStorageKey(competition),
      );
      if (poolId) {
        set({defaultPoolId: poolId});
      }
    } catch {
      // AsyncStorage read failed — leave defaultPoolId as null
    }
  },

  fetchUserPools: async (userId, competition) => {
    set({isLoadingPools: true});
    // Join pools with pool_members to get pools this user belongs to
    const {data} = await supabase
      .from('pool_members')
      .select('pool_id, role, invite_code_used, pools!inner(*)')
      .eq('user_id', userId)
      .eq('pools.competition', competition)
      .eq('status', 'active');

    const pools: DbPool[] =
      data?.map((row: any) => row.pools as DbPool) ?? [];

    // Build poolId → role map and track manual joins
    const roles: Record<string, string> = {};
    const manualGlobalJoins: Record<string, boolean> = {};
    for (const row of data ?? []) {
      roles[(row as any).pool_id] = (row as any).role;
      // Track if user manually joined a global pool (has invite_code_used)
      if ((row as any).pools?.is_global && (row as any).invite_code_used) {
        manualGlobalJoins[(row as any).pool_id] = true;
      }
    }

    // Compute visible pools: hide global pools unless manually joined,
    // AND always hide pools flagged is_hidden_from_users (the analytics
    // Platform Pool — staff-only visibility per April 2026 spec).
    const visible = pools.filter(p => {
      if (p.is_hidden_from_users) return false;
      if (!p.is_global) return true;
      return !!manualGlobalJoins[p.id];
    });

    // Cache per competition and set as active list
    set(state => ({
      userPools: pools,
      visiblePools: visible,
      poolRoles: {...state.poolRoles, ...roles},
      manualGlobalJoins,
      poolsByCompetition: {...state.poolsByCompetition, [competition]: pools},
      isLoadingPools: false,
    }));

    // Fetch flagged counts for organizer/admin pools + recent broadcasts
    get().fetchFlaggedCounts();
    get().fetchRecentBroadcasts();
  },

  getPoolsForCompetition: (competition: string) => {
    return get().poolsByCompetition[competition] ?? [];
  },

  createPool: async ({userId, competition, name, isPublic}) => {
    const inviteCode = generateInviteCode();

    // Use SECURITY DEFINER RPC to create pool + add creator atomically
    const {data, error} = await supabase.rpc('create_pool', {
      p_name: name,
      p_competition: competition,
      p_is_public: isPublic,
      p_invite_code: inviteCode,
    });

    if (error) {
      return {error: error.message};
    }

    if (!data || data.error) {
      // Tier enforcement errors
      if (data?.error === 'pool_limit_reached') {
        return {error: 'pool_limit_reached', upgradeRequired: true};
      }
      return {error: data?.error ?? 'Failed to create pool'};
    }

    const typedPool = data.pool as DbPool;

    // Auto-select, add role, and add to both local list and competition cache.
    // IMPORTANT: also append to `visiblePools` — every pool-listing UI reads
    // that derived list, not `userPools`. Newly-created pools are never
    // global (organizers create non-global pools; globals are platform-
    // provisioned), so no filter check is needed. Without this update the
    // pool only appears after an app restart triggers `fetchUserPools`.
    set(state => {
      const updatedPools = [...state.userPools, typedPool];
      const updatedVisible = [...state.visiblePools, typedPool];
      return {
        userPools: updatedPools,
        visiblePools: updatedVisible,
        poolsByCompetition: {
          ...state.poolsByCompetition,
          [competition]: updatedPools,
        },
        activePoolId: typedPool.id,
        poolRoles: {...state.poolRoles, [typedPool.id]: 'organizer'},
      };
    });
    AsyncStorage.setItem(poolStorageKey(competition), typedPool.id);

    return {pool: typedPool};
  },

  joinPool: async (userId, inviteCode) => {
    // Use SECURITY DEFINER RPC to bypass RLS for pool lookup
    const {data, error} = await supabase.rpc('join_pool_by_invite', {
      p_invite_code: inviteCode.toUpperCase(),
    });

    if (error) {
      return {error: error.message};
    }

    if (!data || data.error) {
      if (data?.error === 'pool_full') {
        return {error: 'pool_full', poolFull: true};
      }
      return {error: data?.error ?? 'Invalid invite code or pool is full.'};
    }

    const typedPool = data.pool as DbPool;
    const competition = typedPool.competition;

    // Persist the selection first so the active-sport switch below (which
    // restores the persisted pool for the target competition) reads this value.
    AsyncStorage.setItem(poolStorageKey(competition), typedPool.id);

    // The Contest list is scoped to one active competition at a time. If the
    // joined Contest belongs to a different competition than the one currently
    // active, switch the active sport to it — otherwise the new Contest won't
    // appear in the list and a reopen would default back to the old
    // competition, hiding it permanently.
    const current = get().activeSport;
    if (current?.competition !== competition) {
      const event = getEventByCompetition(competition);
      if (event) {
        get().setActiveSport(event);
      }
    }

    // Set active pool immediately for instant UI feedback
    set({activePoolId: typedPool.id});

    // Re-fetch pools from DB — picks up invite_code_used, manualGlobalJoins, etc.
    await get().fetchUserPools(userId, competition);

    return {pool: typedPool};
  },

  loadPersistedPoolId: async (competition: string) => {
    const poolId = await AsyncStorage.getItem(poolStorageKey(competition));
    if (poolId) {
      set({activePoolId: poolId});
    }
  },

  clearPoolState: () => {
    const competition = get().activeSport?.competition;
    if (competition) {
      AsyncStorage.removeItem(poolStorageKey(competition));
    }
    set({activePoolId: null, userPools: []});
  },

  // ---------------------------------------------------------------------------
  // Pool administration: member mgmt, settings, broadcasts, global-pool enroll
  // (extracted into slices/poolAdminSlice.ts — same set/get, same behaviour)
  // ---------------------------------------------------------------------------
  ...createPoolAdminSlice(set, get),

  // Pool-board + partner-board (League) delegate management
  // (extracted into slices/delegateSlice.ts — pure RPC wrappers, same behaviour)
  ...createDelegateSlice(),

  // ---------------------------------------------------------------------------
  // SmackTalk unread counts, Realtime, and flagged-message counts
  // (extracted into slices/smackUnreadSlice.ts — same set/get, same behaviour)
  // ---------------------------------------------------------------------------
  ...createSmackUnreadSlice(set, get),

  // ---------------------------------------------------------------------------
  // Recent broadcasts (across user's pools)
  // (extracted into slices/broadcastsSlice.ts — same set/get, same behaviour)
  // ---------------------------------------------------------------------------
  ...createBroadcastsSlice(set, get),

  // ---------------------------------------------------------------------------
  // Brand config
  // ---------------------------------------------------------------------------
  activeBrandConfig: null,
  setActiveBrandConfig: config => set({activeBrandConfig: config}),
  updatePoolBrandConfig: (poolId, config) => {
    // Mirror into visiblePools too — see note in archivePool / updatePoolSettings.
    const asRecord = config as Record<string, unknown> | null;
    const applyBrand = (p: DbPool) =>
      p.id === poolId ? {...p, brand_config: asRecord} : p;
    set(state => ({
      userPools: state.userPools.map(applyBrand),
      visiblePools: state.visiblePools.map(applyBrand),
      // If this is the active pool, also update the global theme. The
      // theme reads BrandConfig shape; the cast is safe because a
      // partner's brand_config carries the same keys as BrandConfig
      // (partner_name, primary_color, logo, ...).
      ...(state.activePoolId === poolId
        ? {activeBrandConfig: config as BrandConfig | null}
        : {}),
    }));
  },

  // ---------------------------------------------------------------------------
  // Feature flags
  // ---------------------------------------------------------------------------
  showGlobalPool: false,

  // ---------------------------------------------------------------------------
  // History, hardware (career awards) & player archetype
  // (extracted into slices/historyHardwareSlice.ts — same set/get, same behaviour)
  // ---------------------------------------------------------------------------
  ...createHistoryHardwareSlice(set, get),

  // ---------------------------------------------------------------------------
  // Last-week HotPick recap + Week Mini-Strip (Home Redesign §6.6)
  // (extracted into slices/homeRecapSlice.ts — same set, same behaviour)
  // ---------------------------------------------------------------------------
  ...createHomeRecapSlice(set),

  // ---------------------------------------------------------------------------
  // Pool Module indicators + per-pool rank batch (Home Redesign §6.4.6)
  // (extracted into slices/poolIndicatorsSlice.ts — same set, same behaviour)
  // ---------------------------------------------------------------------------
  ...createPoolIndicatorsSlice(set),

  // ---------------------------------------------------------------------------
  // Partner Module data + indicators (Home Redesign §6.4.7)
  // (extracted into slices/partnerModuleSlice.ts — same set, same behaviour)
  // ---------------------------------------------------------------------------
  ...createPartnerModuleSlice(set),

  // Pool partner-affiliation (League) loading
  // (extracted into slices/affiliationsSlice.ts — same set/get, same behaviour)
  ...createAffiliationsSlice(set, get),
}));
