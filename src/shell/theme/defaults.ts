/**
 * Theme defaults and color derivation functions.
 *
 * Brand values come from hotpickDefaults.ts — the canonical source.
 * This file re-exports those values and provides color derivation
 * utilities for dark mode and partner brand config.
 */
import type {BrandConfig} from './types';

// Re-export canonical brand values from hotpickDefaults
export {
  HOTPICK_BRAND as HOTPICK_DEFAULTS,
  HOTPICK_BRAND,
  HOTPICK_BRAND_COLORS,
  HOTPICK_LOGOS,
} from './hotpickDefaults';

/**
 * HotPick dark mode overrides.
 *
 * Partners don't manage dark mode — we auto-derive it.
 * Brand primary/secondary stay the same; backgrounds, text, and highlight flip.
 *
 * Updated 2026-05-13 per spec §6.3 to match `colors_and_type.css` dark theme:
 *   --bg-1  #141414   (was #181818)
 *   --bg-2  #1A1A1A   (was #262626)
 *   --fg-1  #FFFFFF   (was #8A97AA — that was an a11y bug)
 *   --fg-2  #B8B8B8   (was #A0A0A0)
 * Updated 2026-07-17: highlight_color added — it splits per mode.
 */
export const HOTPICK_DARK_OVERRIDES = {
  background_color: '#141414',
  surface_color: '#1A1A1A',
  text_primary: '#FFFFFF',
  text_secondary: '#B8B8B8',
  // highlight splits per mode: teal #45615E (light, in HOTPICK_BRAND_COLORS)
  // reads on light bg; light-blue #A5CCD9 reads on dark (10.7:1 on #141414).
  // deriveDarkColors carries this so useTheme() AND SettingsScreen's resolver
  // both get it — a hooks-only fix would leave Settings on the light value.
  highlight_color: '#A5CCD9',
} as const;

/**
 * CHROME_ALPHA — the ONE transparency value for app chrome.
 *
 * Every floating/translucent chrome surface (Home's header overlay, the nav
 * bar, PoolHeader, PicksHeader) reads the derived `colors.chrome` token, which
 * is `hexToRgba(background, CHROME_ALPHA)` resolved per mode in useTheme().
 * Tune this number here and every surface moves together — there is deliberately
 * no call-site arithmetic, because two equal literals drift and one source can't.
 */
export const CHROME_ALPHA = 0.85;

/**
 * Extended tokens — HotPick-managed structural and accent values that
 * augment the brand colors. Spec §6.3 adds these to the redesign system.
 * Partners never override these; they're consistent across all pools.
 *
 * | Token            | Light    | Dark     | Usage                                |
 * |------------------|----------|----------|--------------------------------------|
 * | surface_elevated | #F4F4F4  | #242424  | Pool modules, partner modules, hero  |
 * | accent_teal      | #45615E  | #A5CCD9  | Pool-aligned accent (AA per mode)    |
 * | ink              | #303030  | #303030  | Deep ink for type on light surfaces  |
 * | text_tertiary    | #8A8A8A  | #7A7A7A  | Captions, muted labels, placeholders |
 *
 * `accent_teal` preserves the prior `secondary` value before secondary was
 * reassigned to amber (#E39032) per the new design system.
 */
export const HOTPICK_EXTENDED_TOKENS = {
  surface_elevated: '#F4F4F4',
  accent_teal: '#45615E',
  ink: '#303030',
  text_tertiary: '#8A8A8A',
  live: '#22C55E',
  loss: '#DC2626',
  win: '#22C55E',
} as const;

export const HOTPICK_EXTENDED_TOKENS_DARK = {
  surface_elevated: '#242424',
  accent_teal: '#A5CCD9', // light-blue on dark (was #45615E — 2.6:1 as text, a bug). 9.05:1 on #242424.
  ink: '#303030',
  text_tertiary: '#7A7A7A',
  live: '#22C55E',
  loss: '#DC2626',
  win: '#22C55E',
} as const;

/**
 * Derive dark mode colors from any BrandConfig.
 *
 * Partners provide light-mode brand colors. Dark mode keeps their
 * primary/secondary intact (brand recognition) but swaps backgrounds,
 * text, and highlight for dark surfaces.
 *
 * Only these fields are overridden; every other field spreads from the
 * light config unchanged. That spread-inherit is the theme's bug class —
 * a token with no explicit dark value silently renders its light value in
 * dark mode.
 */
