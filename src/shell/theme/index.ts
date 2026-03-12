/**
 * Theme system barrel export.
 *
 * All theme/brand access goes through here. Sport modules and shell
 * screens import from '@shell/theme' — never from shared/theme directly.
 */
export {useTheme, useBrand} from './hooks';
export {HOTPICK_DEFAULTS, HOTPICK_LOGOS, SEMANTIC_COLORS, deriveDarkColors, deriveFullBrandColors} from './defaults';
export type {
  BrandConfig,
  BrandLogoSet,
  SportIdentity,
  ThemeColors,
  BrandIdentity,
} from './types';
