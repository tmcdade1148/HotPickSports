// Pool partner-affiliation (League) loading for the global store. Extracted
// verbatim from globalStore.ts; receives the store's own set/get so behaviour
// is identical.
import type {StoreApi} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {GlobalState, PoolAffiliation} from '../globalStore.types';

type Set = StoreApi<GlobalState>['setState'];
type Get = StoreApi<GlobalState>['getState'];

type AffiliationsSlice = Pick<GlobalState, 'poolAffiliations' | 'loadPoolAffiliations'>;

export const createAffiliationsSlice = (set: Set, get: Get): AffiliationsSlice => ({
  poolAffiliations: {},
  loadPoolAffiliations: async (poolIds) => {
    if (poolIds.length === 0) {
      set({poolAffiliations: {}});
      return;
    }

    // One query for all pools. RLS gates SELECT to active members of each
    // pool, so this is safe to call with the full visible pool list.
    const {data, error} = await supabase
      .from('pool_partner_affiliations')
      .select('pool_id, partner_id, brand_config_snapshot, is_primary, created_at')
      .in('pool_id', poolIds);

    if (error) {
      // Don't blow away existing data on transient failures.
      return;
    }

    type Row = {
      pool_id:               string;
      partner_id:            string;
      brand_config_snapshot: Record<string, unknown> | null;
      is_primary:            boolean;
      created_at:            string;
    };

    const byPool: Record<string, PoolAffiliation[]> = {};
    for (const pid of poolIds) byPool[pid] = [];

    for (const row of (data ?? []) as Row[]) {
      const bc   = (row.brand_config_snapshot ?? {}) as Record<string, unknown>;
      const logo = (bc.logo ?? {}) as Record<string, unknown>;
      const logoUrl =
        typeof logo.full === 'string' && logo.full.length > 0
          ? logo.full
          : typeof bc.logo_url === 'string' && bc.logo_url.length > 0
          ? bc.logo_url
          : null;
      const colorOrNull = (key: string): string | null =>
        typeof bc[key] === 'string' && (bc[key] as string).length > 0
          ? (bc[key] as string)
          : null;
      const brandColors = {
        primary:    colorOrNull('primary_color'),
        secondary:  colorOrNull('secondary_color'),
        background: colorOrNull('background_color'),
        highlight:  colorOrNull('highlight_color'),
      };
      const partnerName =
        typeof bc.partner_name === 'string' && bc.partner_name.length > 0
          ? bc.partner_name
          : 'League';

      byPool[row.pool_id]?.push({
        partnerId:    row.partner_id,
        partnerName,
        brandColors,
        logoUrl,
        isPrimary:    row.is_primary,
      });
    }

    // Sort each pool's affiliations: primary first, then by partner name.
    for (const pid of Object.keys(byPool)) {
      byPool[pid].sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.partnerName.localeCompare(b.partnerName, undefined, {
          sensitivity: 'base',
        });
      });
    }

    // Merge — never replace — so a single-pool refresh from
    // PoolSettings / PartnerDirectory doesn't clobber the rest of the
    // map loaded by HomeScreen's all-pool fetch.
    set(state => ({poolAffiliations: {...state.poolAffiliations, ...byPool}}));
  },
});
