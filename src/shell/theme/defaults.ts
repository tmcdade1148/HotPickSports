/**
 * Brand configuration interface and HotPick default values.
 *
 * BrandConfig defines the identity layer: colors, logo, app name.
 * When a pool has brand_config set (JSONB on pools table), those values
 * override the defaults. NULL brand_config = HotPick defaults.
 */

export interface BrandConfig {
  primary_color: string;
  secondary_color: string;
  background_color: string;
  surface_color: string;
  text_primary: string;
  text_secondary: string;
  logo_url: string;
  app_name: string;
  powered_by_hotpick: boolean;
  welcome_message?: string;
}

export const HOTPICK_DEFAULT_BRAND: BrandConfig = {
  primary_color: '#FF6B35',
  secondary_color: '#004E89',
  background_color: '#FFFFFF',
  surface_color: '#F7F7F7',
  text_primary: '#1A1A1A',
  text_secondary: '#6B6B6B',
  logo_url: '',
  app_name: 'HotPick Sports',
  powered_by_hotpick: false,
  welcome_message: 'Make your picks. Win bragging rights.',
};
