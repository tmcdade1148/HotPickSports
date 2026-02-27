import {create} from 'zustand';
import {supabase} from '@shared/config/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tournament stage progression */
export type TournamentStage =
  | 'PRE_TOURNAMENT'
  | 'GROUP'
  | 'R32'
  | 'R16'
  | 'QF'
  | 'SF'
  | 'FINAL';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface WorldCupState {
  competition: string;
  currentStage: TournamentStage;
  groupPicksOpen: boolean;
  groupPicksLocked: boolean;
  knockoutPicksOpen: boolean;
  isActive: boolean;
  isComplete: boolean;

  // Actions
  initialize: (competition: string) => Promise<void>;
  fetchCompetitionConfig: () => Promise<void>;
}

export const useWorldCupStore = create<WorldCupState>((set, get) => ({
  competition: 'world_cup_2026',
  currentStage: 'PRE_TOURNAMENT',
  groupPicksOpen: false,
  groupPicksLocked: false,
  knockoutPicksOpen: false,
  isActive: false,
  isComplete: false,

  initialize: async (competition: string) => {
    set({competition});
    await get().fetchCompetitionConfig();
  },

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

    set({
      currentStage:
        typeof cfg.current_stage === 'string'
          ? (cfg.current_stage as TournamentStage)
          : 'PRE_TOURNAMENT',
      groupPicksOpen: cfg.group_picks_open === true,
      groupPicksLocked: cfg.group_picks_locked === true,
      knockoutPicksOpen: cfg.knockout_picks_open === true,
      isActive: cfg.is_active === true,
      isComplete: cfg.is_complete === true,
    });
  },
}));
