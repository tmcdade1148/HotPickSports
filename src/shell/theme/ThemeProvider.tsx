import React, {createContext, useMemo} from 'react';
import {
  colors as defaultColors,
  spacing,
  typography,
  borderRadius,
} from '@shared/theme';
import {HOTPICK_DEFAULT_BRAND} from './defaults';
import type {BrandConfig} from './defaults';

export interface ThemeContextValue {
  colors: typeof defaultColors;
  spacing: typeof spacing;
  typography: typeof typography;
  borderRadius: typeof borderRadius;
  brand: BrandConfig;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  brandOverride?: BrandConfig | null;
}

/**
 * ThemeProvider — wraps the entire app and provides theme values via context.
 *
 * For World Cup launch, brandOverride is always null (HotPick defaults).
 * When pool brand_config is populated in the future, pass it as brandOverride
 * and the entire UI responds automatically.
 */
export function ThemeProvider({children, brandOverride}: ThemeProviderProps) {
  const brand = brandOverride ?? HOTPICK_DEFAULT_BRAND;

  const colors = useMemo(() => {
    if (!brandOverride) {
      return defaultColors;
    }

    // Merge brand overrides into the default color tokens
    return {
      ...defaultColors,
      primary: brand.primary_color,
      secondary: brand.secondary_color,
      background: brand.background_color,
      surface: brand.surface_color,
      text: brand.text_primary,
      textSecondary: brand.text_secondary,
    };
  }, [brandOverride, brand]);

  const value = useMemo<ThemeContextValue>(
    () => ({colors, spacing, typography, borderRadius, brand}),
    [colors, brand],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
