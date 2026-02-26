import {useContext} from 'react';
import {ThemeContext} from './ThemeProvider';
import type {ThemeContextValue} from './ThemeProvider';

/**
 * useTheme — access the current theme (colors, spacing, typography, borderRadius).
 *
 * Must be used inside <ThemeProvider>. Every component that renders colors
 * should call this hook instead of importing from @shared/theme directly.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
}
