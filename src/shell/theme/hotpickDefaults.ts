// src/shell/theme/hotpickDefaults.ts
// THE canonical source of truth for HotPick brand colors.
// All theme tokens derive from these values.
// Do not hardcode these hex strings anywhere else in the codebase.
// The ONE permitted exception is SplashScreen.tsx container background.
// See CLAUDE.md Section 16 — Splash Screen Color Exception.

import type {BrandConfig, BrandLogoSet} from './types';

/**
 * HotPick Sports locked brand color tokens.
 * These four values are the source of truth for all theming.
 *
 * | Token      | Hex       | Usage                                          |
 * |------------|-----------|------------------------------------------------|
 * | background | #111414   | App bg, splash bg, adaptive icon bg            |
 * | surface    | #474747   | Cards, rows, pick cards, SmackTalk bubbles     |
 * | secondary  | #F28B30   | Soft amber — secondary accents, inactive states|
 * | primary    | #FF8B3D   | Hot orange — CTAs, active buttons, highlights  |
 * | glow       | #51A1A6   | Glow around active/highlighted elements        |
 */
export const HOTPICK_BRAND_COLORS = {
  background: '#111414',
  surface: '#474747',
  secondary: '#F28B30',
  primary: '#FF8B3D',
  glow: '#51A1A6',
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
  background_color: HOTPICK_BRAND_COLORS.background,
  surface_color: HOTPICK_BRAND_COLORS.surface,
  text_primary: '#FFFFFF',
  text_secondary: 'rgba(255,255,255,0.65)',
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
