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
  background_color: '#0D1117',
  surface_color: '#161C26',
  text_primary: '#8A97AA',
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
  const darkBg = HOTPICK_DARK_OVERRIDES.background_color;

  // For partner pools, ensure brand colors have enough contrast against dark bg.
  // If a partner color is too dark to read on #0D1117, lighten it.
  const primary = ensureContrast(config.primary_color, darkBg);
  const secondary = ensureContrast(config.secondary_color, darkBg);
  const highlight = config.highlight_color
    ? ensureContrast(config.highlight_color, darkBg)
    : HOTPICK_DARK_OVERRIDES.text_primary;

  return {
    ...config,
    primary_color: primary,
    secondary_color: secondary,
    highlight_color: highlight,
    background_color: darkBg,
    surface_color: HOTPICK_DARK_OVERRIDES.surface_color,
    text_primary: HOTPICK_DARK_OVERRIDES.text_primary,
    text_secondary: HOTPICK_DARK_OVERRIDES.text_secondary,
  };
}

/**
 * Ensure a color has sufficient contrast against a background.
 * If contrast ratio is below 3:1, progressively lighten until readable.
 */
function ensureContrast(color: string, background: string): string {
  let current = color;
  for (let i = 0; i < 5; i++) {
    if (contrastRatio(current, background) >= 3.0) return current;
    current = lightenHex(current, 0.2);
  }
  return current;
}

/**
 * WCAG contrast ratio between two hex colors.
 */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '');
  const srgb = [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ];
  const [r, g, b] = srgb.map(v =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
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
  const derivedHighlight = highlight || (isLightBg ? '#1A1A1A' : '#FFFFFF');

  return {
    primary_color: primary,
    secondary_color: secondary,
    background_color: background,
    surface_color: isLightBg
      ? darkenHex(background, 0.03) // slightly darker surface on light bg
      : lightenHex(background, 0.06), // slightly lighter surface on dark bg
    highlight_color: derivedHighlight,
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
  glow: '#51A1A6',
} as const;

/**
 * Semantic colors for dark mode.
 */
export const SEMANTIC_COLORS_DARK = {
  success: '#06D6A0',
  warning: '#FFD166',
  error: '#EF476F',
  border: '#2C3A52',
  glow: '#51A1A6',
} as const;
