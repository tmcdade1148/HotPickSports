import {create} from 'zustand';
import type {User} from '@supabase/supabase-js';
import type {AnyEventConfig} from '@shared/types/templates';
import type {DbPool} from '@shared/types/database';
import {supabase} from '@shared/config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const POOL_STORAGE_KEY = 'hotpick_active_pool_id';

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

  // Active event context
  activeSport: AnyEventConfig | null;
  setActiveSport: (sport: AnyEventConfig) => void;

  // Profile
  displayName: string | null;
  fetchProfile: (userId: string) => Promise<void>;
  updateDisplayName: (userId: string, name: string) => Promise<boolean>;

  // Pool state
  activePoolId: string | null;
  userPools: DbPool[];
  isLoadingPools: boolean;
  setActivePoolId: (poolId: string | null) => void;
  fetchUserPools: (userId: string, competition: string) => Promise<void>;
  createPool: (params: {
    userId: string;
    competition: string;
    name: string;
    isPublic: boolean;
  }) => Promise<DbPool | null>;
  joinPool: (userId: string, inviteCode: string) => Promise<DbPool | null>;
  loadPersistedPoolId: () => Promise<void>;
  clearPoolState: () => void;
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
    await supabase.auth.signOut();
    await AsyncStorage.removeItem(POOL_STORAGE_KEY);
    set({user: null, displayName: null, activePoolId: null, userPools: []});
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
      // Event changed — clear pool state so user must re-select
      AsyncStorage.removeItem(POOL_STORAGE_KEY);
      set({activeSport: sport, activePoolId: null, userPools: []});
    } else {
      set({activeSport: sport});
    }
  },

  // ---------------------------------------------------------------------------
  // Pool state
  // ---------------------------------------------------------------------------
  activePoolId: null,
  userPools: [],
  isLoadingPools: false,

  setActivePoolId: poolId => {
    set({activePoolId: poolId});
    if (poolId) {
      AsyncStorage.setItem(POOL_STORAGE_KEY, poolId);
    } else {
      AsyncStorage.removeItem(POOL_STORAGE_KEY);
    }
  },

  fetchUserPools: async (userId, competition) => {
    set({isLoadingPools: true});
    // Join pools with pool_members to get pools this user belongs to
    const {data} = await supabase
      .from('pool_members')
      .select('pool_id, pools!inner(*)')
      .eq('user_id', userId)
      .eq('pools.competition', competition);

    const pools: DbPool[] =
      data?.map((row: any) => row.pools as DbPool) ?? [];
    set({userPools: pools, isLoadingPools: false});
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
        organizer_id: userId,
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

    // Auto-select and add to local list
    set(state => ({
      userPools: [...state.userPools, typedPool],
      activePoolId: typedPool.id,
    }));
    AsyncStorage.setItem(POOL_STORAGE_KEY, typedPool.id);

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

    // Auto-select and add to local list (if not already there)
    set(state => {
      const alreadyInList = state.userPools.some(p => p.id === typedPool.id);
      return {
        userPools: alreadyInList
          ? state.userPools
          : [...state.userPools, typedPool],
        activePoolId: typedPool.id,
      };
    });
    AsyncStorage.setItem(POOL_STORAGE_KEY, typedPool.id);

    return typedPool;
  },

  loadPersistedPoolId: async () => {
    const poolId = await AsyncStorage.getItem(POOL_STORAGE_KEY);
    if (poolId) {
      set({activePoolId: poolId});
    }
  },

  clearPoolState: () => {
    AsyncStorage.removeItem(POOL_STORAGE_KEY);
    set({activePoolId: null, userPools: []});
  },
}));
