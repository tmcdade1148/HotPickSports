import {create} from 'zustand';
import {supabase} from '@shared/config/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Series playoff round progression */
export type SeriesRound =
  | 'FIRST_ROUND'
  | 'SECOND_ROUND'
  | 'CONF_FINALS'
  | 'FINALS';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface NHLState {
  competition: string;
  currentRound: SeriesRound;
  seriesPicksOpen: boolean;
  isActive: boolean;
  isComplete: boolean;

  // Actions
  initialize: (competition: string) => Promise<void>;
  fetchCompetitionConfig: () => Promise<void>;
}

export const useNHLStore = create<NHLState>((set, get) => ({
  competition: 'nhl_playoffs_2027',
  currentRound: 'FIRST_ROUND',
  seriesPicksOpen: false,
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
      currentRound:
        typeof cfg.current_round === 'string'
          ? (cfg.current_round as SeriesRound)
          : 'FIRST_ROUND',
      seriesPicksOpen: cfg.series_picks_open === true,
      isActive: cfg.is_active === true,
      isComplete: cfg.is_complete === true,
    });
  },
}));
