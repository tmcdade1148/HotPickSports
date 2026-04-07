// src/shell/theme/hotpickDefaults.ts
// THE canonical source of truth for HotPick brand colors.
// All theme tokens derive from these values.
// Do not hardcode these hex strings anywhere else in the codebase.
// The ONE permitted exception is SplashScreen.tsx container background.
// See CLAUDE.md Section 16 — Splash Screen Color Exception.

import type {BrandConfig, BrandLogoSet} from './types';

/**
 * HotPick Sports locked brand color tokens.
 * These are the only 4 settable brand colors. All other colors
 * (surface, text) are auto-derived from background.
 *
 * | Token      | Hex       | Usage                                          |
 * |------------|-----------|------------------------------------------------|
 * | primary    | #F66321   | CTAs, active buttons, highlights               |
 * | secondary  | #45615E   | Accents, inactive states                       |
 * | highlight  | #34A4D1   | Accent color — blue in light mode, gold (#E39032) in dark mode |
 * | background | #FCFCFC   | App bg, splash bg, adaptive icon bg            |
 */
export const HOTPICK_BRAND_COLORS = {
  primary: '#F66321',
  secondary: '#45615E',
  highlight: '#34A4D1',
  background: '#FCFCFC',
} as const;

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
export const HOTPICK_BRAND: BrandConfig = {
  partner_name: '',
  pool_label: 'HotPick',
  primary_color: HOTPICK_BRAND_COLORS.primary,
  secondary_color: HOTPICK_BRAND_COLORS.secondary,
  highlight_color: HOTPICK_BRAND_COLORS.highlight,
  background_color: HOTPICK_BRAND_COLORS.background,
  surface_color: '#F4F4F4',  // auto-derived: slightly darker than #FCFCFC
  text_primary: '#181818',   // dark text on light background
  text_secondary: '#6B6B6B', // muted dark text
  logo: HOTPICK_LOGOS,
  app_name: 'HotPick',
  invite_slug: '',
  is_branded: false,
  powered_by_hotpick: true,
};

/**
 * @deprecated Use HOTPICK_BRAND instead. Alias for backwards compatibility.
 */
export const HOTPICK_DEFAULTS = HOTPICK_BRAND;
