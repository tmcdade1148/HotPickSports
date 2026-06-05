// New-user onboarding demo actions for the global store (spec:
// docs/DEMO_WEEK_SPEC.md). enterDemo swaps the active sport/pool to the demo
// event and snapshots the prior selection; exitDemo restores it. Extracted
// verbatim; receives the store's own set/get. The prior-selection snapshot is
// module-scoped here, exactly as it was in globalStore.ts.
import type {StoreApi} from 'zustand';
import {supabase} from '@shared/config/supabase';
import {getDemoEvent, DEMO_POOL_ID} from '@sports/registry';
import type {AnyEventConfig} from '@shared/types/templates';
import type {GlobalState} from '../globalStore.types';

type Set = StoreApi<GlobalState>['setState'];
type Get = StoreApi<GlobalState>['getState'];

// Snapshot of the user's active selection before entering the onboarding demo,
// restored by exitDemo(). Module-scoped (the slice is created once) to avoid
// widening the typed store interface with internal-only fields.
let _preDemoSport: AnyEventConfig | null = null;
let _preDemoPoolId: string | null = null;

type DemoSlice = Pick<
  GlobalState,
  | 'isDemoActive'
  | 'demoIntroOpen'
  | 'demoScoreOpen'
  | 'demoResult'
  | 'enterDemo'
  | 'exitDemo'
  | 'dismissDemoIntro'
  | 'dismissDemoScore'
  | 'setDemoResult'
  | 'clearDemoReveal'
>;

export const createDemoSlice = (set: Set, get: Get): DemoSlice => ({
  isDemoActive: false,
  demoIntroOpen: false,
  demoScoreOpen: false,
  demoResult: null,
  enterDemo: async () => {
    const {isDemoActive, activeSport, activePoolId} = get();
    // Snapshot the prior selection once (so re-entry doesn't clobber it).
    if (!isDemoActive) {
      _preDemoSport = activeSport;
      _preDemoPoolId = activePoolId;
    }
    // Best-effort server reset + demo-pool membership. The picks loop is
    // pool-independent, so a failure here doesn't block the demo render.
    try {
      await supabase.rpc('enter_demo');
    } catch {
      // ignore — non-critical to rendering the demo picks screen
    }
    // Set state directly (not via setActiveSport) to avoid its async
    // loadPersistedPoolId racing our activePoolId write. Open the scoring
    // explainer, clear any prior reveal.
    set({
      isDemoActive: true,
      activeSport: getDemoEvent(),
      activePoolId: DEMO_POOL_ID,
      activeBrandConfig: null,
      userPools: [],
      demoIntroOpen: true,
      demoScoreOpen: false,
      demoResult: null,
    });
  },
  exitDemo: () => {
    const prevSport = _preDemoSport;
    const prevPool = _preDemoPoolId;
    _preDemoSport = null;
    _preDemoPoolId = null;
    const demoReset = {
      isDemoActive: false,
      demoIntroOpen: false,
      demoScoreOpen: false,
      demoResult: null,
    };
    if (prevSport) {
      const cached = get().poolsByCompetition[prevSport.competition] ?? [];
      set({
        ...demoReset,
        activeSport: prevSport,
        activePoolId: prevPool,
        userPools: cached,
        activeBrandConfig: null,
      });
    } else {
      set(demoReset);
    }
  },
  dismissDemoIntro: () => set({demoIntroOpen: false}),
  dismissDemoScore: () => set({demoScoreOpen: false}),
  setDemoResult: r => set({demoResult: r, demoScoreOpen: true}),
  clearDemoReveal: () => set({demoResult: null, demoScoreOpen: false}),
});
