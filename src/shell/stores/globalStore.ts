import {create} from 'zustand';
import type {User} from '@supabase/supabase-js';
import type {AnyEventConfig} from '@shared/types/templates';

interface GlobalState {
  // Auth
  user: User | null;
  isAuthLoading: boolean;
  setUser: (user: User | null) => void;
  setAuthLoading: (loading: boolean) => void;

  // Active event context
  activeSport: AnyEventConfig | null;
  setActiveSport: (sport: AnyEventConfig) => void;
}

export const useGlobalStore = create<GlobalState>(set => ({
  user: null,
  isAuthLoading: true,
  setUser: user => set({user}),
  setAuthLoading: isAuthLoading => set({isAuthLoading}),

  activeSport: null,
  setActiveSport: activeSport => set({activeSport}),
}));
