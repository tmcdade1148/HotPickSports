// Partner Module (Home Redesign §6.4.7) data + indicator actions for the global
// store: the partner record cache, active/aligned partner loaders, and
// partner-notification unread indicators. Extracted verbatim; receives the
// store's own set (no get needed). Pick<GlobalState> lets tsc verify the set.
import type {StoreApi} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {GlobalState} from '../globalStore.types';

type Set = StoreApi<GlobalState>['setState'];

type PartnerModuleSlice = Pick<
  GlobalState,
  | 'partnersById'
  | 'activePartnerIds'
  | 'loadActivePartners'
  | 'loadAlignedPartners'
  | 'partnerIndicators'
  | 'loadPartnerIndicators'
  | 'markPartnerNotificationsRead'
>;

export const createPartnerModuleSlice = (set: Set): PartnerModuleSlice => ({
  partnersById: {},
  activePartnerIds: [],
  loadActivePartners: async () => {
    // Fetch every active partner with a configured perk — these populate
    // the "YOUR PARTNERS" section on Home regardless of whether the user
    // has a pool aligned with them.
    const {data} = await supabase
      .from('partners')
      .select('id, name, slug, perk_text, perk_icon, brand_config')
      .eq('is_active', true)
      .not('perk_text', 'is', null);
    if (!data) {
      set({activePartnerIds: []});
      return;
    }
    const rows = data as Array<{
      id: string;
      name: string;
      slug: string;
      perk_text: string | null;
      perk_icon: string | null;
      brand_config: Record<string, unknown> | null;
    }>;
    const map: Record<string, {
      id: string;
      name: string;
      slug: string;
      perk_text: string | null;
      perk_icon: string | null;
      logo_url: string | null;
      primary_color: string | null;
    }> = {};
    const ids: string[] = [];
    for (const row of rows) {
      const bc = (row.brand_config ?? {}) as Record<string, unknown>;
      const logo = (bc.logo ?? {}) as Record<string, unknown>;
      // Tolerate both brand_config logo shapes (REFERENCE.md §15): the
      // nested `logo.full` (current) and the legacy flat `logo_url`
      // some partners still carry. Without the flat fallback, those
      // Clubs render a LogoMark initials block on partner tiles even
      // though the Contest card below correctly resolves the same
      // legacy field via its own helper.
      const logoUrl =
        typeof logo.full === 'string' && logo.full.length > 0
          ? (logo.full as string)
          : typeof bc.logo_url === 'string' && (bc.logo_url as string).length > 0
            ? (bc.logo_url as string)
            : null;
      map[row.id] = {
        id:            row.id,
        name:          row.name,
        slug:          row.slug,
        perk_text:     row.perk_text,
        perk_icon:     row.perk_icon,
        logo_url:      logoUrl,
        primary_color: typeof bc.primary_color === 'string' ? bc.primary_color : null,
      };
      ids.push(row.id);
    }
    // Merge into partnersById so existing aligned-partner lookups still
    // work; broader set just expands what's known.
    set(state => ({
      partnersById: {...state.partnersById, ...map},
      activePartnerIds: ids,
    }));
  },

  loadAlignedPartners: async (partnerIds) => {
    if (partnerIds.length === 0) {
      set({partnersById: {}});
      return;
    }

    // Load every active Club the user is connected to via their Contests
    // — Official Clubs, affiliated Clubs, legacy partner_id Clubs.
    // (Earlier this filtered to perks-only per spec §6.4.7, but the home
    // YOUR CLUBS list is now the authoritative "Clubs you're connected
    // to" surface; Clubs without perks still belong there.)
    const {data} = await supabase
      .from('partners')
      .select('id, name, slug, perk_text, perk_icon, brand_config')
      .in('id', partnerIds)
      .eq('is_active', true);

    const map: Record<string, {
      id: string;
      name: string;
      slug: string;
      perk_text: string | null;
      perk_icon: string | null;
      logo_url: string | null;
      primary_color: string | null;
    }> = {};

    for (const row of (data ?? []) as Array<{
      id: string;
      name: string;
      slug: string;
      perk_text: string | null;
      perk_icon: string | null;
      brand_config: Record<string, unknown> | null;
    }>) {
      const bc = (row.brand_config ?? {}) as Record<string, unknown>;
      const logo = (bc.logo ?? {}) as Record<string, unknown>;
      // Tolerate both brand_config logo shapes (REFERENCE.md §15): the
      // nested `logo.full` (current) and the legacy flat `logo_url`
      // some partners still carry. Without the flat fallback, those
      // Clubs render a LogoMark initials block on partner tiles even
      // though the Contest card below correctly resolves the same
      // legacy field via its own helper.
      const logoUrl =
        typeof logo.full === 'string' && logo.full.length > 0
          ? (logo.full as string)
          : typeof bc.logo_url === 'string' && (bc.logo_url as string).length > 0
            ? (bc.logo_url as string)
            : null;
      map[row.id] = {
        id:            row.id,
        name:          row.name,
        slug:          row.slug,
        perk_text:     row.perk_text,
        perk_icon:     row.perk_icon,
        logo_url:      logoUrl,
        primary_color: typeof bc.primary_color === 'string' ? bc.primary_color : null,
      };
    }
    set({partnersById: map});
  },

  partnerIndicators: {},

  loadPartnerIndicators: async (userId, partnerIds) => {
    if (partnerIds.length === 0) {
      set({partnerIndicators: {}});
      return;
    }

    // Parallel queries (notifications + read-state) — never per-Module.
    const [notifResult, readStateResult] = await Promise.all([
      supabase
        .from('partner_notifications')
        .select('partner_id, sent_at')
        .in('partner_id', partnerIds)
        .order('sent_at', {ascending: false}),
      supabase
        .from('partner_notification_read_state')
        .select('partner_id, last_read_at')
        .in('partner_id', partnerIds)
        .eq('user_id', userId),
    ]);

    const lastReadByPartner = new Map<string, string>();
    for (const row of (readStateResult.data ?? []) as Array<{
      partner_id: string;
      last_read_at: string;
    }>) {
      lastReadByPartner.set(row.partner_id, row.last_read_at);
    }

    const indicators: Record<string, {unread: number; mostRecentAt: string | null}> = {};
    for (const pid of partnerIds) {
      indicators[pid] = {unread: 0, mostRecentAt: null};
    }

    for (const row of (notifResult.data ?? []) as Array<{
      partner_id: string;
      sent_at: string;
    }>) {
      const cell = indicators[row.partner_id];
      if (!cell) continue;
      const lastRead = lastReadByPartner.get(row.partner_id);
      if (!lastRead || row.sent_at > lastRead) {
        cell.unread += 1;
      }
      if (!cell.mostRecentAt || row.sent_at > cell.mostRecentAt) {
        cell.mostRecentAt = row.sent_at;
      }
    }

    set({partnerIndicators: indicators});
  },

  markPartnerNotificationsRead: async (userId, partnerId) => {
    const now = new Date().toISOString();
    await supabase
      .from('partner_notification_read_state')
      .upsert(
        {user_id: userId, partner_id: partnerId, last_read_at: now},
        {onConflict: 'user_id,partner_id'},
      );
    set(state => ({
      partnerIndicators: {
        ...state.partnerIndicators,
        [partnerId]: {
          ...(state.partnerIndicators[partnerId] ?? {mostRecentAt: null}),
          unread: 0,
        },
      },
    }));
  },
});
