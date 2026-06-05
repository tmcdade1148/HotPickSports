// Shared types + config constants for the Partner Admin surface.
// Extracted from PartnerAdminScreen verbatim — no behavioural change.

// DB column is plain text — the union narrows it app-side.
export type PartnerType = 'hospitality' | 'operator' | 'media' | 'brand' | 'other';

export const PARTNER_TYPES: PartnerType[] = ['hospitality', 'operator', 'media', 'brand', 'other'];

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  hospitality: 'Hospitality',
  operator: 'Operator',
  media: 'Media',
  brand: 'Brand',
  other: 'Other',
};

export const DEFAULT_CAN_RUN_POOLS_BY_TYPE: Record<PartnerType, boolean> = {
  hospitality: false,
  operator: true,
  media: false,
  brand: false,
  other: false,
};

export interface Partner {
  id: string;
  name: string;
  slug: string;
  brand_config: unknown;
  created_at: string;
  // Participation-perk fields added by migration 260513_partner_perks.
  // perk_text is the customer-facing perk copy (max 120 chars, partner-managed).
  // perk_icon is an emoji or lucide name; renders as a small icon on PartnerModule.
  perk_text: string | null;
  perk_icon: string | null;
  perk_updated_at: string | null;
  // When true, the partner can be selected as the presenting partner of new
  // pools and partner-staff can join pools in the partner role. When false
  // (default), the partner is sponsor-only — brand surfaces via perk /
  // broadcasts / roster, but cannot run pools. Migration 260515.
  can_run_pools: boolean;
  // The partner's own Club Pool (NULL = none yet). Authoritative source for
  // "does this partner have a Club Pool?" — never infer it from pools.partner_id,
  // which is the roster-affiliation edge (many roster members share it).
  club_pool_id: string | null;
  // Stored as text in the DB; the app constrains to the PartnerType union.
  partner_type: PartnerType | null;
  // 8-char alphanumeric. Distinct from pools.invite_code; shared with
  // Gaffers to authorize affiliating their Contest with this Club's
  // roster (see 260527_partners_roster_pass migration).
  roster_pass: string;
}

/** Partners set 4 colors — the rest are auto-derived */
export const COLOR_FIELDS: {
  key: 'primary_color' | 'secondary_color' | 'background_color' | 'highlight_color';
  label: string;
  hint: string;
}[] = [
  {key: 'primary_color', label: 'Primary', hint: 'Buttons, headers'},
  {key: 'secondary_color', label: 'Secondary', hint: 'Accents'},
  {key: 'background_color', label: 'Background', hint: 'Page base'},
  {key: 'highlight_color', label: 'Highlight', hint: 'Light color for dark bg'},
];
