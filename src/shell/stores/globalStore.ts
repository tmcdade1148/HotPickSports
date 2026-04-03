import {create} from 'zustand';
import type {User} from '@supabase/supabase-js';
import type {AnyEventConfig} from '@shared/types/templates';
import type {DbPool, DbProfile, DbPoolMember} from '@shared/types/database';
import type {BrandConfig} from '@shell/theme/types';
import {supabase} from '@shared/config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getEventsByPriority} from '@sports/registry';
import {deactivateDeviceTokens} from '@shell/services/pushNotifications';
import {nflSeason} from '@sports/nfl/config';

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
  /** Fetch current_tos_version from competition_config */
  fetchCurrentTosVersion: () => Promise<string | null>;
  /** Check if user's tos_version matches current_tos_version */
  needsTosUpdate: (currentTosVersion: string) => boolean;

  // Invite code — stored in memory for deep link flow
  pendingInviteCode: string | null;
  setPendingInviteCode: (code: string | null) => void;
  clearPendingInviteCode: () => void;

  // Pool state — global, drives all tabs simultaneously
  activePoolId: string | null;
  defaultPoolId: string | null; // loads on app open (persisted per competition)
  userPools: DbPool[];
  visiblePools: DbPool[]; // userPools filtered: hides auto-enrolled global pools
  poolRoles: Record<string, string>; // poolId → 'member' | 'admin' | 'organizer'
  manualGlobalJoins: Record<string, boolean>; // poolId → true if user joined global pool via invite code
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

  // Flagged message counts — poolId → pending count (organizer/admin only)
  flaggedCounts: Record<string, number>;
  fetchFlaggedCounts: () => Promise<void>;

  // Recent broadcasts — for Message Center on Home Screen
  recentBroadcasts: {poolId: string; poolName: string; message: string; sentAt: string; senderName: string}[];
  fetchRecentBroadcasts: () => Promise<void>;

  // Global pool auto-enrollment
  ensureGlobalPoolMembership: () => Promise<void>;

  // Brand config — drives useTheme() and useBrand() hooks
  activeBrandConfig: BrandConfig | null;
  setActiveBrandConfig: (config: BrandConfig | null) => void;
  updatePoolBrandConfig: (poolId: string, config: BrandConfig | null) => void;

  // Feature flags
  showGlobalPool: boolean;

  // History & Hardware
  userHardware: UserHardwareItem[];
  hasHistory: boolean;
  historyVisibility: 'private' | 'pools_only' | 'public';
  playerArchetype: PlayerArchetype | null;
  loadUserHardware: () => Promise<void>;
  updateHistoryVisibility: (v: 'private' | 'pools_only' | 'public') => Promise<void>;
  computePlayerArchetype: () => void;
}

export interface UserHardwareItem {
  id: string;
  hardwareSlug: string;
  hardwareName: string;
  category: 'weekly' | 'season' | 'career';
  scope: 'platform' | 'pool';
  competition: string;
  seasonYear: number;
  week: number | null;
  poolId: string | null;
  contextJson: Record<string, unknown>;
  awardedAt: string;
  isVisible: boolean;
}

export interface PlayerArchetype {
  label: string;
  description: string;
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

    // Deactivate push tokens for this device (is_active = false, never DELETE)
    const userId = get().user?.id;
    if (userId) {
      await deactivateDeviceTokens(userId).catch(() => {});
    }

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
    // Read current TOS version from competition_config
    const {data: configRow} = await supabase
      .from('competition_config')
      .select('value')
      .eq('competition', 'global')
      .eq('key', 'current_tos_version')
      .single();

    const tosVersion = configRow?.value ?? '1.0';

