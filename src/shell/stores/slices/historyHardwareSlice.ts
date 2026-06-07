// History, hardware (career awards), and player-archetype actions for the
// global store. Extracted verbatim from globalStore.ts; receives the store's
// own set/get so behaviour is identical. Pick<GlobalState> lets tsc verify the
// member set + signatures.
import type {StoreApi} from 'zustand';
import {supabase} from '@shared/config/supabase';
import {nflSeason} from '@sports/nfl/config';
import type {GlobalState, UserHardwareItem} from '../globalStore.types';

type Set = StoreApi<GlobalState>['setState'];
type Get = StoreApi<GlobalState>['getState'];

type HistoryHardwareSlice = Pick<
  GlobalState,
  | 'userHardware'
  | 'hasHistory'
  | 'historyVisibility'
  | 'playerArchetype'
  | 'loadUserHardware'
  | 'updateHistoryVisibility'
  | 'computePlayerArchetype'
>;

export const createHistoryHardwareSlice = (set: Set, get: Get): HistoryHardwareSlice => ({
  userHardware: [],
  hasHistory: false,
  historyVisibility: 'pools_only',
  playerArchetype: null,

  loadUserHardware: async () => {
    const userId = get().user?.id;
    if (!userId) return;

    const {data} = await supabase
      .from('user_hardware')
      .select('*')
      .eq('user_id', userId)
      .order('awarded_at', {ascending: false});

    const items: UserHardwareItem[] = (data ?? []).map((r: any) => ({
      id: r.id,
      hardwareSlug: r.hardware_slug,
      hardwareName: r.hardware_name,
      category: r.category,
      scope: r.scope,
      competition: r.competition,
      seasonYear: r.season_year,
      week: r.week,
      poolId: r.pool_id,
      contextJson: r.context_json ?? {},
      awardedAt: r.awarded_at,
      isVisible: r.is_visible,
    }));

    // Check if user has any history (non-no-show week in current competition)
    const competition = nflSeason.competition;
    const {count, error: countError} = await supabase
      .from('season_user_totals')
      .select('id', {count: 'exact', head: true})
      .eq('user_id', userId)
      .eq('competition', competition)
      .eq('is_no_show', false);

    // Read visibility preference from profile
    const profile = get().userProfile;
    const visibility = (profile as any)?.history_visibility ?? 'pools_only';

    set({
      userHardware: items,
      hasHistory: (count ?? 0) > 0,
      historyVisibility: visibility,
    });

    // Compute archetype after loading hardware
    get().computePlayerArchetype();
  },

  updateHistoryVisibility: async (v: 'private' | 'pools_only' | 'public') => {
    const userId = get().user?.id;
    if (!userId) return;

    await supabase
      .from('profiles')
      .update({history_visibility: v})
      .eq('id', userId);

    set({historyVisibility: v});
  },

  computePlayerArchetype: () => {
    const hardware = get().userHardware;
    const profile = get().userProfile;
    if (!hardware.length || !profile) {
      set({playerArchetype: null});
      return;
    }

    // Count career stats from hardware
    const poolChampionCount = hardware.filter(h => h.hardwareSlug === 'pool_champion').length;
    const poolChampionPools = new Set(hardware.filter(h => h.hardwareSlug === 'pool_champion').map(h => h.poolId)).size;
    const ironPoolieCount = hardware.filter(h => h.hardwareSlug === 'iron_poolie').length;
    const gunslingerCount = hardware.filter(h => h.hardwareSlug === 'gunslinger_week').length;
    const sharpshooterCount = hardware.filter(h => h.hardwareSlug === 'sharpshooter_week').length;

    // Career stats from profiles table
    const careerCorrect = (profile as any).career_picks_correct ?? 0;
    const careerTotal = (profile as any).career_picks_total ?? 0;
    const careerHPCorrect = (profile as any).career_hotpick_correct ?? 0;
    const careerHPTotal = (profile as any).career_hotpick_total ?? 0;
    const careerPickRate = careerTotal > 0 ? careerCorrect / careerTotal : 0;
    const careerHPRate = careerHPTotal > 0 ? careerHPCorrect / careerHPTotal : 0;

    // Determine archetype by priority
    // The Closer: Pool Champion in 2+ different pools
    if (poolChampionCount >= 2 && poolChampionPools >= 2) {
      set({
        playerArchetype: {
          label: 'The Closer',
          description: `You know how to finish. ${poolChampionCount} Contest Championships across ${poolChampionPools} different Contests.`,
        },
      });
      return;
    }

    // The Sharpshooter: career regular pick win rate >= 65%
    if (careerTotal >= 100 && careerPickRate >= 0.65) {
      set({
        playerArchetype: {
          label: 'The Sharpshooter',
          description: `Pure knowledge. You've hit ${Math.round(careerPickRate * 100)}% of your regular picks across your career.`,
        },
      });
      return;
    }

    // The Gunslinger: frequent high-rank HotPick wins
    if (gunslingerCount >= 3) {
      set({
        playerArchetype: {
          label: 'The Gunslinger',
          description: `You go big. ${gunslingerCount} Gunslinger awards. It's cost you. It's also won you ${poolChampionCount} Contest${poolChampionCount !== 1 ? 's' : ''}.`,
        },
      });
      return;
    }

    // The Grinder: Iron Poolie in 2+ seasons
    if (ironPoolieCount >= 2) {
      set({
        playerArchetype: {
          label: 'The Grinder',
          description: `Never missed a week. ${ironPoolieCount} Iron Player awards. ${careerCorrect} correct picks. Quietly dangerous.`,
        },
      });
      return;
    }

    // No archetype threshold met — show nothing
    set({playerArchetype: null});
  },
});
