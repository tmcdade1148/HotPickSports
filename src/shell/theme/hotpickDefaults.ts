// src/shell/theme/hotpickDefaults.ts
// THE canonical source of truth for HotPick brand colors.
// All theme tokens derive from these values.
// Do not hardcode these hex strings anywhere else in the codebase.
// The ONE permitted exception is SplashScreen.tsx container background.
// See CLAUDE.md Hard Rule #9 and §16 — Splash Screen Color Exception.
//
// Updated 2026-05-13 per spec §6.3 (260513_HotPick_HomeRedesign_Spec.docx)
// to match the colors_and_type.css design system. Token names are stable;
// `secondary` changes value (#45615E teal → #E39032 amber). The previous
// teal value is preserved as the new `accent_teal` token so components
// that genuinely need teal can still reach it via useTheme().accentTeal.
//
// Brand vs Extended tokens:
//   • HOTPICK_BRAND_COLORS (this file) — the 4 partner-overridable values.
//     Partners can rebrand these via brand_config.
//   • HOTPICK_EXTENDED_TOKENS (defaults.ts) — semantic and structural
//     tokens that are always HotPick-managed. Never overridden by partners.

import type {BrandConfig, BrandLogoSet} from './types';

/**
 * HotPick Sports locked brand color tokens.
 *
 * | Token      | Hex       | Usage                                          |
 * |------------|-----------|------------------------------------------------|
 * | primary    | #F66321   | Flame. CTAs, active buttons, highlights.       |
 * | secondary  | #E39032   | Amber. Secondary accents. (was #45615E teal)   |
 * | highlight  | #34A4D1   | Light-mode highlight (blue). Dark mode is gold.|
 * | background | #FCFCFC   | App bg (LIGHT mode). Dark mode value lives     |
 * |            |           | in HOTPICK_DARK_OVERRIDES (defaults.ts).       |
 */
export const HOTPICK_BRAND_COLORS = {
  primary: '#F66321',
  secondary: '#E39032',
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
 * Used when a pool has no brand_config (NULL) — every non-partner pool.
 * Partner pools have their own brand_config persisted as JSONB on pools;
 * `useTheme()` merges that on top of these defaults at render time.
 *
 * Light-mode values. Dark mode is auto-derived in defaults.ts:deriveDarkColors.
 */
export const HOTPICK_BRAND: BrandConfig = {
  partner_name: '',
  pool_label: 'HotPick',
  primary_color: HOTPICK_BRAND_COLORS.primary,
  secondary_color: HOTPICK_BRAND_COLORS.secondary,
  highlight_color: HOTPICK_BRAND_COLORS.highlight,
  background_color: HOTPICK_BRAND_COLORS.background,
  surface_color: '#EBEBEB',  // visible contrast against #FCFCFC background
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
