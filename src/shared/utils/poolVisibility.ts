/**
 * Pool visibility utility.
 *
 * Global pools are hidden from UI unless the user manually joined
 * via invite code. Auto-enrolled global pool members don't see it
 * in pool lists, switchers, or settings.
 */

import {useGlobalStore} from '@shell/stores/globalStore';

/**
 * Returns true if the pool should be visible in UI lists.
 * Global pools are hidden unless user joined manually (via invite code).
 */
export function isPoolVisible(pool: {id: string; is_global?: boolean}): boolean {
  if (!pool.is_global) return true;
  const manualGlobalJoins = useGlobalStore.getState().manualGlobalJoins;
  return !!manualGlobalJoins[pool.id];
}
