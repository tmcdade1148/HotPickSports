// Recent-broadcasts fetch action for the global store. Extracted verbatim from
// globalStore.ts; receives the store's own set/get so behaviour is identical.
import type {StoreApi} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {GlobalState} from '../globalStore.types';

type Set = StoreApi<GlobalState>['setState'];
type Get = StoreApi<GlobalState>['getState'];

type BroadcastsSlice = Pick<GlobalState, 'recentBroadcasts' | 'fetchRecentBroadcasts'>;

export const createBroadcastsSlice = (set: Set, get: Get): BroadcastsSlice => ({
  recentBroadcasts: [],

  fetchRecentBroadcasts: async () => {
    const {userPools, user} = get();
    if (userPools.length === 0) {
      set({recentBroadcasts: []});
      return;
    }

    const poolIds = userPools.map(p => p.id);
    // 30-day window to match the HomeInbox unread badge (was 24h, which made
    // the badge count messages the list couldn't show).
    const windowStart = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Join times — a broadcast sent before the user joined a pool isn't theirs,
    // so it's excluded here too (mirrors the HomeInbox badge logic).
    const {data: memberRows} = await supabase
      .from('pool_members')
      .select('pool_id, joined_at')
      .eq('user_id', user?.id ?? '')
      .in('pool_id', poolIds);
    const joinedByPool = new Map(
      (memberRows ?? []).map((r: any) => [r.pool_id, r.joined_at]),
    );

    const {data: rawBroadcasts} = await supabase
      .from('organizer_notifications')
      .select('pool_id, message, sent_at, organizer_id, notification_type')
      .in('pool_id', poolIds)
      .eq('notification_type', 'broadcast')
      .gte('sent_at', windowStart)
      .order('sent_at', {ascending: false})
      .limit(20);

    const data = (rawBroadcasts ?? []).filter((r: any) => {
      const joined = joinedByPool.get(r.pool_id);
      return !joined || new Date(r.sent_at) > new Date(joined);
    });

    if (data.length === 0) {
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
});
