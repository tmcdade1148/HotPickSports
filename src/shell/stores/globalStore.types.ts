// Type definitions for the global store. Extracted verbatim from globalStore.ts
// — pure type declarations, no runtime code. The store creator imports
// GlobalState from here; the public row-shape interfaces are re-exported by
// globalStore.ts so existing import paths keep working.
import type {User} from '@supabase/supabase-js';
import type {AnyEventConfig} from '@shared/types/templates';
import type {DbPool, DbProfile, DbPoolMember} from '@shared/types/database';
import type {BrandConfig} from '@shell/theme/types';

export interface GlobalState {
  // Auth
  user: User | null;
  isAuthLoading: boolean;
  setUser: (user: User | null) => void;
  setAuthLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;

  // Active event cards (Home Screen) — max 2, priority-ordered
  activeEventCards: AnyEventConfig[];
  availableEvents: AnyEventConfig[];
  refreshAvailableEvents: () => void;

  // Active event context
  activeSport: AnyEventConfig | null;
  setActiveSport: (sport: AnyEventConfig) => void;

  // New-user onboarding demo (spec: docs/DEMO_WEEK_SPEC.md). enterDemo swaps
  // the active competition/pool to the nfl_demo sandbox (snapshotting the
  // prior selection); exitDemo restores it. Set directly — bypasses
  // setActiveSport's persistence + async loadPersistedPoolId to avoid a race.
  isDemoActive: boolean;
  enterDemo: () => Promise<void>;
  exitDemo: () => void;
  // Demo flow UI state: the scoring-explainer modal on entry, the
  // score-breakdown modal + revealed-results state after settling.
  demoIntroOpen: boolean;
  demoScoreOpen: boolean;
  // demoRevealed (results shown) is derived as `demoResult != null` at the
  // read site — no separate flag.
  demoResult: {
    weekPoints: number;
    correctPicks: number;
    totalPicks: number;
    hotpickRank: number | null;
    hotpickCorrect: boolean | null;
  } | null;
  dismissDemoIntro: () => void;
  dismissDemoScore: () => void;
  setDemoResult: (r: GlobalState['demoResult']) => void;
  clearDemoReveal: () => void;

  // Profile — full profile object
  userProfile: DbProfile | null;
  fetchProfile: (userId: string) => Promise<DbProfile | null>;
  // The League (partner) this user is on the board of — a partner_members row
  // (Chairman or Director), independent of any Club Pool. Null when neither.
  // Settings shows a "League Tools" entry + ClubAdminScreen gates on this.
  // `role` drives who can add Directors (chairman only). `clubPoolId` is the
  // partner's Club Pool if it runs one (null for sponsor-only). v1: at most
  // one League per user. (`managedClub` is a frozen legacy identifier for the
  // partner/League concept — see REFERENCE §22.)
  managedClub:
    | {id: string; name: string; clubPoolId: string | null; role: 'chairman' | 'director'; logo: string | null}
    | null;
  loadManagedClub: (userId: string) => Promise<void>;

  // the get_visible_competitions RPC on session init. Used by the sport
  // registry / switcher to filter beta-only competitions (nfl_2025_sim
  // today) from users who aren't on the beta list. Empty array means
  // "not loaded yet" — the registry treats that as "show everything"
  // so the app doesn't break before the RPC resolves.
  visibleCompetitions: string[];
  visibleCompetitionsLoaded: boolean;
  loadVisibleCompetitions: () => Promise<void>;

  // Per-sport "has the user played any earlier season of this sport"
  // flag, keyed by sport identifier ('football', 'soccer', 'hockey').
  // Powers the 'WELCOME BACK' vs 'WELCOME TO' branch on OffSeasonHero
  // (and any other welcome-style surface). 'Prior' = at least one
  // season_picks row in some OTHER competition of the same sport.
  // Cached per session — only fetched on first inquiry per sport.
  priorSportHistory: Record<string, boolean>;
  loadPriorSportHistory: (sport: string, currentCompetition: string) => Promise<void>;
  updateProfile: (
    userId: string,
    fields: Partial<DbProfile>,
  ) => Promise<boolean>;

  // Onboarding helpers
  needsProfileSetup: () => boolean;
  needsTosAcceptance: () => boolean;
  acceptTos: (userId: string) => Promise<boolean>;
  /** Fetch current_tos_version from competition_config */
  fetchCurrentTosVersion: () => Promise<string | null>;
  /** Check if user's tos_version matches current_tos_version */
  needsTosUpdate: (currentTosVersion: string) => boolean;

  // Invite code — stored in memory for deep link flow
  pendingInviteCode: string | null;
  setPendingInviteCode: (code: string | null) => void;
  clearPendingInviteCode: () => void;

