import {create} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {DbSeasonPick, DbSeasonGame} from '@shared/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Week state machine: picks_open → locked → live → settling → complete */
export type WeekState =
  | 'picks_open'
  | 'locked'
  | 'live'
  | 'settling'
  | 'complete';

export interface GameScore {
  homeScore: number;
  awayScore: number;
  status: string;
  currentPeriod: number | null;
  gameClock: string | null;
}

export interface WeekResult {
  weekPoints: number;
  correctPicks: number;
  totalPicks: number;
  hotPickCorrect: boolean | null;
  rankDelta: number;
  newRank: number;
}

export interface Standing {
  userId: string;
  displayName: string;
  totalPoints: number;
  rank: number;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface NFLState {
  competition: string;
  currentWeek: number;
  currentPhase: string;
  weekState: WeekState;
  picksDeadline: Date | null;
  userHotPick: DbSeasonPick | null;
  liveScores: Record<string, GameScore>;
  weekResult: WeekResult | null;
  poolStandings: Standing[];

  // picks_open state data
  highestRankedGame: DbSeasonGame | null;
  userPickCount: number;
  totalGamesThisWeek: number;

  // Standings data (for StandingsBadge)
  userSeasonTotal: number;
  userPoolRank: number | null;
  activePoolMemberCount: number;

  // ScoreModule data
  lastWeekNet: number | null; // null in Week 1

  // Actions
  initialize: (competition: string) => Promise<void>;
  setWeekState: (state: WeekState) => void;
  setCurrentWeek: (week: number) => void;
  setLiveScore: (gameId: string, score: GameScore) => void;
  setWeekResult: (result: WeekResult | null) => void;
  setPoolStandings: (standings: Standing[]) => void;
  fetchCompetitionConfig: () => Promise<void>;
  fetchUserHotPick: (userId: string) => Promise<void>;
  fetchHighestRankedGame: () => Promise<void>;
  fetchUserPickStatus: (userId: string) => Promise<void>;
  fetchPoolStandings: (userId: string, poolId: string) => Promise<void>;
  fetchUserSeasonScore: (userId: string) => Promise<void>;
}

export const useNFLStore = create<NFLState>((set, get) => ({
  competition: 'nfl_2025',
  currentWeek: 1,
  currentPhase: 'REGULAR',
  weekState: 'picks_open',
  picksDeadline: null,
  userHotPick: null,
  liveScores: {},
  weekResult: null,
  poolStandings: [],

  // picks_open state data
  highestRankedGame: null,
  userPickCount: 0,
  totalGamesThisWeek: 0,

  // Standings data (for StandingsBadge)
  userSeasonTotal: 0,
  userPoolRank: null,
  activePoolMemberCount: 0,

  // ScoreModule data
  lastWeekNet: null,

  initialize: async (competition: string) => {
    set({
      competition,
      liveScores: {},
      weekResult: null,
      poolStandings: [],
      highestRankedGame: null,
      userPickCount: 0,
      totalGamesThisWeek: 0,
      userSeasonTotal: 0,
      userPoolRank: null,
      activePoolMemberCount: 0,
      lastWeekNet: null,
    });
    await get().fetchCompetitionConfig();
    await get().fetchHighestRankedGame();
  },

  setWeekState: (weekState: WeekState) => set({weekState}),

  setCurrentWeek: (week: number) => set({currentWeek: week}),

  setLiveScore: (gameId, score) =>
    set(state => ({
      liveScores: {...state.liveScores, [gameId]: score},
    })),

  setWeekResult: result => set({weekResult: result}),

  setPoolStandings: standings => set({poolStandings: standings}),

  fetchCompetitionConfig: async () => {
    const {competition} = get();

    const {data: config} = await supabase
      .from('competition_config')
      .select('key, value')
      .eq('competition', competition);

    if (!config) {
      return;
    }

    const cfg: Record<string, unknown> = {};
    for (const row of config) {
      cfg[row.key] = row.value;
    }

    const currentWeek =
      typeof cfg.current_week === 'number' ? cfg.current_week : 1;

    // Derive weekState from config values
    let weekState: WeekState = 'picks_open';
    if (cfg.week_state && typeof cfg.week_state === 'string') {
      weekState = cfg.week_state as WeekState;
    }

    // Parse picks deadline if available
    let picksDeadline: Date | null = null;
    if (cfg.picks_deadline && typeof cfg.picks_deadline === 'string') {
      picksDeadline = new Date(cfg.picks_deadline);
    }

    // Parse current phase (REGULAR | PLAYOFFS | SUPERBOWL)
    const currentPhase =
      typeof cfg.current_phase === 'string' ? cfg.current_phase : 'REGULAR';

    set({currentWeek, weekState, picksDeadline, currentPhase});
  },

  fetchUserHotPick: async (userId: string) => {
    const {competition, currentWeek} = get();

    const {data} = await supabase
      .from('season_picks')
      .select('*')
      .eq('user_id', userId)
      .eq('competition', competition)
      .eq('week', currentWeek)
      .eq('is_hot_pick', true)
      .limit(1)
      .maybeSingle();

    set({userHotPick: (data as DbSeasonPick) ?? null});
  },

  fetchHighestRankedGame: async () => {
    const {competition, currentWeek} = get();

    const {data} = await supabase
      .from('season_games')
      .select('*')
      .eq('competition', competition)
      .eq('week', currentWeek)
      .not('rank', 'is', null)
      .order('rank', {ascending: false})
      .limit(1)
      .maybeSingle();

    set({highestRankedGame: (data as DbSeasonGame) ?? null});
  },

  fetchUserPickStatus: async (userId: string) => {
    const {competition, currentWeek} = get();

    // Count user's picks for this week
    const {count: pickCount} = await supabase
      .from('season_picks')
      .select('id', {count: 'exact', head: true})
      .eq('user_id', userId)
      .eq('competition', competition)
      .eq('week', currentWeek);

    // Count total games this week
    const {count: gameCount} = await supabase
      .from('season_games')
      .select('game_id', {count: 'exact', head: true})
      .eq('competition', competition)
      .eq('week', currentWeek);

    set({
      userPickCount: pickCount ?? 0,
      totalGamesThisWeek: gameCount ?? 0,
    });
  },

  fetchPoolStandings: async (userId: string, poolId: string) => {
    const {competition} = get();

    // 1. Get active pool member user IDs (pool-independent pattern)
    const {data: members} = await supabase
      .from('pool_members')
      .select('user_id')
      .eq('pool_id', poolId)
      .eq('status', 'active');

    const memberUserIds = members?.map(m => m.user_id) ?? [];
    set({activePoolMemberCount: memberUserIds.length});

    if (memberUserIds.length === 0) {
      set({poolStandings: [], userSeasonTotal: 0, userPoolRank: null});
      return;
    }

    // 2. Fetch season_user_totals for pool members (no pool_id on scores)
    const {data: totalsData} = await supabase
      .from('season_user_totals')
      .select('user_id, week_points')
      .eq('competition', competition)
      .in('user_id', memberUserIds);

    // 3. Sum week_points per user across all weeks
    const pointsByUser: Record<string, number> = {};
    for (const row of totalsData ?? []) {
      pointsByUser[row.user_id] =
        (pointsByUser[row.user_id] ?? 0) + (row.week_points ?? 0);
    }

    // 4. Fetch display names
    const {data: profiles} = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', memberUserIds);

    const nameMap: Record<string, string> = {};
    for (const p of profiles ?? []) {
      nameMap[p.id] = p.display_name ?? 'Poolie';
    }

    // 5. Build standings sorted by total points descending
    const standings: Standing[] = memberUserIds
      .map(uid => ({
        userId: uid,
        displayName: nameMap[uid] ?? 'Poolie',
        totalPoints: pointsByUser[uid] ?? 0,
        rank: 0, // assigned below
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((entry, idx) => ({...entry, rank: idx + 1}));

    set({poolStandings: standings});

    // 6. Find current user's standing
    const myStanding = standings.find(s => s.userId === userId);
    set({
      userSeasonTotal: myStanding?.totalPoints ?? 0,
      userPoolRank: myStanding?.rank ?? null,
    });
  },

  fetchUserSeasonScore: async (userId: string) => {
    const {competition, currentWeek} = get();

    // Pool-independent: query user's own season_user_totals directly
    const {data} = await supabase
      .from('season_user_totals')
      .select('week, week_points')
      .eq('user_id', userId)
      .eq('competition', competition);

    // Sum all weeks for season total
    let total = 0;
    let lastWeekPoints: number | null = null;

    for (const row of data ?? []) {
      total += row.week_points ?? 0;
      if (row.week === currentWeek - 1) {
        lastWeekPoints = row.week_points ?? 0;
      }
    }

    set({
      userSeasonTotal: total,
      lastWeekNet: currentWeek > 1 ? lastWeekPoints : null,
    });
  },
}));
