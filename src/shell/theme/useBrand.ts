import {useContext} from 'react';
import {ThemeContext} from './ThemeProvider';
import type {BrandConfig} from './defaults';

/**
 * useBrand — access the current brand identity (app name, logo, welcome message).
 *
 * Returns HOTPICK_DEFAULT_BRAND when no pool brand_config is set.
 * When a pool has custom branding (premium tier), this returns those values.
 */
export function useBrand(): BrandConfig {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useBrand must be used within a <ThemeProvider>');
  }
  return ctx.brand;
}
