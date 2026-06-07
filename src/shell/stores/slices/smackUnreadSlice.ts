// SmackTalk unread-count, Realtime, and flagged-message-count actions for the
// global store. Extracted verbatim from globalStore.ts as a slice factory:
// it receives the store's own set/get, so runtime behaviour is identical to
// when these lived inline. The Pick<> return type makes tsc verify the slice
// provides exactly these GlobalState members with matching signatures.
import type {StoreApi} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {GlobalState} from '../globalStore.types';

type Set = StoreApi<GlobalState>['setState'];
type Get = StoreApi<GlobalState>['getState'];

type SmackUnreadSlice = Pick<
  GlobalState,
  | 'smackUnreadCounts'
  | 'setSmackUnreadCount'
  | 'markPoolAsRead'
  | 'fetchSmackUnreadCounts'
  | 'smackRealtimeChannel'
  | 'subscribeSmackUnread'
  | 'unsubscribeSmackUnread'
  | 'flaggedCounts'
  | 'fetchFlaggedCounts'
>;

export const createSmackUnreadSlice = (set: Set, get: Get): SmackUnreadSlice => ({
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
    // Idempotent singleton: bail if we already have a live channel. Three boot
    // paths (LoadingScreen, postAuthFlow, PoolWelcomeScreen) all call this on
    // session start; only the first wires the channel up. signOut tears it down
    // via unsubscribeSmackUnread.
    //
    // (The channel() wrapper in config/supabase.ts now gives every topic a
    // unique suffix, so this guard is no longer also working around Supabase's
    // dedup-by-name cache — it's purely a single-instance guard.)
    if (get().smackRealtimeChannel) return;

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
});
