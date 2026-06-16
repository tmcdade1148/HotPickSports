import {useEffect, useState} from 'react';
import {supabase} from '@shared/config/supabase';

/**
 * Organizer Paywall Facade — config reader (spec §6e).
 *
 * The cap, the prices, and the founding-pass switch all live in
 * competition_config (competition = 'global'). The client NEVER hardcodes any of
 * them (Hard Rule #14, Red Flag #2). This hook fetches the global keys once per
 * app session and caches them at module scope — they change at most a handful of
 * times a season, so there is no benefit to refetching per mount and no polling.
 *
 * If the config can't be read or is incomplete, this returns `null`. Callers MUST
 * treat null as "don't render the wall" — that keeps prices sourced exclusively
 * from config (a missing value never falls back to a literal). The wall is a
 * priming nicety, not a gate; the server has already allowed the action.
 */
export interface PaywallConfig {
  freeTierMaxMembers: number;
  smallMaxMembers: number;
  mediumMaxMembers: number;
  prices: {small: number; medium: number; large: number};
  foundingSeasonActive: boolean;
}

const GLOBAL_KEYS = [
  'free_tier_max_members',
  'paid_small_max_members',
  'paid_medium_max_members',
  'paid_small_price',
  'paid_medium_price',
  'paid_large_price',
  'founding_season_active',
];

let cache: PaywallConfig | null = null;
let inflight: Promise<PaywallConfig | null> | null = null;

// jsonb scalars arrive already typed (number / boolean), but coerce defensively.
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchPaywallConfig(): Promise<PaywallConfig | null> {
  const {data, error} = await supabase
    .from('competition_config')
    .select('key, value')
    .eq('competition', 'global')
    .in('key', GLOBAL_KEYS);

  if (error || !data) return null;

  const m: Record<string, unknown> = {};
  for (const row of data as Array<{key: string; value: unknown}>) {
    m[row.key] = row.value;
  }

  const freeMax = num(m.free_tier_max_members);
  const smallMax = num(m.paid_small_max_members);
  const mediumMax = num(m.paid_medium_max_members);
  const small = num(m.paid_small_price);
  const medium = num(m.paid_medium_price);
  const large = num(m.paid_large_price);

  // Every display value must be present — no literal fallbacks (Red Flag #2).
  if (
    freeMax == null || smallMax == null || mediumMax == null ||
    small == null || medium == null || large == null
  ) {
    return null;
  }

  cache = {
    freeTierMaxMembers: freeMax,
    smallMaxMembers: smallMax,
    mediumMaxMembers: mediumMax,
    prices: {small, medium, large},
    foundingSeasonActive:
      m.founding_season_active === true || m.founding_season_active === 'true',
  };
  return cache;
}

export function usePaywallConfig(): {config: PaywallConfig | null; loading: boolean} {
  const [config, setConfig] = useState<PaywallConfig | null>(cache);
  const [loading, setLoading] = useState(cache == null);

  useEffect(() => {
    if (cache) return;
    let active = true;
    inflight = inflight ?? fetchPaywallConfig();
    inflight
      .then(c => {
        if (active) setConfig(c);
      })
      // Swallow — config stays null and callers render nothing (the action
      // already succeeded server-side). Avoids an unhandled rejection.
      .catch(() => {})
      .finally(() => {
        inflight = null;
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return {config, loading};
}
