import {create} from 'zustand';
import type {User} from '@supabase/supabase-js';
import type {AnyEventConfig} from '@shared/types/templates';
import type {DbPool} from '@shared/types/database';
import {supabase} from '@shared/config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getEventsByPriority} from '@sports/registry';

const POOL_STORAGE_PREFIX = 'hotpick_active_pool_';

/** AsyncStorage key for a competition's active pool */
function poolStorageKey(competition: string): string {
  return `${POOL_STORAGE_PREFIX}${competition}`;
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

interface GlobalState {
  // Auth
  user: User | null;
  isAuthLoading: boolean;
  setUser: (user: User | null) => void;
  setAuthLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;

  // Active event cards (Home Screen) — max 2, priority-ordered
  activeEventCards: AnyEventConfig[];
  availableEvents: AnyEventConfig[];
  setActiveEventCards: (events: AnyEventConfig[]) => void;
  refreshAvailableEvents: () => void;

  // Active event context
  activeSport: AnyEventConfig | null;
  setActiveSport: (sport: AnyEventConfig) => void;

  // Profile
  displayName: string | null;
  fetchProfile: (userId: string) => Promise<void>;
  updateDisplayName: (userId: string, name: string) => Promise<boolean>;

  // Pool state — global, drives all tabs simultaneously
  activePoolId: string | null;
  userPools: DbPool[];
  poolsByCompetition: Record<string, DbPool[]>;
  isLoadingPools: boolean;
  setActivePoolId: (poolId: string | null) => void;
  fetchUserPools: (userId: string, competition: string) => Promise<void>;
  getPoolsForCompetition: (competition: string) => DbPool[];
  createPool: (params: {
    userId: string;
    competition: string;
    name: string;
    isPublic: boolean;
  }) => Promise<DbPool | null>;
  joinPool: (userId: string, inviteCode: string) => Promise<DbPool | null>;
  loadPersistedPoolId: (competition: string) => Promise<void>;
  clearPoolState: () => void;

  // SmackTalk unread counts — poolId → unread count
  smackUnreadCounts: Record<string, number>;
  setSmackUnreadCount: (poolId: string, count: number) => void;
  markPoolAsRead: (poolId: string) => Promise<void>;
  fetchSmackUnreadCounts: (userId: string, poolIds: string[]) => Promise<void>;
}

export const useGlobalStore = create<GlobalState>((set, get) => ({
  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  user: null,
  isAuthLoading: true,
  setUser: user => set({user}),
  setAuthLoading: isAuthLoading => set({isAuthLoading}),
  signOut: async () => {
    // Clear all per-competition pool keys
    const keys = await AsyncStorage.getAllKeys();
    const poolKeys = keys.filter(k => k.startsWith(POOL_STORAGE_PREFIX));
    if (poolKeys.length > 0) {
      await AsyncStorage.multiRemove(poolKeys);
    }
    await supabase.auth.signOut();
    set({
      user: null,
      displayName: null,
      activePoolId: null,
      userPools: [],
      poolsByCompetition: {},
      smackUnreadCounts: {},
    });
  },

  // ---------------------------------------------------------------------------
  // Active event cards (Home Screen)
  // ---------------------------------------------------------------------------
  activeEventCards: [],
  availableEvents: [],

  setActiveEventCards: events => set({activeEventCards: events.slice(0, 2)}),

  refreshAvailableEvents: () => {
    const all = getEventsByPriority();
    set({
      availableEvents: all,
      activeEventCards: all.filter(e => e.status === 'active').slice(0, 2),
    });
  },

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------
  displayName: null,

  fetchProfile: async userId => {
    const {data} = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single();

    if (data?.display_name) {
      set({displayName: data.display_name});
    }
  },

  updateDisplayName: async (userId, name) => {
    const trimmed = name.trim();

    const {error} = await supabase.from('profiles').upsert(
      {
        id: userId,
        display_name: trimmed,
      },
      {onConflict: 'id'},
    );

    if (error) {
      return false;
    }

    set({displayName: trimmed});
    return true;
  },

  // ---------------------------------------------------------------------------
  // Active event context
  // ---------------------------------------------------------------------------
  activeSport: null,
  setActiveSport: sport => {
    const current = get().activeSport;
    if (current?.competition !== sport.competition) {
      // Event changed — restore cached pools for this competition
      const cached = get().poolsByCompetition[sport.competition] ?? [];
      set({activeSport: sport, userPools: cached, activePoolId: null});
      // Restore persisted pool selection for this competition
      get().loadPersistedPoolId(sport.competition);
    } else {
      set({activeSport: sport});
    }
  },

  // ---------------------------------------------------------------------------
  // Pool state
  // ---------------------------------------------------------------------------
  activePoolId: null,
  userPools: [],
  poolsByCompetition: {},
  isLoadingPools: false,

  setActivePoolId: poolId => {
    set({activePoolId: poolId});
    const competition = get().activeSport?.competition;
    if (poolId && competition) {
      AsyncStorage.setItem(poolStorageKey(competition), poolId);
    } else if (competition) {
      AsyncStorage.removeItem(poolStorageKey(competition));
    }
  },

  fetchUserPools: async (userId, competition) => {
    set({isLoadingPools: true});
    // Join pools with pool_members to get pools this user belongs to
    const {data} = await supabase
      .from('pool_members')
      .select('pool_id, pools!inner(*)')
      .eq('user_id', userId)
      .eq('pools.competition', competition)
      .eq('status', 'active');

    const pools: DbPool[] =
      data?.map((row: any) => row.pools as DbPool) ?? [];

    // Cache per competition and set as active list
    set(state => ({
      userPools: pools,
      poolsByCompetition: {...state.poolsByCompetition, [competition]: pools},
      isLoadingPools: false,
    }));
  },

  getPoolsForCompetition: (competition: string) => {
    return get().poolsByCompetition[competition] ?? [];
  },

  createPool: async ({userId, competition, name, isPublic}) => {
    const inviteCode = generateInviteCode();

    // Insert the pool
    const {data: pool, error: poolError} = await supabase
      .from('pools')
      .insert({
        name,
        competition,
        created_by: userId,
        invite_code: inviteCode,
        is_public: isPublic,
      })
      .select()
      .single();

    if (poolError || !pool) {
      return null;
    }

    // Add creator as first member
    await supabase.from('pool_members').insert({
      pool_id: pool.id,
      user_id: userId,
    });

    const typedPool = pool as DbPool;

    // Auto-select and add to both local list and competition cache
    set(state => {
      const updatedPools = [...state.userPools, typedPool];
      return {
        userPools: updatedPools,
        poolsByCompetition: {
          ...state.poolsByCompetition,
          [competition]: updatedPools,
        },
        activePoolId: typedPool.id,
      };
    });
    AsyncStorage.setItem(poolStorageKey(competition), typedPool.id);

    return typedPool;
  },

  joinPool: async (userId, inviteCode) => {
    // Find the pool by invite code
    const {data: pool, error: findError} = await supabase
      .from('pools')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase())
      .single();

    if (findError || !pool) {
      return null;
    }

    // Check if already a member
    const {data: existing} = await supabase
      .from('pool_members')
      .select('pool_id')
      .eq('pool_id', pool.id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      await supabase.from('pool_members').insert({
        pool_id: pool.id,
        user_id: userId,
      });
    }

    const typedPool = pool as DbPool;
    const competition = typedPool.competition;

    // Auto-select and add to both local list and competition cache
    set(state => {
      const alreadyInList = state.userPools.some(p => p.id === typedPool.id);
      const updatedPools = alreadyInList
        ? state.userPools
        : [...state.userPools, typedPool];
      return {
        userPools: updatedPools,
        poolsByCompetition: {
          ...state.poolsByCompetition,
          [competition]: updatedPools,
        },
        activePoolId: typedPool.id,
      };
    });
    AsyncStorage.setItem(poolStorageKey(competition), typedPool.id);

    return typedPool;
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
  // SmackTalk unread counts
  // ---------------------------------------------------------------------------
  smackUnreadCounts: {},

  setSmackUnreadCount: (poolId, count) =>
    set(state => ({
      smackUnreadCounts: {...state.smackUnreadCounts, [poolId]: count},
    })),

  markPoolAsRead: async (poolId: string) => {
    const userId = get().user?.id;
    if (!userId) {
      return;
    }

    // Optimistic: clear count immediately
    set(state => ({
      smackUnreadCounts: {...state.smackUnreadCounts, [poolId]: 0},
    }));

    // Upsert read state
    await supabase.from('smack_read_state').upsert(
      {user_id: userId, pool_id: poolId, last_read_at: new Date().toISOString()},
      {onConflict: 'user_id,pool_id'},
    );
  },

  fetchSmackUnreadCounts: async (userId, poolIds) => {
    if (poolIds.length === 0) {
      return;
    }

    // Get read states for all pools
    const {data: readStates} = await supabase
      .from('smack_read_state')
      .select('pool_id, last_read_at')
      .eq('user_id', userId)
      .in('pool_id', poolIds);

    const readMap: Record<string, string> = {};
    for (const rs of readStates ?? []) {
      readMap[rs.pool_id] = rs.last_read_at;
    }

    // Count unread messages per pool
    const counts: Record<string, number> = {};
    for (const poolId of poolIds) {
      const lastRead = readMap[poolId];
      let query = supabase
        .from('smack_messages')
        .select('id', {count: 'exact', head: true})
        .eq('pool_id', poolId);

      if (lastRead) {
        query = query.gt('created_at', lastRead);
      }

      const {count} = await query;
      counts[poolId] = count ?? 0;
    }

    set({smackUnreadCounts: counts});
  },
}));
