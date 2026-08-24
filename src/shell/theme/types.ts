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
  highlight_color: string;
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
  /** Translucent chrome fill — background at CHROME_ALPHA, pre-composited.
   *  The single source for Home's header overlay, the nav bar, PoolHeader and
   *  PicksHeader, so their transparency can never drift apart. */
  chrome: string;
  highlight: string;
  textPrimary: string;
  textSecondary: string;

  // Extended HotPick tokens — added 2026-05-13 per Home Redesign spec §6.3.
  // Never partner-overridable; always HotPick-managed.
  surfaceElevated: string;  // Pool modules, partner modules, hero blocks
  accentTeal: string;       // Pool-as-aligned visual connection accent
  ink: string;              // Deep ink for high-contrast type
  textTertiary: string;     // Captions, muted labels, placeholders
  live: string;             // Live-green dot for in-progress states
  // GameChip FINAL result — the picked team's score. Split per mode: the
  // light values are dark enough to read on #EBEBEB, the dark values light
  // enough to read on #1A1A1A. Both directions measured — see defaults.ts.
  gameWon: string;          // Picked team's score, is_correct === true
  gameLost: string;         // Picked team's score, is_correct === false
  hotpickMiss: string;      // HISTORY bar, is_hotpick_correct === false
  onPrimary: string;        // Foreground on `primary` surface (flame CTA)

  // Scrim — a dark wash laid over partner-supplied PHOTOGRAPHY (the Club
  // roster header's banner) so text stays legible on top of it. Identical in
  // light and dark mode on purpose, and that is the point rather than an
  // oversight: the image underneath is the same picture either way, and the
  // Club's brand colour is not involved at all. Fixed strength, never tuned to
  // one Partner's upload — the next Partner's photo has to work too.
  //
  // Deliberately NOT onPrimary, even though both are white today. onPrimary
  // means "foreground on the flame CTA"; if it ever moved for a lighter CTA,
  // scrim text would silently follow it onto an unreadable value.
  scrim: string;            // Base wash over the whole banner
  scrimStrong: string;      // Extra weight where text sits
  onScrim: string;          // Text and icons on the scrim
  onScrimShadow: string;    // Soft shadow that keeps them legible on a busy photo

  // Semantic colors (always HotPick — never overridden by partners)
  success: string;
  warning: string;
  error: string;
  border: string;

  // Brand accents for secondary CTAs (Join / Create Contest on Home,
  // future empty-state buttons). HotPick brand secondaries that read
  // on both light and dark surfaces without per-mode overrides.
  ctaAccentOutline: string; // teal — used for border + icon
  ctaAccentText:    string; // amber — used for label text
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
