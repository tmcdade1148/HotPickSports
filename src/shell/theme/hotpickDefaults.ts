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
// Updated 2026-07-17 (dark-mode a11y pass). Five tokens were silently
// inheriting their light value into dark — the resolver spread-inherits, so
// a missing dark override means "same as light" (see defaults.ts:deriveDarkColors).
// `highlight` now splits per mode: teal #45615E (light) / light-blue #A5CCD9
// (dark) — one role, two values, so it clears AA on each background.
// accentTeal, ctaAccentOutline, ctaAccentText and error got their missing
// per-mode overrides; the unused `glow` token was removed.
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
 * | primary    | #F66321   | Flame orange. CTAs, active buttons, highlights.|
 * | secondary  | #E39032   | Amber accent. (was #45615E teal)               |
 * | highlight  | #45615E   | Teal in LIGHT mode. Dark = #A5CCD9 (light-blue)|
 * |            |           | via HOTPICK_DARK_OVERRIDES — one role split per |
 * |            |           | mode so it clears AA on each background.        |
 * | background | #FCFCFC   | App bg (LIGHT mode). Dark mode value lives     |
 * |            |           | in HOTPICK_DARK_OVERRIDES (defaults.ts).       |
 *
 * Official HotPick Sports palette (2026-06): black #303030, orange #F66321,
 * teal #45615E, plus two accents — amber #E39032 and light-blue #A5CCD9.
 */
export const HOTPICK_BRAND_COLORS = {
  primary: '#F66321',
  secondary: '#E39032',
  highlight: '#45615E', // LIGHT-mode value (teal). Dark = #A5CCD9 via HOTPICK_DARK_OVERRIDES.
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
  text_primary: '#303030',   // official black — dark text on light background
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