  // Pool state — global, drives all tabs simultaneously
  activePoolId: string | null;
  defaultPoolId: string | null; // loads on app open (persisted per competition)
  userPools: DbPool[];
  visiblePools: DbPool[]; // userPools filtered: hides auto-enrolled global pools
  poolRoles: Record<string, string>; // poolId → 'member' | 'admin' | 'organizer'
  manualGlobalJoins: Record<string, boolean>; // poolId → true if user joined global pool via invite code
  poolsByCompetition: Record<string, DbPool[]>;
  isLoadingPools: boolean;
  setActivePoolId: (poolId: string | null) => void;
  setDefaultPoolId: (poolId: string) => void;
  loadDefaultPoolId: (competition: string) => Promise<void>;
  // `silent` skips the isLoadingPools spinner — used by background refetch
  // triggers (app foreground, pull-to-refresh) so they don't flash the
  // full-screen loader on PoolSelectionScreen. Initial loads omit it.
  fetchUserPools: (
    userId: string,
    competition: string,
    options?: {silent?: boolean},
  ) => Promise<void>;
  getPoolsForCompetition: (competition: string) => DbPool[];
  createPool: (params: {
    userId: string;
    competition: string;
    name: string;
    isPublic: boolean;
  }) => Promise<{
    pool?: DbPool;
    error?: string;
    upgradeRequired?: boolean;
    showWall?: 'pool_cap' | null;
  }>;
  redeemCompCode: (
    code: string,
  ) => Promise<{ok?: true; label?: string | null; error?: string}>;
  joinPool: (
    userId: string,
    inviteCode: string,
  ) => Promise<{
    pool?: DbPool;
    error?: string;
    poolFull?: boolean;
    // Machine-readable join-failure cause, so callers can pick their own copy
    // per case instead of matching on `error` text. `error` stays for callers
    // that render the store's default strings (e.g. JoinPoolScreen).
    errorCode?: 'pool_full' | 'not_found' | 'already_member' | 'invalid';
    // Gaffer Approval Gate: a fresh join lands pending, not active. `pending`
    // routes the caller to the waiting-room; `poolName` labels the Contest
    // applied to (the pool is intentionally NOT added to any list).
    pending?: boolean;
    poolName?: string;
    // Gaffer of the applied-to Contest. The pool object is deliberately not
    // returned on the pending branch, so the organizer id is surfaced on its
    // own for the waiting-room copy ("<Gaffer> has to wave you in").
    organizerId?: string | null;
  }>;
  joinPublicContest: (
    userId: string,
  ) => Promise<{pool?: DbPool; error?: string}>;
  loadPersistedPoolId: (competition: string) => Promise<void>;
  clearPoolState: () => void;

  // Pool member management
  poolMembers: (DbPoolMember & {profile?: DbProfile})[];
  isLoadingMembers: boolean;
  fetchPoolMembers: (poolId: string) => Promise<void>;
  removePoolMember: (
    poolId: string,
    userId: string,
  ) => Promise<{success: boolean; error?: string}>;
  updateMemberRole: (
    poolId: string,
    userId: string,
    newRole: string,
  ) => Promise<{success: boolean; error?: string}>;

  // Email-based role delegation (Gaffer Tools / League Tools / Partner Admin).
  // grantPoolDelegate + revokePoolDelegate are organizer-only (enforced
  // server-side); listPoolDelegates is viewable by the board; setLeagueChairman
  // is super-admin only. `pending: true` means the email isn't a user yet and
  // the role attaches when they sign up with that exact email.
  grantPoolDelegate: (
    poolId: string,
    email: string,
  ) => Promise<{success: boolean; error?: string; pending?: boolean}>;
  revokePoolDelegate: (
    poolId: string,
    target: {userId?: string; email?: string},
  ) => Promise<{success: boolean; error?: string}>;
  listPoolDelegates: (poolId: string) => Promise<PoolDelegate[]>;
  setLeagueChairman: (
    partnerId: string,
    email: string,
  ) => Promise<{success: boolean; error?: string; pending?: boolean}>;
  // Assign the Gaffer (organizer) of a partner's Club Pool by email — super
  // admin only, partner must have a Club Pool. Separate from the Chairman.
  setClubPoolGaffer: (
    partnerId: string,
    email: string,
  ) => Promise<{success: boolean; error?: string; pending?: boolean}>;
  // Partner-level board (Chairman/Directors), independent of any Club Pool.
  // grant/revoke are chairman-only (or super-admin); list is viewable by the
  // board. Same pending-on-signup semantics.
  grantPartnerDirector: (
    partnerId: string,
    email: string,
  ) => Promise<{success: boolean; error?: string; pending?: boolean}>;
  revokePartnerMember: (
    partnerId: string,
    target: {userId?: string; email?: string},
  ) => Promise<{success: boolean; error?: string}>;
  listPartnerMembers: (partnerId: string) => Promise<PoolDelegate[]>;

