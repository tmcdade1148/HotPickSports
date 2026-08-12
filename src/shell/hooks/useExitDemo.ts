// The ONE way out of the onboarding demo — TWO exports, deliberately not one hook.
//
// Spec: 260811_HotPick_DemoAccessAndSafety_Spec v1.4 §7.2 (Finding E).
//
// main had THREE exit paths and they had already drifted:
//   1. SeasonPicksScreen.handleExitHome — exitDemo + markConfigStale + reset + RPC
//   2. DemoResultScreen.handleDone      — an identical second copy
//   3. MainTabNavigator's tab listener  — BARE exitDemo(). No markConfigStale,
//                                         no reset_demo. That was the defect.
//
// WHY TWO EXPORTS AND NOT ONE HOOK. Call site 3 is a screenListeners.state
// callback in Tab.Navigator's props. It reads useGlobalStore.getState()
// precisely because a React hook cannot be called from there — "three call sites
// share one hook" does not compile. The navigation step is also WRONG on that
// path: the Player is already navigating to the tab they tapped, and a reset to
// Home would yank them off it.
//
// NOT folded in: DemoResultScreen.handleTryAgain. It does reset_demo +
// clearDemoReveal + resetDemoGames + goBack and deliberately STAYS in the demo
// so the Player can run it again. It is not an exit. Leave it alone.

import {useNavigation} from '@react-navigation/native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';

/**
 * PLAIN FUNCTION. No hooks, so it is safe to call from anywhere — including a
 * navigator callback. These are the three steps that had drifted.
 *
 * markConfigStale() is the line that went missing in copy 3. Its absence is
 * mild rather than corrupting (MainTabNavigator re-fires nflInitialize on a
 * competition change anyway, so the exposure is one stale frame), but three
 * copies that have drifted once will drift again.
 *
 * The reset_demo RPC is fire-and-forget and scoped server-side to
 * competition = 'nfl_demo', so it can never touch a real Pick. Promise.resolve
 * wraps it because supabase.rpc returns a thenable builder with no .catch.
 */
export function exitDemoAndReset(): void {
  useGlobalStore.getState().exitDemo();
  useNFLStore.getState().markConfigStale();
  Promise.resolve(supabase.rpc('reset_demo')).catch(() => {});
}

/**
 * THIN HOOK. The three steps above, then navigate.
 *
 * Exit always returns HOME, never to Picks: going straight back to Picks risks
 * rendering stale demo games inside a real week, and Home forces a clean
 * remount.
 *
 * Note the RPC now dispatches just before navigation.reset rather than just
 * after, as it did in the two originals. It is not awaited either way, so the
 * ordering is behaviourally identical — the "don't flash the Picks screen"
 * concern the original comment describes is governed by exitDemo()'s state
 * update, which is still first.
 */
export function useExitDemo(): () => void {
  const navigation = useNavigation<any>();
  return () => {
    exitDemoAndReset();
    navigation.reset({index: 0, routes: [{name: 'Home'}]});
  };
}
