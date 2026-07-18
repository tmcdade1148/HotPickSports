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
    rawDefaultPoolId ??
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
