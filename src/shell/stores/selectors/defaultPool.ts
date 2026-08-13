import {useGlobalStore} from '@shell/stores/globalStore';

/**
 * resolveDefaultPoolId — Tom's cold-start "star" resolution, in one place.
 *
 * Precedence (explicit star beats every inference):
 *   manual star (defaultPoolId) → first created (organizer) → first partner
 *   (branded) → first joined (list order) → null.
 *
 * Extracted from SettingsScreen so the same rule paints the Settings star fill
 * AND seeds the viewed contest on cold start (PoolWelcome.initializeAndNavigate)
 * — replacing the old `globalPool ?? pools[0]`, which ignored the star.
 *
 * This never persists anything back to defaultPoolId — the star stays
 * explicit-only. It's a pure resolver over the current pool list.
 */
export function resolveDefaultPoolId(
  pools: Array<{id: string; brand_config?: unknown}>,
  poolRoles: Record<string, string>,
  rawDefaultPoolId: string | null,
): string | null {
  return (
    // The star is RESOLVED AGAINST THE LIST, not returned on trust. It used to
    // be `rawDefaultPoolId ??`, which handed back the persisted id even when no
    // such pool was present — harmless only because every pool a user could
    // star was also in the list.
    //
    // Archived Contests used to be in that list (fetchUserPools' membership leg
    // didn't filter is_archived). Now they aren't, so a Player whose ONLY
    // Contest was archived, and who had starred it, would otherwise get a
    // dangling id here: activePoolId is null, this returns the dead star, and
    // useViewingPoolId scopes the Ladder and Chirps to a Contest absent from
    // their list. `null` is the correct terminal case — see this file's header.
    //
    // A stale star falls THROUGH to the remaining precedence rather than
    // blanking the screen, so a Player with other Contests still lands on one.
    pools.find(p => p.id === rawDefaultPoolId)?.id ??
    pools.find(p => poolRoles[p.id] === 'organizer')?.id ??
    pools.find(p => !!(p.brand_config as any)?.is_branded)?.id ??
    pools[0]?.id ??
    null
  );
}

/**
 * useViewingPoolId — the ONE source of truth for "which Contest Ladder + Chirp
 * are showing." Both scoped tabs read this, so they can never diverge.
 *
 *   viewingPoolId = activePoolId ?? effectiveDefaultPoolId ?? null
 *
 * Resolves among VISIBLE pools only — deliberately NO global-pool fallback.
 * The global pool is is_hidden_from_users, and Privacy Policy v1.0.3 states it
 * is not visible in-app and no platform-wide Leaderboard is shown. `null` is
 * the correct terminal case: zero Contests → an empty state, never someone
 * else's leaderboard.
 */
export function useViewingPoolId(): string | null {
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const visiblePools = useGlobalStore(s => s.visiblePools);
  const poolRoles = useGlobalStore(s => s.poolRoles);
  const defaultPoolId = useGlobalStore(s => s.defaultPoolId);
  return (
    activePoolId ?? resolveDefaultPoolId(visiblePools, poolRoles, defaultPoolId)
  );
}
