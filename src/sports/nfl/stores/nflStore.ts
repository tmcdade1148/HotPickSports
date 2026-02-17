/**
 * NFL sport-scoped Zustand store — stub ready for Season template.
 *
 * Blueprint reference: Section 4.2 (Sport-scoped stores)
 */
import { create } from 'zustand';
import type { SeasonGame, SeasonPick } from '../../../shared/types/database';

interface NflState {
  games: SeasonGame[];
  picks: SeasonPick[];
  currentWeek: number;
  isLoadingGames: boolean;
  isLoadingPicks: boolean;

  // Actions — stubs for now
  fetchGames: (eventKey: string, week: number) => Promise<void>;
  fetchPicks: (poolId: string, userId: string, week: number) => Promise<void>;
  reset: () => void;
}

export const useNflStore = create<NflState>((set) => ({
  games: [],
  picks: [],
  currentWeek: 1,
  isLoadingGames: false,
  isLoadingPicks: false,

  fetchGames: async (_eventKey, _week) => {
    // TODO: Implement when NFL season template is built
    set({ isLoadingGames: false });
  },

  fetchPicks: async (_poolId, _userId, _week) => {
    // TODO: Implement when NFL season template is built
    set({ isLoadingPicks: false });
  },

  reset: () => set({
    games: [],
    picks: [],
    currentWeek: 1,
    isLoadingGames: false,
    isLoadingPicks: false,
  }),
}));
