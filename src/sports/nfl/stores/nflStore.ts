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
  weekState: WeekState;
  picksDeadline: Date | null;
  userHotPick: DbSeasonPick | null;
  liveScores: Record<string, GameScore>;
  weekResult: WeekResult | null;
  poolStandings: Standing[];

  // Actions
  initialize: (competition: string) => Promise<void>;
  setWeekState: (state: WeekState) => void;
  setCurrentWeek: (week: number) => void;
  setLiveScore: (gameId: string, score: GameScore) => void;
  setWeekResult: (result: WeekResult | null) => void;
  setPoolStandings: (standings: Standing[]) => void;
  fetchCompetitionConfig: () => Promise<void>;
  fetchUserHotPick: (userId: string) => Promise<void>;
}

export const useNFLStore = create<NFLState>((set, get) => ({
  competition: 'nfl_2026',
  currentWeek: 1,
  weekState: 'picks_open',
  picksDeadline: null,
  userHotPick: null,
  liveScores: {},
  weekResult: null,
  poolStandings: [],

  initialize: async (competition: string) => {
    set({competition, liveScores: {}, weekResult: null, poolStandings: []});
    await get().fetchCompetitionConfig();
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

    set({currentWeek, weekState, picksDeadline});
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
}));
