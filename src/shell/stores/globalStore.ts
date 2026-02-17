/**
 * Global app store — auth state, active sport/event, user profile.
 * Uses Zustand for lightweight state management.
 *
 * Blueprint reference: Section 4.2 (Global store vs sport-scoped stores)
 */
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../shared/config/supabase';
import { fetchProfile } from '../../shared/services/auth';
import { getDefaultEvent } from '../../shared/types/sport-registry';
import type { User } from '../../shared/types/database';

interface GlobalState {
  // Auth
  session: Session | null;
  profile: User | null;
  isLoading: boolean;

  // Active sport context
  activeEventKey: string;

  // Actions
  setSession: (session: Session | null) => void;
  setProfile: (profile: User | null) => void;
  setActiveEvent: (eventKey: string) => void;
  initialize: () => () => void; // returns cleanup function
  loadProfile: () => Promise<void>;
}

export const useGlobalStore = create<GlobalState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: true,
  activeEventKey: getDefaultEvent()?.eventKey ?? 'worldcup_2026',

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setActiveEvent: (eventKey) => set({ activeEventKey: eventKey }),

  loadProfile: async () => {
    const userId = get().session?.user?.id;
    if (!userId) return;

    try {
      const profile = await fetchProfile(userId);
      set({ profile });
    } catch (err) {
      if (__DEV__) console.warn('[GlobalStore] Failed to load profile:', err);
    }
  },

  initialize: () => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        set({ session, isLoading: false });

        if (session?.user?.id) {
          // Load profile when session is established
          try {
            const profile = await fetchProfile(session.user.id);
            set({ profile });
          } catch (err) {
            if (__DEV__) console.warn('[GlobalStore] Failed to load profile:', err);
          }
        } else {
          set({ profile: null });
        }
      },
    );

    // Check for existing session on startup
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, isLoading: false });
      if (session?.user?.id) {
        get().loadProfile();
      }
    });

    // Return cleanup function
    return () => subscription.unsubscribe();
  },
}));
