// useLaunchDemo — the ONE way into the onboarding demo.
//
// Spec: 260811_HotPick_DemoAccessAndSafety_Spec v1.4 §6.5.
//
// Moved here VERBATIM from DemoButton.tsx, where it was private with a single
// consumer. Three surfaces need it now (the Home card, the Home quiet line via
// DemoButton's variant, the Picks-screen line, and the Settings row), and
// copying it instead of exporting it is the same failure mode as the exit paths
// one release earlier — see useExitDemo.ts for what three drifted copies cost.
//
// resetDemoGames() is NOT optional. Without it a completed prior demo stays
// cached and a second run opens on finished games with no picks left to make.

import {useNavigation} from '@react-navigation/native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';

export function useLaunchDemo() {
  const navigation = useNavigation<any>();
  const enterDemo = useGlobalStore(s => s.enterDemo);
  const resetDemoGames = useSeasonStore(s => s.resetDemoGames);
  return async () => {
    // Independent: enterDemo resets DB picks + swaps active competition;
    // resetDemoGames reloads the (self-contained) demo games. Run together.
    await Promise.all([enterDemo(), resetDemoGames()]);
    navigation.navigate('PicksTab');
  };
}