export function deriveDarkColors(config: BrandConfig): BrandConfig {
  return {
    ...config,
    background_color: HOTPICK_DARK_OVERRIDES.background_color,
    surface_color: HOTPICK_DARK_OVERRIDES.surface_color,
    text_primary: HOTPICK_DARK_OVERRIDES.text_primary,
    text_secondary: HOTPICK_DARK_OVERRIDES.text_secondary,
    highlight_color: HOTPICK_DARK_OVERRIDES.highlight_color,
  };
}

/**
 * Derive surface + text colors from 3 partner inputs.
 *
 * Partners provide only primary, secondary, and background.
 * We auto-compute the rest so they can't create unreadable combos.
 */
export function deriveFullBrandColors(
  primary: string,
  secondary: string,
  background: string,
  highlight?: string,
): {
  primary_color: string;
  secondary_color: string;
  background_color: string;
  surface_color: string;
  highlight_color: string;
  text_primary: string;
  text_secondary: string;
} {
  const isLightBg = isLightColor(background);

  // Auto-derive highlight if not provided: white on dark bg, dark on light bg
  const derivedHighlight = highlight || (isLightBg ? '#303030' : '#FFFFFF');

  return {
    primary_color: primary,
    secondary_color: secondary,
    background_color: background,
    surface_color: isLightBg
      ? darkenHex(background, 0.03) // slightly darker surface on light bg
      : lightenHex(background, 0.06), // slightly lighter surface on dark bg
    highlight_color: derivedHighlight,
    text_primary: isLightBg ? '#303030' : '#F5F5F5',
    text_secondary: isLightBg ? '#6B6B6B' : '#A0A0A0',
  };
}

/**
 * Check if a hex color is "light" (luminance > 0.5).
 */
export function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  // Relative luminance (simplified)
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.5;
}

function darkenHex(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = Math.max(0, Math.round(parseInt(c.substring(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(c.substring(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(c.substring(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

function lightenHex(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = Math.min(255, Math.round(parseInt(c.substring(0, 2), 16) + (255 - parseInt(c.substring(0, 2), 16)) * amount));
  const g = Math.min(255, Math.round(parseInt(c.substring(2, 4), 16) + (255 - parseInt(c.substring(2, 4), 16)) * amount));
  const b = Math.min(255, Math.round(parseInt(c.substring(4, 6), 16) + (255 - parseInt(c.substring(4, 6), 16)) * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * Semantic colors that are always HotPick-owned.
 * Partners cannot override these — they ensure UI consistency
 * for success/error/warning states across all branded experiences.
 */
export const SEMANTIC_COLORS = {
  success: '#1DC24C',
  warning: '#FFD166',
  error: '#C21D1D',
  border: '#E0E0E0',
  // Brand accents for secondary CTAs (Join / Create Contest on Home). Split
  // per mode for AA — see the _DARK twin. LIGHT: both are teal #45615E
  // (6.6:1 on #FCFCFC). DARK: outline → light-blue #A5CCD9, text → amber
  // #E39032. Measured 2026-07-17.
  ctaAccentOutline: '#45615E',
  ctaAccentText:    '#45615E',
} as const;

/**
 * Semantic colors for dark mode.
 */
export const SEMANTIC_COLORS_DARK = {
  success: '#1DC24C',
  warning: '#FFD166',
  // Light #C21D1D fails on dark (~2.9:1). #F1655A clears AA 4.5:1 on all three
  // dark surfaces: 5.9:1 (#141414) / 5.6:1 (#1A1A1A) / 5.0:1 (#242424).
  error: '#F1655A',
  border: '#2C3A52',
  // Brand accents for secondary CTAs, dark mode. outline → light-blue #A5CCD9
  // (9.05:1 on surfaceElevated #242424 — the prior #45615E was 2.3:1, not the
  // 3:1 the old comment claimed). text → amber #E39032 (6.1:1 on #242424).
  // Measured 2026-07-17.
  ctaAccentOutline: '#A5CCD9',
  ctaAccentText:    '#E39032',
} as const;
