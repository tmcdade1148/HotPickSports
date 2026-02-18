export const colors = {
  primary: '#FF6B35',
  secondary: '#004E89',
  success: '#06D6A0',
  warning: '#FFD166',
  error: '#EF476F',

  background: '#FFFFFF',
  surface: '#F7F7F7',
  text: '#1A1A1A',
  textSecondary: '#6B6B6B',
  border: '#E0E0E0',

  backgroundDark: '#1A1A1A',
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

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 16,
  full: 9999,
};
