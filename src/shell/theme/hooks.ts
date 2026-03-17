import {useColorScheme} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {
  HOTPICK_DEFAULTS,
  SEMANTIC_COLORS,
  SEMANTIC_COLORS_DARK,
  deriveDarkColors,
} from './defaults';
import type {ThemeColors, BrandIdentity} from './types';

/**
 * useTheme() — returns resolved theme colors for the active pool.
 *
 * Reads activeBrandConfig from the global Zustand store.
 * If null: returns HotPick default colors.
 * If populated: returns partner colors + HotPick semantic colors.
 *
 * Automatically derives dark mode: brand primary/secondary stay the
 * same (brand recognition), backgrounds and text flip to dark surfaces.
 * Partners don't manage dark mode — we handle it.
 */
export function useTheme(): {colors: ThemeColors; isDark: boolean} {
  const brandConfig = useGlobalStore(s => s.activeBrandConfig);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const lightConfig = brandConfig ?? HOTPICK_DEFAULTS;
  const config = isDark ? deriveDarkColors(lightConfig) : lightConfig;
  const semantic = isDark ? SEMANTIC_COLORS_DARK : SEMANTIC_COLORS;

  return {
    isDark,
    colors: {
      primary: config.primary_color,
      secondary: config.secondary_color,
      background: config.background_color,
      surface: config.surface_color,
      highlight: config.highlight_color ?? '#FFFFFF',
      textPrimary: config.text_primary,
      textSecondary: config.text_secondary,
      ...semantic,
    },
  };
}

/**
 * useBrand() — returns brand identity for the active pool.
 *
 * Reads activeBrandConfig from the global Zustand store.
 * If null: returns HotPick default identity.
 * If populated: returns partner identity.
 *
 * Components use this for logos, app names, and branded copy.
 */
export function useBrand(): BrandIdentity {
  const brandConfig = useGlobalStore(s => s.activeBrandConfig);
  const config = brandConfig ?? HOTPICK_DEFAULTS;

  return {
    partnerName: config.partner_name,
    poolLabel: config.pool_label,
    appName: config.app_name,
    logo: config.logo,
    inviteSlug: config.invite_slug,
    isBranded: config.is_branded,
    poweredByHotpick: true,
  };
}
