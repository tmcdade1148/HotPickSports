/**
 * BrandConfig — the canonical brand configuration type.
 *
 * One definition. Never duplicated. Stored as JSONB on pools.brand_config.
 * NULL brand_config on a pool = use HOTPICK_DEFAULTS.
 * powered_by_hotpick is a literal `true` — cannot be set to false.
 */
export interface BrandConfig {
  partner_name: string;
  pool_label: string;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  surface_color: string;
  text_primary: string;
  text_secondary: string;
  logo: BrandLogoSet;
  app_name: string;
  invite_slug: string;
  is_branded: boolean;
  powered_by_hotpick: true;
}

/**
 * Logo variants for a brand (HotPick or partner).
 *
 * Not every partner will populate all five. Rendering logic:
 * use `full` as default, fall back to `mark` for small spaces.
 * Empty string = use bundled HotPick default for that variant.
 */
export interface BrandLogoSet {
  /** Full color logo — primary usage on light backgrounds */
  full: string;
  /** Graphic mark only, no text — app icon, small spaces, avatars */
  mark: string;
  /** Text-based horizontal lockup — headers, wide spaces */
  wordmark: string;
  /** Single-color version for dark backgrounds (white/light) */
  mono_light: string;
  /** Single-color version for light backgrounds (dark/black) */
  mono_dark: string;
}

/**
 * Sport-specific visual identity — lives on the event config.
 *
 * Separate from BrandConfig (who) — this is about what sport.
 * "HotPick Football" uses HotPick branding + football sport identity.
 * "Mes Que Football" uses Mes Que branding + football sport identity.
 */
export interface SportIdentity {
  /** Sport-qualified display name: "HotPick Football", "HotPick Hockey" */
  displayName: string;
  /** Sport-specific icon/graphic mark (football, puck, soccer ball) */
  sportMark: string;
  /** Sport-qualified text lockup: "HotPick Football" wordmark */
  sportWordmark: string;
  /** Optional sport-specific accent color (overrides event.color when set) */
  accentColor?: string;
}

/**
 * Theme colors derived from BrandConfig + app-level semantic colors.
 * useTheme() returns this. Components never read hex values directly.
 */
export interface ThemeColors {
  // Brand colors (from BrandConfig or defaults)
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;

  // Semantic colors (always HotPick — never overridden by partners)
  success: string;
  warning: string;
  error: string;
  border: string;
}

/**
 * Brand identity returned by useBrand().
 * Components use this for logos, names, and branded copy.
 */
export interface BrandIdentity {
  partnerName: string;
  poolLabel: string;
  appName: string;
  logo: BrandLogoSet;
  inviteSlug: string;
  isBranded: boolean;
  poweredByHotpick: true;
}
