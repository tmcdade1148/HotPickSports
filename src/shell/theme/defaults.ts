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
 * Brand primary/secondary stay the same; backgrounds and text flip.
 *
 * Updated 2026-05-13 per spec §6.3 to match `colors_and_type.css` dark theme:
 *   --bg-1  #141414   (was #181818)
 *   --bg-2  #1A1A1A   (was #262626)
 *   --fg-1  #FFFFFF   (was #8A97AA — that was an a11y bug)
 *   --fg-2  #B8B8B8   (was #A0A0A0)
 */
export const HOTPICK_DARK_OVERRIDES = {
  background_color: '#141414',
  surface_color: '#1A1A1A',
  text_primary: '#FFFFFF',
  text_secondary: '#B8B8B8',
} as const;

/**
 * Extended tokens — HotPick-managed structural and accent values that
 * augment the brand colors. Spec §6.3 adds these to the redesign system.
 * Partners never override these; they're consistent across all pools.
 *
 * | Token            | Light    | Dark     | Usage                                |
 * |------------------|----------|----------|--------------------------------------|
 * | surface_elevated | #F4F4F4  | #242424  | Pool modules, partner modules, hero  |
 * | accent_teal      | #45615E  | #45615E  | Pool-as-aligned visual connection    |
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
  accent_teal: '#45615E',
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
  const derivedHighlight = highlight || (isLightBg ? '#181818' : '#FFFFFF');

  return {
    primary_color: primary,
    secondary_color: secondary,
    background_color: background,
    surface_color: isLightBg
      ? darkenHex(background, 0.03) // slightly darker surface on light bg
      : lightenHex(background, 0.06), // slightly lighter surface on dark bg
    highlight_color: derivedHighlight,
    text_primary: isLightBg ? '#181818' : '#F5F5F5',
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
  glow: '#51A1A6',
  // Brand accents for secondary CTAs. HotPick teal + amber that read
  // on both light and dark surfaces without per-mode tweaks.
  ctaAccentOutline: '#45615E',
  ctaAccentText:    '#E39032',
} as const;

/**
 * Semantic colors for dark mode.
 */
export const SEMANTIC_COLORS_DARK = {
  success: '#1DC24C',
  warning: '#FFD166',
  error: '#C21D1D',
  border: '#2C3A52',
  glow: '#51A1A6',
  // Brand accents for secondary CTAs. Same hues in dark mode — both
  // colors clear WCAG 3:1 against dark surfaceElevated.
  ctaAccentOutline: '#45615E',
  ctaAccentText:    '#E39032',
} as const;
