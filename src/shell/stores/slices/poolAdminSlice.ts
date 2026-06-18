// Pool administration actions for the global store: member management, pool
// settings, organizer broadcasts, and global-pool auto-enrollment. These are
// Gaffer/organizer-facing mutations driven from settings screens; extracted
// verbatim. Receives the store's own set/get. Pick<GlobalState> makes tsc
// verify the slice provides exactly these members with matching signatures.
import type {StoreApi} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {DbPool, DbProfile, DbPoolMember} from '@shared/types/database';
import type {BrandConfig} from '@shell/theme/types';
import type {GlobalState} from '../globalStore.types';

type Set = StoreApi<GlobalState>['setState'];
type Get = StoreApi<GlobalState>['getState'];

type PoolAdminSlice = Pick<
  GlobalState,
  | 'poolMembers'
  | 'isLoadingMembers'
  | 'fetchPoolMembers'
  | 'removePoolMember'
  | 'updateMemberRole'
  | 'updatePoolSettings'
  | 'archivePool'
  | 'broadcastToPool'
  | 'fetchBroadcastsToday'
  | 'ensureGlobalPoolMembership'
>;

export const createPoolAdminSlice = (set: Set, get: Get): PoolAdminSlice => ({
  // --- Member management ---
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

  // --- Pool settings management ---
  updatePoolSettings: async (poolId, settings) => {
    const {data, error} = await supabase.rpc('update_pool_settings', {
      p_pool_id: poolId,
      p_name: settings.name ?? null,
      p_is_public: settings.isPublic ?? null,
      p_welcome_message: settings.welcomeMessage ?? null,
    });

    if (error) {
      return {success: false, error: error.message};
    }

    if (data?.error) {
      return {success: false, error: data.error};
    }

    // Update local state — mirror the change into both `userPools` and
    // `visiblePools`. Every pool-listing UI reads `visiblePools`; updates
    // that only touch `userPools` won't appear until the next fetch.
    const applyUpdate = (p: DbPool) =>
      p.id === poolId
        ? {
            ...p,
            ...(settings.name !== undefined ? {name: settings.name} : {}),
            ...(settings.isPublic !== undefined
              ? {is_public: settings.isPublic}
              : {}),
            ...(settings.welcomeMessage !== undefined
              ? {welcome_message: settings.welcomeMessage.trim() || null}
              : {}),
          }
        : p;
    set(state => ({
      userPools: state.userPools.map(applyUpdate),
      visiblePools: state.visiblePools.map(applyUpdate),
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

    // Remove from local state — mirror the removal into `visiblePools`
    // so Settings, Home, and the pool switcher all stop listing it
    // immediately. Without the visiblePools update the pool stays on
    // screen, and a second archive attempt hits the RPC which (rightly)
    // reports it's already archived.
    //
    // When the archived pool was the active one, fall back to a remaining
    // visible pool rather than nulling activePoolId. Leaving it null forces
    // the whole app shell into the "no active Contest" state mid-session,
    // which downstream consumers don't all expect — selecting the next pool
    // keeps the active selection valid (null only when none remain).
    set(state => {
      const userPools = state.userPools.filter(p => p.id !== poolId);
      const visiblePools = state.visiblePools.filter(p => p.id !== poolId);
      const wasActive = state.activePoolId === poolId;
      const activePoolId = wasActive
        ? visiblePools[0]?.id ?? null
        : state.activePoolId;
      const activeBrandConfig = wasActive
        ? ((visiblePools[0]?.brand_config as unknown as BrandConfig) ?? null)
        : state.activeBrandConfig;
      return {userPools, visiblePools, activePoolId, activeBrandConfig};
    });

    return {success: true};
  },

  // --- Organizer broadcast ---
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

    // Broadcast email delivery is intentionally DISABLED for now. The
    // send-broadcast-email Edge Function sends a real email to every active
    // member; turning it on must be a deliberate launch decision (and it would
    // bounce against the fake @hotpicksports.com test accounts). Until then,
    // a Gaffer broadcast delivers only the in-app Message Center row written by
    // broadcast_to_pool. Re-enable by flipping BROADCAST_EMAIL_ENABLED.
    const BROADCAST_EMAIL_ENABLED = false;
    if (BROADCAST_EMAIL_ENABLED) {
      const profile = get().userProfile;
      const senderName =
        profile?.first_name ?? profile?.poolie_name ?? 'Contest Gaffer';

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
    }

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

  // --- Global pool auto-enrollment ---
  ensureGlobalPoolMembership: async () => {
    const userId = get().user?.id;
    if (!userId) return;

    // Call the SECURITY DEFINER RPC — enrolls user in all active global pools
    await supabase.rpc('auto_enroll_global_pools');
  },
});
