import {create} from 'zustand';
import type {User} from '@supabase/supabase-js';
import type {AnyEventConfig} from '@shared/types/templates';
import type {DbPool, DbProfile, DbPoolMember} from '@shared/types/database';
import type {BrandConfig} from '@shell/theme/types';
import {supabase} from '@shared/config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getEventsByPriority} from '@sports/registry';

const POOL_STORAGE_PREFIX = 'hotpick_active_pool_';
const DEFAULT_POOL_PREFIX = 'hotpick_default_pool_';

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

  // Profile — full profile object
  userProfile: DbProfile | null;
  fetchProfile: (userId: string) => Promise<DbProfile | null>;
  updateProfile: (
    userId: string,
    fields: Partial<DbProfile>,
  ) => Promise<boolean>;

  // Onboarding helpers
  needsProfileSetup: () => boolean;
  needsTosAcceptance: () => boolean;
  acceptTos: (userId: string) => Promise<boolean>;

  // Invite code — stored in memory for deep link flow
  pendingInviteCode: string | null;
  setPendingInviteCode: (code: string | null) => void;
  clearPendingInviteCode: () => void;

  // Pool state — global, drives all tabs simultaneously
  activePoolId: string | null;
  defaultPoolId: string | null; // loads on app open (persisted per competition)
  userPools: DbPool[];
  poolRoles: Record<string, string>; // poolId → 'member' | 'admin' | 'organizer'
  poolsByCompetition: Record<string, DbPool[]>;
  isLoadingPools: boolean;
  setActivePoolId: (poolId: string | null) => void;
  setDefaultPoolId: (poolId: string) => void;
  loadDefaultPoolId: (competition: string) => Promise<void>;
  fetchUserPools: (userId: string, competition: string) => Promise<void>;
  getPoolsForCompetition: (competition: string) => DbPool[];
  createPool: (params: {
    userId: string;
    competition: string;
    name: string;
    isPublic: boolean;
  }) => Promise<{pool?: DbPool; error?: string; upgradeRequired?: boolean}>;
  joinPool: (
    userId: string,
    inviteCode: string,
  ) => Promise<{pool?: DbPool; error?: string; poolFull?: boolean}>;
  loadPersistedPoolId: (competition: string) => Promise<void>;
  clearPoolState: () => void;

  // Pool member management
  poolMembers: (DbPoolMember & {profile?: DbProfile})[];
  isLoadingMembers: boolean;
  fetchPoolMembers: (poolId: string) => Promise<void>;
  removePoolMember: (
    poolId: string,
    userId: string,
  ) => Promise<{success: boolean; error?: string}>;
  updateMemberRole: (
    poolId: string,
    userId: string,
    newRole: string,
  ) => Promise<{success: boolean; error?: string}>;

  // Pool settings management
  updatePoolSettings: (
    poolId: string,
    settings: {name?: string; isPublic?: boolean},
  ) => Promise<{success: boolean; error?: string}>;
  archivePool: (
    poolId: string,
  ) => Promise<{success: boolean; error?: string}>;

  // Organizer broadcast
  broadcastToPool: (
    poolId: string,
    message: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    recipients?: number;
    remainingToday?: number;
  }>;
  fetchBroadcastsToday: (poolId: string) => Promise<number>;

  // SmackTalk unread counts — poolId → unread count
  smackUnreadCounts: Record<string, number>;
  setSmackUnreadCount: (poolId: string, count: number) => void;
  markPoolAsRead: (poolId: string) => Promise<void>;
  fetchSmackUnreadCounts: (userId: string, poolIds: string[]) => Promise<void>;

  // SmackTalk Realtime subscription (lives here, not in components)
  smackRealtimeChannel: any | null;
  subscribeSmackUnread: () => void;
  unsubscribeSmackUnread: () => void;

  // Global pool auto-enrollment
  ensureGlobalPoolMembership: () => Promise<void>;

  // Brand config — drives useTheme() and useBrand() hooks
  activeBrandConfig: BrandConfig | null;
  setActiveBrandConfig: (config: BrandConfig | null) => void;
  updatePoolBrandConfig: (poolId: string, config: BrandConfig | null) => void;

  // Feature flags
  showGlobalPool: boolean;
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
    // Clean up Realtime subscription
    get().unsubscribeSmackUnread();

    // Clear all per-competition pool + default pool keys
    const keys = await AsyncStorage.getAllKeys();
    const poolKeys = keys.filter(
      k => k.startsWith(POOL_STORAGE_PREFIX) || k.startsWith(DEFAULT_POOL_PREFIX),
    );
    if (poolKeys.length > 0) {
      await AsyncStorage.multiRemove(poolKeys);
    }
    await supabase.auth.signOut();
    set({
      user: null,
      userProfile: null,
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
  userProfile: null,

  fetchProfile: async userId => {
    const {data} = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      set({userProfile: data as DbProfile});
      return data as DbProfile;
    }
    return null;
  },

  updateProfile: async (userId, fields) => {
    const {error} = await supabase
      .from('profiles')
      .update(fields)
      .eq('id', userId);

    if (error) {
      return false;
    }

    // Merge updated fields into local state
    set(state => ({
      userProfile: state.userProfile
        ? {...state.userProfile, ...fields}
        : null,
    }));
    return true;
  },

  // ---------------------------------------------------------------------------
  // Onboarding helpers
  // ---------------------------------------------------------------------------
  needsProfileSetup: () => {
    const profile = get().userProfile;
    return !profile || !profile.first_name;
  },

  needsTosAcceptance: () => {
    const profile = get().userProfile;
    return !profile || !profile.tos_accepted_at;
  },

  acceptTos: async (userId: string) => {
    const {error} = await supabase.rpc('rpc_accept_tos', {
      p_tos_version: '1.0',
    });

    if (error) {
      return false;
    }

    // Update local state
    set(state => ({
      userProfile: state.userProfile
        ? {
            ...state.userProfile,
            tos_accepted_at: new Date().toISOString(),
            tos_version: '1.0',
          }
        : null,
    }));
    return true;
  },

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
  },

  // ---------------------------------------------------------------------------
  // Pool state
  // ---------------------------------------------------------------------------
  activePoolId: null,
  defaultPoolId: null,
  userPools: [],
  poolRoles: {},
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
      .select('pool_id, role, pools!inner(*)')
      .eq('user_id', userId)
      .eq('pools.competition', competition)
      .eq('status', 'active');

    const pools: DbPool[] =
      data?.map((row: any) => row.pools as DbPool) ?? [];

    // Build poolId → role map
    const roles: Record<string, string> = {};
    for (const row of data ?? []) {
      roles[(row as any).pool_id] = (row as any).role;
    }

    // Cache per competition and set as active list
    set(state => ({
      userPools: pools,
      poolRoles: {...state.poolRoles, ...roles},
      poolsByCompetition: {...state.poolsByCompetition, [competition]: pools},
      isLoadingPools: false,
    }));
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

    // Auto-select, add role, and add to both local list and competition cache
    set(state => {
      const updatedPools = [...state.userPools, typedPool];
      return {
        userPools: updatedPools,
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
  // Pool member management
  // ---------------------------------------------------------------------------
  poolMembers: [],
  isLoadingMembers: false,

  fetchPoolMembers: async (poolId: string) => {
    set({isLoadingMembers: true});
    const {data} = await supabase
      .from('pool_members')
      .select('*, profiles:user_id(*)')
      .eq('pool_id', poolId)
      .eq('status', 'active')
      .order('joined_at', {ascending: true});

    const members =
      data?.map((row: any) => ({
        pool_id: row.pool_id,
        user_id: row.user_id,
        role: row.role,
        status: row.status,
        invited_by: row.invited_by,
        invite_code_used: row.invite_code_used,
        joined_at: row.joined_at,
        left_at: row.left_at,
        last_active_at: row.last_active_at,
        notification_override: row.notification_override,
        profile: row.profiles as DbProfile | undefined,
      })) ?? [];

    set({poolMembers: members, isLoadingMembers: false});
  },

  removePoolMember: async (poolId, userId) => {
    const {data, error} = await supabase.rpc('remove_pool_member', {
      p_pool_id: poolId,
      p_user_id: userId,
    });

    if (error) {
      return {success: false, error: error.message};
    }

    if (data?.error) {
      return {success: false, error: data.error};
    }

    // Remove from local state
    set(state => ({
      poolMembers: state.poolMembers.filter(m => m.user_id !== userId),
    }));

    return {success: true};
  },

  updateMemberRole: async (poolId, userId, newRole) => {
    const {data, error} = await supabase.rpc('update_member_role', {
      p_pool_id: poolId,
      p_user_id: userId,
      p_new_role: newRole,
    });

    if (error) {
      return {success: false, error: error.message};
    }

    if (data?.error) {
      return {success: false, error: data.error};
    }

    // Update local state
    set(state => ({
      poolMembers: state.poolMembers.map(m =>
        m.user_id === userId ? {...m, role: newRole as DbPoolMember['role']} : m,
      ),
    }));

    return {success: true};
  },

  // ---------------------------------------------------------------------------
  // Pool settings management
  // ---------------------------------------------------------------------------

  updatePoolSettings: async (poolId, settings) => {
    const {data, error} = await supabase.rpc('update_pool_settings', {
      p_pool_id: poolId,
      p_name: settings.name ?? null,
      p_is_public: settings.isPublic ?? null,
    });

    if (error) {
      return {success: false, error: error.message};
    }

    if (data?.error) {
      return {success: false, error: data.error};
    }

    // Update local state
    set(state => ({
      userPools: state.userPools.map(p =>
        p.id === poolId
          ? {
              ...p,
              ...(settings.name !== undefined ? {name: settings.name} : {}),
              ...(settings.isPublic !== undefined
                ? {is_public: settings.isPublic}
                : {}),
            }
          : p,
      ),
    }));

    return {success: true};
  },

  archivePool: async poolId => {
    const {data, error} = await supabase.rpc('archive_pool', {
      p_pool_id: poolId,
    });

    if (error) {
      return {success: false, error: error.message};
    }

    if (data?.error) {
      return {success: false, error: data.error};
    }

    // Remove from local state
    set(state => ({
      userPools: state.userPools.filter(p => p.id !== poolId),
      activePoolId:
        state.activePoolId === poolId ? null : state.activePoolId,
    }));

    return {success: true};
  },

  // ---------------------------------------------------------------------------
  // Organizer broadcast
  // ---------------------------------------------------------------------------

  broadcastToPool: async (poolId, message) => {
    const {data, error} = await supabase.rpc('broadcast_to_pool', {
      p_pool_id: poolId,
      p_message: message,
    });

    if (error) {
      return {success: false, error: error.message};
    }

    if (data?.error) {
      return {
        success: false,
        error: data.error,
        remainingToday: data.remaining_today ?? undefined,
      };
    }

    return {
      success: true,
      recipients: data.recipients,
      remainingToday: data.remaining_today,
    };
  },

  fetchBroadcastsToday: async (poolId: string) => {
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const {count} = await supabase
      .from('organizer_notifications')
      .select('*', {count: 'exact', head: true})
      .eq('pool_id', poolId)
      .eq('notification_type', 'broadcast')
      .gte('sent_at', twentyFourHoursAgo);

    return count ?? 0;
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

  // ---------------------------------------------------------------------------
  // SmackTalk Realtime subscription
  // ---------------------------------------------------------------------------
  smackRealtimeChannel: null,

  subscribeSmackUnread: () => {
    // Clean up existing channel (idempotent)
    const existing = get().smackRealtimeChannel;
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel('smack-unread-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'smack_messages',
        },
        (payload: any) => {
          const newMsg = payload.new;
          if (!newMsg?.pool_id || !newMsg?.user_id) {
            return;
          }

          const state = get();

          // Skip if this is the currently active pool (user is looking at it)
          if (newMsg.pool_id === state.activePoolId) {
            return;
          }

          // Skip if this is the current user's own message
          if (newMsg.user_id === state.user?.id) {
            return;
          }

          // Skip if this pool is not in the user's pools
          const poolIds = new Set(state.userPools.map(p => p.id));
          if (!poolIds.has(newMsg.pool_id)) {
            return;
          }

          // Increment unread count for this pool
          set(s => ({
            smackUnreadCounts: {
              ...s.smackUnreadCounts,
              [newMsg.pool_id]: (s.smackUnreadCounts[newMsg.pool_id] ?? 0) + 1,
            },
          }));
        },
      )
      .subscribe();

    set({smackRealtimeChannel: channel});
  },

  unsubscribeSmackUnread: () => {
    const channel = get().smackRealtimeChannel;
    if (channel) {
      supabase.removeChannel(channel);
      set({smackRealtimeChannel: null});
    }
  },

  // ---------------------------------------------------------------------------
  // Global pool auto-enrollment
  // ---------------------------------------------------------------------------
  ensureGlobalPoolMembership: async () => {
    const userId = get().user?.id;
    if (!userId) return;

    // Call the SECURITY DEFINER RPC — enrolls user in all active global pools
    await supabase.rpc('auto_enroll_global_pools');
  },

  // ---------------------------------------------------------------------------
  // Brand config
  // ---------------------------------------------------------------------------
  activeBrandConfig: null,
  setActiveBrandConfig: config => set({activeBrandConfig: config}),
  updatePoolBrandConfig: (poolId, config) => {
    set(state => ({
      userPools: state.userPools.map(p =>
        p.id === poolId ? {...p, brand_config: config as Record<string, unknown> | null} : p,
      ),
      // If this is the active pool, also update the global theme
      ...(state.activePoolId === poolId ? {activeBrandConfig: config} : {}),
    }));
  },

  // ---------------------------------------------------------------------------
  // Feature flags
  // ---------------------------------------------------------------------------
  showGlobalPool: false,
}));
