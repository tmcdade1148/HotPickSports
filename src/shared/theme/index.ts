/**
 * HotPick Sports design system.
 * Brand colors, spacing, typography, and component-level tokens.
 */

export const colors = {
  // Brand
  primary: '#FF6B00', // HotPick orange
  primaryDark: '#E05E00',
  primaryLight: '#FF8A33',

  // Backgrounds
  background: '#0D1117', // dark mode default
  surface: '#161B22',
  surfaceElevated: '#1C2128',
  card: '#21262D',

  // Text
  textPrimary: '#F0F6FC',
  textSecondary: '#8B949E',
  textMuted: '#484F58',
  textInverse: '#0D1117',

  // Semantic
  success: '#3FB950',
  error: '#F85149',
  warning: '#D29922',
  info: '#58A6FF',

  // Borders
  border: '#30363D',
  borderLight: '#21262D',

  // Sport accents (override primary in sport contexts)
  sportAccent: {
    soccer: '#1B5E20',
    nfl: '#013369',
  } as Record<string, string>,

  // Pick states
  pickCorrect: '#3FB950',
  pickIncorrect: '#F85149',
  pickPending: '#FF6B00',
  pickLocked: '#8B949E',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const typography = {
  // Font families — will swap to custom fonts later
  fontFamily: {
    regular: undefined, // uses system default
    medium: undefined,
    bold: undefined,
  },

  // Sizes
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 28,
    title: 34,
  } as const,

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  } as const,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};

export const theme = {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
} as const;

export type Theme = typeof theme;
export default theme;
