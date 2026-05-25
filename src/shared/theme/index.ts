import {Platform} from 'react-native';

export const colors = {
  primary: '#FF6B35',
  secondary: '#004E89',
  success: '#1DC24C',
  warning: '#FFD166',
  error: '#C21D1D',

  background: '#FFFFFF',
  surface: '#F7F7F7',
  text: '#181818',
  textSecondary: '#6B6B6B',
  border: '#E0E0E0',

  backgroundDark: '#181818',
  surfaceDark: '#2A2A2A',
  textDark: '#F7F7F7',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const typography = {
  h1: {fontSize: 32, fontWeight: '700' as const},
  h2: {fontSize: 24, fontWeight: '600' as const},
  h3: {fontSize: 20, fontWeight: '600' as const},
  body: {fontSize: 16, fontWeight: '400' as const},
  caption: {fontSize: 14, fontWeight: '400' as const},
  small: {fontSize: 12, fontWeight: '400' as const},
};

/**
 * Home-redesign display typography (spec §6.3).
 *
 * Saira Condensed Italic Black for hero numerics + player names.
 * Sizes mirror `colors_and_type.css`. Faux italic on upright 900Black
 * until a true italic TTF is added to assets/fonts/.
 */
// Home redesign-v3: swapped Saira Condensed for platform system fonts to
// eliminate the iOS/Android render divergence. iOS gets San Francisco at
// default width ("System"); Android gets Roboto at default width
// ("sans-serif"). Both ship real italics at weight 800 so we no longer
// rely on faux-italic and the widths now match across platforms.
export const displayType = {
  display: {
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
      default: 'System',
    }),
    fontStyle: 'italic' as const,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  // Common sizes per the design system: 12 / 20 / 24 / 32 / 40 / 56 / 72 / 108 / 128
  size: {
    eyebrow: 12,
    h4: 20,
    h3: 24,
    h2: 32,
    h1: 40,
    display1: 56,
    display2: 72,
    display3: 108,
    display4: 128,
  },
} as const;

/**
 * Body text — Manrope. Used everywhere display isn't.
 */
export const bodyType = {
  regular: {fontFamily: 'Manrope-Regular', fontWeight: '400' as const},
  bold: {fontFamily: 'Manrope-Bold', fontWeight: '700' as const},
} as const;

/**
 * Mono — system monospace. Scores, deltas, countdown digits, timestamps.
 * No fontFamily set so RN picks SF Mono / Roboto Mono per platform.
 */
export const monoType = {
  regular: {
    // Mutable array so RN's TextStyle overloads match. Use `as` cast for
    // the element literal type without freezing the outer array.
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 16,
  full: 9999,
};
