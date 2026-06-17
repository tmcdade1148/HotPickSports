// Pool Module indicators + per-pool rank-batch actions for the global store
// (Home Redesign §6.4.6). Aggregated single-query loads (never per-pool
// useEffect). Extracted verbatim; receives the store's own set. The
// race-condition guard for loadWeekRankByPool is module-scoped here, exactly as
// it was in globalStore.ts.
import type {StoreApi} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {GlobalState} from '../globalStore.types';

type Set = StoreApi<GlobalState>['setState'];

// Race-condition guard for loadWeekRankByPool. Each call stamps this with its
// (competition, week) tag at start; the resolved response only writes to the
// store if its tag still matches — preventing a slow response from clobbering
// newer state when the user advances weeks.
let weekRankLatestTag = '';

type PoolIndicatorsSlice = Pick<
  GlobalState,
  | 'poolIndicators'
  | 'loadPoolIndicators'
  | 'markOrgNotificationsRead'
  | 'userRankByPool'
  | 'weekRankByPool'
  | 'loadWeekRankByPool'
  | 'loadUserRankByPool'
>;

export const createPoolIndicatorsSlice = (set: Set): PoolIndicatorsSlice => ({
  poolIndicators: {},

  loadPoolIndicators: async (userId, poolIds) => {
    if (poolIds.length === 0) {
      set({poolIndicators: {}});
      return;
    }

    // One aggregated query across all pools — never N+1 per Module.
    // Counts organizer_notifications.sent_at > notification_read_state.last_read_at.
    const [unreadResult, readStateResult] = await Promise.all([
      supabase
        .from('organizer_notifications')
        .select('pool_id, sent_at')
        .in('pool_id', poolIds)
        .order('sent_at', {ascending: false}),
      supabase
        .from('notification_read_state')
        .select('pool_id, last_read_at')
        .in('pool_id', poolIds)
        .eq('user_id', userId),
    ]);

    const lastReadByPool = new Map<string, string>();
    for (const row of (readStateResult.data ?? []) as Array<{
      pool_id: string;
      last_read_at: string;
    }>) {
      lastReadByPool.set(row.pool_id, row.last_read_at);
    }

    const indicators: Record<string, {orgUnread: number; mostRecentAt: string | null}> = {};
    for (const pid of poolIds) {
      indicators[pid] = {orgUnread: 0, mostRecentAt: null};
    }

    for (const row of (unreadResult.data ?? []) as Array<{
      pool_id: string;
      sent_at: string;
    }>) {
      const cell = indicators[row.pool_id];
      if (!cell) continue;
      const lastRead = lastReadByPool.get(row.pool_id);
      // If we've never visited the pool's notifications, EVERYTHING is unread.
      if (!lastRead || row.sent_at > lastRead) {
        cell.orgUnread += 1;
      }
      // mostRecentAt = the newest sent_at we've seen for this pool (any read state).
      if (!cell.mostRecentAt || row.sent_at > cell.mostRecentAt) {
        cell.mostRecentAt = row.sent_at;
      }
    }

    set({poolIndicators: indicators});
  },

  markOrgNotificationsRead: async (userId, poolId) => {
    const now = new Date().toISOString();
    // Upsert by (user_id, pool_id) — primary key composite. RLS allows
    // user to insert/update their own rows only.
    await supabase
      .from('notification_read_state')
      .upsert(
        {user_id: userId, pool_id: poolId, last_read_at: now},
        {onConflict: 'user_id,pool_id'},
      );
    set(state => ({
      poolIndicators: {
        ...state.poolIndicators,
        [poolId]: {...(state.poolIndicators[poolId] ?? {mostRecentAt: null}), orgUnread: 0},
      },
    }));
  },

  userRankByPool: {},

  weekRankByPool: {},
  loadWeekRankByPool: async (userId, poolIds, competition, week) => {
    if (poolIds.length === 0 || week <= 0) {
      weekRankLatestTag = '';
      set({weekRankByPool: {}});
      return;
    }
    weekRankLatestTag = `${competition}::${week}`;
    // All active members count toward rank + member totals on the Pool Module
    // card, including super-admins.
    const {data: membersRaw} = await supabase
      .from('pool_members')
      .select('pool_id, user_id')
      .in('pool_id', poolIds)
      .eq('status', 'active');
    if (!membersRaw) {
      set({weekRankByPool: {}});
      return;
    }
    const members = membersRaw;
    const memberIds = [...new Set(members.map((r: any) => r.user_id))];
    if (memberIds.length === 0) {
      set({weekRankByPool: {}});
      return;
    }
    const {data: totals} = await supabase
      .from('season_user_totals')
      .select('user_id, week_points')
      .eq('competition', competition)
      .eq('week', week)
      .in('user_id', memberIds);
    const pointsByUser: Record<string, number> = {};
    for (const r of totals ?? []) {
      pointsByUser[(r as any).user_id] =
        (pointsByUser[(r as any).user_id] ?? 0) + ((r as any).week_points ?? 0);
    }
    const membersByPool: Record<string, string[]> = {};
    for (const row of members) {
      const pid = (row as any).pool_id as string;
      const uid = (row as any).user_id as string;
      if (!membersByPool[pid]) membersByPool[pid] = [];
      membersByPool[pid].push(uid);
    }
    const map: Record<string, {rank: number; memberCount: number; weekPoints: number}> = {};
    for (const pid of Object.keys(membersByPool)) {
      const ids = membersByPool[pid];
      const ranked = ids
        .map(uid => ({uid, pts: pointsByUser[uid] ?? 0}))
        .sort((a, b) => b.pts - a.pts);
      const idx = ranked.findIndex(r => r.uid === userId);
      if (idx === -1) continue;
      map[pid] = {
        rank: idx + 1,
        memberCount: ids.length,
        weekPoints: ranked[idx].pts,
      };
    }
    // Race-condition guard — discard if a newer call has already been
    // issued for a different (week, competition) tuple. Avoids the
    // late-response-overwrite bug without a cross-store import.
    const tag = `${competition}::${week}`;
    if (weekRankLatestTag !== tag) return;
    set({weekRankByPool: map});
  },

  loadUserRankByPool: async (userId, poolIds) => {
    if (poolIds.length === 0) {
      set({userRankByPool: {}});
      return;
    }

    // One RPC round trip for all pools at once.
    const {data, error} = await supabase.rpc('get_user_ranks_in_pools', {
      p_user_id:  userId,
      p_pool_ids: poolIds,
    });

    if (error || !data) {
      set({userRankByPool: {}});
      return;
    }

    const map: Record<string, {rank: number; memberCount: number; total: number}> = {};
    for (const row of data as Array<{
      pool_id: string;
      user_rank: number;
      member_count: number;
      user_total: number;
    }>) {
      map[row.pool_id] = {
        rank:        row.user_rank,
        memberCount: row.member_count,
        total:       row.user_total,
      };
    }
    set({userRankByPool: map});
  },
});