  // Pool settings management
  updatePoolSettings: (
    poolId: string,
    settings: {
      name?: string;
      isPublic?: boolean;
      // Pass an empty string to clear a previously-set welcome message;
      // pass undefined to leave it unchanged.
      welcomeMessage?: string;
    },
  ) => Promise<{success: boolean; error?: string}>;
  archivePool: (
    poolId: string,
  ) => Promise<{success: boolean; error?: string}>;

  // Organizer broadcast
  broadcastToPool: (
    poolId: string,
    message: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    recipients?: number;
    remainingToday?: number;
  }>;
  fetchBroadcastsToday: (poolId: string) => Promise<number>;

  // SmackTalk unread counts — poolId → unread count
  smackUnreadCounts: Record<string, number>;
  setSmackUnreadCount: (poolId: string, count: number) => void;
  markPoolAsRead: (poolId: string) => Promise<void>;
  fetchSmackUnreadCounts: (userId: string, poolIds: string[]) => Promise<void>;

  // SmackTalk Realtime subscription (lives here, not in components)
  smackRealtimeChannel: any | null;
  subscribeSmackUnread: () => void;
  unsubscribeSmackUnread: () => void;

  // Flagged message counts — poolId → pending count (organizer/admin only)
  flaggedCounts: Record<string, number>;
  fetchFlaggedCounts: () => Promise<void>;

  // Recent broadcasts — for Message Center on Home Screen
  recentBroadcasts: {poolId: string; poolName: string; message: string; sentAt: string; senderName: string}[];
  fetchRecentBroadcasts: () => Promise<void>;

  // Global pool auto-enrollment
  ensureGlobalPoolMembership: () => Promise<void>;

  // Brand config — drives useTheme() and useBrand() hooks
  activeBrandConfig: BrandConfig | null;
  setActiveBrandConfig: (config: BrandConfig | null) => void;
  // Accepts either the typed BrandConfig (from theme defaults) or a
  // raw jsonb shape (from partner.brand_config / RPC results). The
  // pool's brand_config column is typed Record<string,unknown> so
  // both flow through unchanged; reader callsites then narrow what
  // they need.
  updatePoolBrandConfig: (
    poolId: string,
    config: BrandConfig | Record<string, unknown> | null,
  ) => void;

  // Feature flags
  showGlobalPool: boolean;

  // History & Hardware
  userHardware: UserHardwareItem[];
  hasHistory: boolean;
  historyVisibility: 'private' | 'pools_only' | 'public';
  playerArchetype: PlayerArchetype | null;
  loadUserHardware: () => Promise<void>;
  updateHistoryVisibility: (v: 'private' | 'pools_only' | 'public') => Promise<void>;
  computePlayerArchetype: () => void;

  // Home Redesign §6.6 — Last-week HotPick recap + Week Mini-Strip data.
  // Computed server-side; clients never aggregate scores (Hard Rule #3).
  lastWeekHotPick: {
    team: string;
    isCorrect: boolean;
    points: number;
  } | null;
  loadLastWeekHotPick: (
    userId: string,
    competition: string,
    currentWeek: number,
  ) => Promise<void>;

  // Last 4 weeks of pre-computed totals for the user.
  recentWeeks: Array<{week: number; total: number; correctPicks: number; totalPicks: number}>;
  loadRecentWeeks: (userId: string, competition: string) => Promise<void>;

  // The user's TRUE season points total — user-scoped (no pool), summed from
  // their own season_user_totals for the active phase (REGULAR vs playoffs),
  // excluding the in-progress week. Backs the IdentityBar SEASON PTS headline.
  // Deliberately NOT the pool-scoped seasonStore leaderboard: that one is
  // wiped + refetched on every pool switch (causing a 0-flash) and is scoped
  // to a pool's start date, which is wrong for a user-level identity stat
  // (CLAUDE.md rule #2 — scores belong to the user, not the pool).
  seasonTotal: number | null;
  loadSeasonTotal: (userId: string, competition: string) => Promise<void>;

  // Season-long HotPick hit rate — aggregated across every settled week
  // the user has played. `hits` = weeks where is_hotpick_correct is
  // true; `total` = settled weeks with a HotPick designated.
  hotPickHitRate: {hits: number; total: number} | null;
  loadHotPickHitRate: (userId: string, competition: string) => Promise<void>;

  // Pool Module indicators (per-pool unread counts + most-recent activity timestamp).
  // Aggregated in ONE query in loadPoolIndicators — never per-pool useEffect
  // (spec §6.4.6 Red Flag). Smack unread already lives in smackUnreadCounts;
  // this slice adds organizer-notification unread + recency.
  poolIndicators: Record<string, {orgUnread: number; mostRecentAt: string | null}>;
  loadPoolIndicators: (userId: string, poolIds: string[]) => Promise<void>;
  /** Mark organizer notifications as read for this user in this pool. */
  markOrgNotificationsRead: (userId: string, poolId: string) => Promise<void>;

