import type {BrandConfig, BrandLogoSet} from './types';

/**
 * HotPick Sports default logo set.
 *
 * Empty strings = use bundled assets (resolved at render time).
 * When HotPick logo assets are added to the project, update these
 * to reference the CDN URLs or bundled require() paths.
 */
export const HOTPICK_LOGOS: BrandLogoSet = {
  full: '',
  mark: '',
  wordmark: '',
  mono_light: '',
  mono_dark: '',
};

/**
 * HotPick Sports default brand configuration.
 *
 * Used when a pool has no brand_config (NULL) — i.e. every
 * non-partner pool. This is the canonical source of HotPick
 * brand values. Never hardcode these elsewhere.
 */
export const HOTPICK_DEFAULTS: BrandConfig = {
  partner_name: 'HotPick Sports',
  pool_label: 'HotPick',
  primary_color: '#FF6B35',
  secondary_color: '#004E89',
  background_color: '#FFFFFF',
  surface_color: '#F7F7F7',
  text_primary: '#1A1A1A',
  text_secondary: '#6B6B6B',
  logo: HOTPICK_LOGOS,
  app_name: 'HotPick',
  invite_slug: '',
  is_branded: false,
  powered_by_hotpick: true,
};

/**
 * HotPick dark mode overrides.
 *
 * Partners don't manage dark mode — we auto-derive it.
 * Brand primary/secondary stay the same; backgrounds and text flip.
 */
export const HOTPICK_DARK_OVERRIDES = {
  background_color: '#121212',
  surface_color: '#1E1E1E',
  text_primary: '#F5F5F5',
  text_secondary: '#A0A0A0',
} as const;

/**
 * Derive dark mode colors from any BrandConfig.
 *
 * Partners provide light-mode brand colors. Dark mode keeps their
 * primary/secondary intact (brand recognition) but swaps backgrounds
 * and text for dark surfaces.
 */
export function deriveDarkColors(config: BrandConfig): BrandConfig {
  return {
    ...config,
    background_color: HOTPICK_DARK_OVERRIDES.background_color,
    surface_color: HOTPICK_DARK_OVERRIDES.surface_color,
    text_primary: HOTPICK_DARK_OVERRIDES.text_primary,
    text_secondary: HOTPICK_DARK_OVERRIDES.text_secondary,
  };
}

/**
 * Semantic colors that are always HotPick-owned.
 * Partners cannot override these — they ensure UI consistency
 * for success/error/warning states across all branded experiences.
 */
export const SEMANTIC_COLORS = {
  success: '#06D6A0',
  warning: '#FFD166',
  error: '#EF476F',
  border: '#E0E0E0',
} as const;

/**
 * Semantic colors for dark mode.
 */
export const SEMANTIC_COLORS_DARK = {
  success: '#06D6A0',
  warning: '#FFD166',
  error: '#EF476F',
  border: '#333333',
} as const;
