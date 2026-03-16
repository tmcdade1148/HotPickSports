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
 * Derive surface + text colors from 3 partner inputs.
 *
 * Partners provide only primary, secondary, and background.
 * We auto-compute the rest so they can't create unreadable combos.
 */
export function deriveFullBrandColors(
  primary: string,
  secondary: string,
  background: string,
): {
  primary_color: string;
  secondary_color: string;
  background_color: string;
  surface_color: string;
  text_primary: string;
  text_secondary: string;
} {
  const isLightBg = isLightColor(background);

  return {
    primary_color: primary,
    secondary_color: secondary,
    background_color: background,
    surface_color: isLightBg
      ? darkenHex(background, 0.03) // slightly darker surface on light bg
      : lightenHex(background, 0.06), // slightly lighter surface on dark bg
    text_primary: isLightBg ? '#1A1A1A' : '#F5F5F5',
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