  // Per-pool user rank for the Pool Module rank chip. Populated by the
  // get_user_ranks_in_pools RPC. Partner-aligned pools are NOT passed —
  // they're never ranked per the May 13 2026 locked product decision.
  userRankByPool: Record<string, {rank: number; memberCount: number; total: number}>;
  loadUserRankByPool: (userId: string, poolIds: string[]) => Promise<void>;

  // Per-pool weekly rank — pool-scoped ranking of members by THIS week's
  // points only. Drives the live "Week N · You're Xth (of Y)" line that
  // shows under each pool's season-rank line once the first game of the
  // week kicks off. Empty between weeks; repopulates as games settle.
  weekRankByPool: Record<string, {rank: number; memberCount: number; weekPoints: number}>;
  loadWeekRankByPool: (
    userId: string,
    poolIds: string[],
    competition: string,
    week: number,
  ) => Promise<void>;

  // Partner Module data — spec §6.4.7.
  // partnersById is the fetched partner record cache (one per distinct
  // partner_id aligned to a visible pool). Only partners with
  // is_active = true AND perk_text IS NOT NULL are loaded — partners
  // without a configured perk should not appear as Modules.
  partnersById: Record<string, {
    id: string;
    name: string;
    slug: string;
    // Nullable — Clubs without a perk still appear in YOUR CLUBS;
    // PartnerModule hides its perk row when null.
    perk_text: string | null;
    perk_icon: string | null;
    logo_url: string | null;
    primary_color: string | null;
  }>;
  loadAlignedPartners: (visiblePoolPartnerIds: string[]) => Promise<void>;

  // Active partners across the platform (regardless of pool alignment).
  // Used by Home's `YOUR PARTNERS` section so the user always sees the
  // live partner roster, not just the ones they happen to be aligned
  // with via a pool.
  loadActivePartners: () => Promise<void>;
  activePartnerIds: string[];

  // partnerIndicators — parallel to poolIndicators but keyed by partner_id.
  // Sourced from partner_notifications + partner_notification_read_state.
  partnerIndicators: Record<
    string,
    {unread: number; mostRecentAt: string | null; latestMessage: string | null}
  >;
  loadPartnerIndicators: (userId: string, partnerIds: string[]) => Promise<void>;
  /** Mark partner notifications read for this user/partner. Called on entry
   *  to PartnerRosterScreen. Clears the indicator on Home. */
  markPartnerNotificationsRead: (userId: string, partnerId: string) => Promise<void>;

  // Pool ↔ Club affiliations (many-to-many). Sourced from
  // `pool_partner_affiliations`. Each pool maps to an ordered list of its
  // affiliated Clubs (primary first, then by created_at). Each row carries
  // its own brand snapshot — never live-joined to `partners` for rendering
  // (Hard Rule #23).
  //
  // PoolModule reads from this slice when populated; falls back to the
  // legacy singular pool.partner_id + pool.brand_config when not.
  poolAffiliations: Record<string, PoolAffiliation[]>;
  loadPoolAffiliations: (poolIds: string[]) => Promise<void>;
}

export interface PoolAffiliation {
  partnerId:    string;
  partnerName:  string;
  // Full 4-slot Club palette captured at affiliation time. Render
  // code uses `pickReadableBrandColor` to walk this stack and pick
  // the one with enough contrast against the current surface
  // (handles light/dark mode automatically).
  brandColors: {
    primary:    string | null;
    secondary:  string | null;
    background: string | null;
    highlight:  string | null;
  };
  logoUrl:      string | null;
  isPrimary:    boolean;
}

/** A row in a pool's board, from list_pool_delegates(). `userId` is null for
 *  pending (not-yet-signed-up) grants; `email` is null for active rows whose
 *  auth email the viewer isn't entitled to (it's populated server-side). */
export interface PoolDelegate {
  userId: string | null;
  email:  string | null;
  // Pool board: organizer | admin. Partner board: chairman | director.
  role:   'organizer' | 'admin' | 'chairman' | 'director';
  status: 'active' | 'pending';
}

export interface UserHardwareItem {
  id: string;
  hardwareSlug: string;
  hardwareName: string;
  category: 'weekly' | 'season' | 'career';
  scope: 'platform' | 'pool';
  competition: string;
  seasonYear: number;
  week: number | null;
  poolId: string | null;
  contextJson: Record<string, unknown>;
  awardedAt: string;
  isVisible: boolean;
}

export interface PlayerArchetype {
  label: string;
  description: string;
}
