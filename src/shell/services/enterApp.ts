import {useGlobalStore} from '@shell/stores/globalStore';
import {resolveDefaultPoolId} from '@shell/stores/selectors/defaultPool';
import {getDefaultEvent} from '@sports/registry';

/**
 * Completes onboarding and enters the app at Home.
 *
 * Extracted verbatim from PoolWelcomeScreen.initializeAndNavigate so that a
 * Contest created DURING onboarding can finish the same way a join or a skip
 * does. Previously CreatePoolScreen's only exit was goBack(), which returned a
 * brand-new Gaffer to the screen that had just invited them to "start your own
 * Contest" — they read that as a failure and created the Contest a second time.
 * Two real organizers did exactly that, four days apart, ~60 seconds after the
 * first create.
 *
 * Every step below has a consumer, and the ORDER is the order that shipped —
 * getDefaultEvent reads visibleCompetitions before refreshAvailableEvents()
 * mutates it, which is deliberate: the refresh is fire-and-forget for the NEXT
 * render, not an input to this one.
 *
 * State is read through useGlobalStore.getState() rather than hook selectors so
 * this can be called from outside a component body (CreatePoolScreen calls it
 * from inside a setTimeout).
 */
export async function enterAppFromOnboarding(navigation: any): Promise<void> {
  const {
    user,
    visibleCompetitions,
    refreshAvailableEvents,
    setActiveSport,
    fetchUserPools,
    setActivePoolId,
    fetchSmackUnreadCounts,
    subscribeSmackUnread,
  } = useGlobalStore.getState();

  if (!user?.id) return;

  const defaultEvent = getDefaultEvent(visibleCompetitions);
  refreshAvailableEvents();
  setActiveSport(defaultEvent);

  await fetchUserPools(user.id, defaultEvent.competition);
  const pools = useGlobalStore.getState().userPools;

  if (pools.length > 0) {
    // Seed the viewed contest from the star resolver (manual star → first
    // created → first partner → first joined) instead of blindly taking the
    // global pool. Same rule that paints the Settings star; never persists.
    const {poolRoles, defaultPoolId} = useGlobalStore.getState();
    setActivePoolId(
      resolveDefaultPoolId(pools, poolRoles, defaultPoolId) ?? pools[0].id,
    );
    const poolIds = pools.map(p => p.id);
    await fetchSmackUnreadCounts(user.id, poolIds);
  }
  subscribeSmackUnread();

  // reset, not navigate — during onboarding the stack is Welcome → EmailEntry →
  // ProfileSetup → PushNotification → PoolWelcome (→ CreatePool), and Home is
  // not on it at all. navigate would push Home ON TOP of the signup screens and
  // an iOS edge-swipe would walk the new Gaffer straight back into signup.
  navigation.reset({index: 0, routes: [{name: 'Home'}]});
}
