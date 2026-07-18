import {useColorScheme} from 'react-native';
import {
  HOTPICK_DEFAULTS,
  SEMANTIC_COLORS,
  SEMANTIC_COLORS_DARK,
  HOTPICK_EXTENDED_TOKENS,
  HOTPICK_EXTENDED_TOKENS_DARK,
  CHROME_ALPHA,
  deriveDarkColors,
} from './defaults';
import {hexToRgba} from '@shared/utils/color';
import type {ThemeColors, BrandIdentity} from './types';

/**
 * useTheme() — returns resolved theme colors for the app shell.
 *
 * **HotPick always.** Club brand colors NEVER drive the global shell
 * (Header, CTAs, bottom nav, Settings, any screen using this hook).
 * Club colors appear only on Official Club Contest cards — those read
 * their snapshot directly from `pool.brand_config`, not via this hook.
 *
 * Per product call 2026-05-26: prior behavior tied the global theme to
 * the active pool's brand, which made Club colors flicker in and out as
 * the user navigated. That model is retired. The global shell is HotPick
 * end-to-end; per-Club color appears only inside the Official Contest
 * card's branded header band.
 *
 * `activeBrandConfig` is still maintained on the store (writes from
 * setActivePoolId continue to update it) but is no longer read here —
 * intentionally kept so legacy callsites (PoweredByHotPick, branded join
 * flow) can opt in to brand details without going through theming.
 */
export function useTheme(): {colors: ThemeColors; isDark: boolean} {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const lightConfig = HOTPICK_DEFAULTS;
  const config = isDark ? deriveDarkColors(lightConfig) : lightConfig;
  const semantic = isDark ? SEMANTIC_COLORS_DARK : SEMANTIC_COLORS;
  const extended = isDark ? HOTPICK_EXTENDED_TOKENS_DARK : HOTPICK_EXTENDED_TOKENS;

  // HotPick light-blue accent (#A5CCD9) — consistent in light and dark.
  const highlight = config.highlight_color ?? '#A5CCD9';

  return {
    isDark,
    colors: {
      primary: config.primary_color,
      secondary: config.secondary_color,
      background: config.background_color,
      surface: config.surface_color,
      // Pre-composited so no call site does its own alpha math — that's how the
      // header ('E6' hex-suffix) and the nav (hexToRgba 0.85) drifted apart.
      chrome: hexToRgba(config.background_color, CHROME_ALPHA),
      highlight,
      textPrimary: config.text_primary,
      textSecondary: config.text_secondary,
      // Extended tokens (spec §6.3) — always HotPick-managed.
      surfaceElevated: extended.surface_elevated,
      accentTeal: extended.accent_teal,
      ink: extended.ink,
      textTertiary: extended.text_tertiary,
      live: extended.live,
      loss: extended.loss,
      win: extended.win,
      /** Foreground color for content sitting on `primary` (flame CTA). */
      onPrimary: '#FFFFFF',
      ...semantic,
    },
  };
}

/**
 * useBrand() — returns HotPick identity for the global shell.
 *
 * Like `useTheme()`, this hook used to swap to the active pool's Club
 * brand. It no longer does — the global shell (Header logos, app name,
 * tab nav) stays HotPick end-to-end (product call 2026-05-26). Screens
 * that need to render a specific Club's identity (e.g., PartnerRoster,
 * the Official Contest card's branded band) read the brand snapshot
 * directly from the pool or partner record instead.
 *
 * `isBranded` therefore always returns false here. The PoweredByHotPick
 * component, which gates on this flag, simply won't render via the
 * global hook — branded contexts that genuinely need the watermark pass
 * the brand in explicitly.
 */
export function useBrand(): BrandIdentity {
  const config = HOTPICK_DEFAULTS;

  return {
    partnerName: config.partner_name,
    poolLabel: config.pool_label,
    appName: config.app_name,
    logo: config.logo,
    inviteSlug: config.invite_slug,
    isBranded: false,
    poweredByHotpick: true,
  };
}