    const {error} = await supabase.rpc('rpc_accept_tos', {
      p_tos_version: tosVersion,
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
            tos_version: tosVersion,
          }
        : null,
    }));
    return true;
  },

  fetchCurrentTosVersion: async () => {
    const {data} = await supabase
      .from('competition_config')
      .select('value')
      .eq('competition', 'global')
      .eq('key', 'current_tos_version')
      .single();
    return data?.value ?? null;
  },

  needsTosUpdate: (currentTosVersion: string) => {
    const profile = get().userProfile;
    if (!profile || !profile.tos_version) return true;
    return profile.tos_version !== currentTosVersion;
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

    // Compute visible pools: hide global pools unless manually joined
    const visible = pools.filter(p => {
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

    // Set active pool immediately for instant UI feedback
    set({activePoolId: typedPool.id});
    AsyncStorage.setItem(poolStorageKey(competition), typedPool.id);

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

    // Fire broadcast email Edge Function (non-blocking — don't await)
    const profile = get().userProfile;
    const senderName =
      profile?.first_name ?? profile?.poolie_name ?? 'Pool Organizer';

    supabase.functions
      .invoke('send-broadcast-email', {
        body: {pool_id: poolId, message, sender_name: senderName},
      })
      .then(res => {
        if (res.error) {
          console.warn('[broadcast-email] Edge Function error:', res.error);
        } else {
          console.log('[broadcast-email] Emails dispatched:', res.data);
        }
      })
      .catch(err => {
        console.warn('[broadcast-email] Failed to invoke:', err);
      });

    // Refresh broadcasts so MessageCenter shows the new one
    get().fetchRecentBroadcasts();

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
    if (poolIds.length === 0) return;

    const {data, error} = await supabase
      .rpc('get_smack_unread_counts', {
        p_user_id: userId,
        p_pool_ids: poolIds,
      });

    if (error || !data) return;

    const counts: Record<string, number> = {};
    for (const row of data) {
      counts[row.pool_id] = Number(row.unread_count);
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
  // Flagged message counts (organizer/admin pools)
  // ---------------------------------------------------------------------------
  flaggedCounts: {},

  fetchFlaggedCounts: async () => {
    const {userPools, poolRoles} = get();
    // Only fetch for pools where user is organizer or admin
    const adminPools = userPools.filter(
      p => poolRoles[p.id] === 'organizer' || poolRoles[p.id] === 'admin',
    );
    if (adminPools.length === 0) {
      set({flaggedCounts: {}});
      return;
    }

    const poolIds = adminPools.map(p => p.id);
    const {data} = await supabase
      .from('smack_messages')
      .select('pool_id')
      .in('pool_id', poolIds)
      .eq('is_flagged', true)
      .eq('moderation_status', 'pending');

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.pool_id] = (counts[row.pool_id] ?? 0) + 1;
    }
    set({flaggedCounts: counts});
  },

  // ---------------------------------------------------------------------------
  // Recent broadcasts (last 24 hours across user's pools)
  // ---------------------------------------------------------------------------
  recentBroadcasts: [],

  fetchRecentBroadcasts: async () => {
    const {userPools} = get();
    if (userPools.length === 0) {
      set({recentBroadcasts: []});
      return;
    }

    const poolIds = userPools.map(p => p.id);
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const {data} = await supabase
      .from('organizer_notifications')
      .select('pool_id, message, sent_at, organizer_id, notification_type')
      .in('pool_id', poolIds)
      .eq('notification_type', 'broadcast')
      .gte('sent_at', twentyFourHoursAgo)
      .order('sent_at', {ascending: false})
      .limit(10);

    if (!data || data.length === 0) {
      set({recentBroadcasts: []});
      return;
    }

    // Fetch sender names
    const senderIds = [...new Set(data.map((r: any) => r.organizer_id))];
    const {data: profiles} = await supabase
      .from('profiles')
      .select('id, first_name, last_name, poolie_name, display_name_preference')
      .in('id', senderIds);

    const nameMap: Record<string, string> = {};
    for (const p of profiles ?? []) {
      const pref = p.display_name_preference ?? 'first_name';
      if (pref === 'poolie_name' && p.poolie_name) {
        nameMap[p.id] = p.poolie_name;
      } else {
        nameMap[p.id] = [p.first_name, p.last_name?.charAt(0)]
          .filter(Boolean)
          .join(' ') || 'Organizer';
      }
    }

    const poolNameMap: Record<string, string> = {};
    for (const p of userPools) {
      poolNameMap[p.id] = p.name;
    }

    const broadcasts = data.map((r: any) => ({
      poolId: r.pool_id,
      poolName: poolNameMap[r.pool_id] ?? 'Pool',
      message: r.message,
      sentAt: r.sent_at,
      senderName: nameMap[r.organizer_id] ?? 'Organizer',
    }));

    set({recentBroadcasts: broadcasts});
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

  // ---------------------------------------------------------------------------
  // History & Hardware
  // ---------------------------------------------------------------------------
  userHardware: [],
  hasHistory: false,
  historyVisibility: 'pools_only',
  playerArchetype: null,

  loadUserHardware: async () => {
    const userId = get().user?.id;
    if (!userId) return;

    const {data} = await supabase
      .from('user_hardware')
      .select('*')
      .eq('user_id', userId)
      .order('awarded_at', {ascending: false});

    const items: UserHardwareItem[] = (data ?? []).map((r: any) => ({
      id: r.id,
      hardwareSlug: r.hardware_slug,
      hardwareName: r.hardware_name,
      category: r.category,
      scope: r.scope,
      competition: r.competition,
      seasonYear: r.season_year,
      week: r.week,
      poolId: r.pool_id,
      contextJson: r.context_json ?? {},
      awardedAt: r.awarded_at,
      isVisible: r.is_visible,
    }));

    // Check if user has any history (non-no-show week in current competition)
    const competition = nflSeason.competition;
    const {count, error: countError} = await supabase
      .from('season_user_totals')
      .select('id', {count: 'exact', head: true})
      .eq('user_id', userId)
      .eq('competition', competition)
      .eq('is_no_show', false);

    // Read visibility preference from profile
    const profile = get().userProfile;
    const visibility = (profile as any)?.history_visibility ?? 'pools_only';

    set({
      userHardware: items,
      hasHistory: (count ?? 0) > 0,
      historyVisibility: visibility,
    });

    // Compute archetype after loading hardware
    get().computePlayerArchetype();
  },

  updateHistoryVisibility: async (v: 'private' | 'pools_only' | 'public') => {
    const userId = get().user?.id;
    if (!userId) return;

    await supabase
      .from('profiles')
      .update({history_visibility: v})
      .eq('id', userId);

    set({historyVisibility: v});
  },

  computePlayerArchetype: () => {
    const hardware = get().userHardware;
    const profile = get().userProfile;
    if (!hardware.length || !profile) {
      set({playerArchetype: null});
      return;
    }

    // Count career stats from hardware
    const poolChampionCount = hardware.filter(h => h.hardwareSlug === 'pool_champion').length;
    const poolChampionPools = new Set(hardware.filter(h => h.hardwareSlug === 'pool_champion').map(h => h.poolId)).size;
    const ironPoolieCount = hardware.filter(h => h.hardwareSlug === 'iron_poolie').length;
    const gunslingerCount = hardware.filter(h => h.hardwareSlug === 'gunslinger_week').length;
    const sharpshooterCount = hardware.filter(h => h.hardwareSlug === 'sharpshooter_week').length;

    // Career stats from profiles table
    const careerCorrect = (profile as any).career_picks_correct ?? 0;
    const careerTotal = (profile as any).career_picks_total ?? 0;
    const careerHPCorrect = (profile as any).career_hotpick_correct ?? 0;
    const careerHPTotal = (profile as any).career_hotpick_total ?? 0;
    const careerPickRate = careerTotal > 0 ? careerCorrect / careerTotal : 0;
    const careerHPRate = careerHPTotal > 0 ? careerHPCorrect / careerHPTotal : 0;

    // Determine archetype by priority
    // The Closer: Pool Champion in 2+ different pools
    if (poolChampionCount >= 2 && poolChampionPools >= 2) {
      set({
        playerArchetype: {
          label: 'The Closer',
          description: `You know how to finish. ${poolChampionCount} Pool Championships across ${poolChampionPools} different pools.`,
        },
      });
      return;
    }

    // The Sharpshooter: career regular pick win rate >= 65%
    if (careerTotal >= 100 && careerPickRate >= 0.65) {
      set({
        playerArchetype: {
          label: 'The Sharpshooter',
          description: `Pure knowledge. You've hit ${Math.round(careerPickRate * 100)}% of your regular picks across your career.`,
        },
      });
      return;
    }

    // The Gunslinger: frequent high-rank HotPick wins
    if (gunslingerCount >= 3) {
      set({
        playerArchetype: {
          label: 'The Gunslinger',
          description: `You go big. ${gunslingerCount} Gunslinger awards. It's cost you. It's also won you ${poolChampionCount} pool${poolChampionCount !== 1 ? 's' : ''}.`,
        },
      });
      return;
    }

    // The Grinder: Iron Poolie in 2+ seasons
    if (ironPoolieCount >= 2) {
      set({
        playerArchetype: {
          label: 'The Grinder',
          description: `Never missed a week. ${ironPoolieCount} Iron Poolie awards. ${careerCorrect} correct picks. Quietly dangerous.`,
        },
      });
      return;
    }

    // No archetype threshold met — show nothing
    set({playerArchetype: null});
  },
}));
