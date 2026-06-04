import {create} from 'zustand';
import type {User} from '@supabase/supabase-js';
import type {AnyEventConfig} from '@shared/types/templates';
import type {DbPool, DbProfile, DbPoolMember} from '@shared/types/database';
import type {BrandConfig} from '@shell/theme/types';
import {supabase} from '@shared/config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getAllEventsUnfiltered, getEventsByPriority, getDemoEvent, getEventByCompetition, DEMO_POOL_ID} from '@sports/registry';
import {deactivateDeviceTokens} from '@shell/services/pushNotifications';
import {nflSeason} from '@sports/nfl/config';
import {isSandboxCompetition} from '@shared/utils/competition';

const POOL_STORAGE_PREFIX = 'hotpick_active_pool_';
const DEFAULT_POOL_PREFIX = 'hotpick_default_pool_';

// Race-condition guard for loadWeekRankByPool. Each call stamps this
// with its (competition, week) tag at start; the resolved response only
// writes to the store if its tag still matches — preventing a slow
// response from clobbering newer state when the user advances weeks.
let weekRankLatestTag = '';

// Snapshot of the user's active selection before entering the onboarding demo,
// restored by exitDemo(). Module-scoped (the store is a singleton) to avoid
// widening the typed store interface with internal-only fields.
let _preDemoSport: AnyEventConfig | null = null;
let _preDemoPoolId: string | null = null;

/**
 * DEV-only: AsyncStorage key for the active competition so Metro hot reloads
 * don't reset the developer back to the default event. Production builds must
 * never read this value — LoadingScreen handles the gating.
 */
export const DEV_ACTIVE_COMPETITION_KEY = 'hotpick_dev_active_competition';

/** AsyncStorage key for a competition's active pool */
function poolStorageKey(competition: string): string {
  return `${POOL_STORAGE_PREFIX}${competition}`;
}

/** AsyncStorage key for a competition's default pool (loads on app open) */
function defaultPoolStorageKey(competition: string): string {
  return `${DEFAULT_POOL_PREFIX}${competition}`;
}

/** Generate a random 6-character alphanumeric invite code. */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

interface GlobalState {
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
    | {id: string; name: string; clubPoolId: string | null; role: 'chairman' | 'director'}
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
  fetchUserPools: (userId: string, competition: string) => Promise<void>;
  getPoolsForCompetition: (competition: string) => DbPool[];
  createPool: (params: {
    userId: string;
    competition: string;
    name: string;
    isPublic: boolean;
  }) => Promise<{pool?: DbPool; error?: string; upgradeRequired?: boolean}>;
  joinPool: (
    userId: string,
    inviteCode: string,
  ) => Promise<{pool?: DbPool; error?: string; poolFull?: boolean}>;
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
  partnerIndicators: Record<string, {unread: number; mostRecentAt: string | null}>;
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

export const useGlobalStore = create<GlobalState>((set, get) => ({
  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  user: null,
  isAuthLoading: true,
  setUser: user => set({user}),
  setAuthLoading: isAuthLoading => set({isAuthLoading}),
  signOut: async () => {
    // Clean up Realtime subscription
    get().unsubscribeSmackUnread();

    // Deactivate push tokens for this device (is_active = false, never DELETE)
    const userId = get().user?.id;
    if (userId) {
      await deactivateDeviceTokens(userId).catch(() => {});
    }

    // Clear all per-competition pool + default pool keys plus the
    // DEV-only persisted active competition. The latter is critical
    // for the multi-account dev flow: without it, a previous user's
    // sim choice persists into the next user's session and bypasses
    // their visibility allowlist (LoadingScreen's DEV restore uses
    // getAllEventsUnfiltered).
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(
      k =>
        k.startsWith(POOL_STORAGE_PREFIX) ||
        k.startsWith(DEFAULT_POOL_PREFIX) ||
        k === DEV_ACTIVE_COMPETITION_KEY,
    );
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
    await supabase.auth.signOut();
    set({
      user: null,
      userProfile: null,
      managedClub: null,
      priorSportHistory: {},
      visibleCompetitions: [],
      visibleCompetitionsLoaded: false,
      activePoolId: null,
      defaultPoolId: null,
      userPools: [],
      poolRoles: {},
      poolsByCompetition: {},
      smackUnreadCounts: {},
      showGlobalPool: false,
      pendingInviteCode: null,
      activeBrandConfig: null,
    });
  },

  // ---------------------------------------------------------------------------
  // Active event cards (Home Screen)
  // ---------------------------------------------------------------------------
  activeEventCards: [],
  availableEvents: [],

  refreshAvailableEvents: () => {
    const all = getEventsByPriority(get().visibleCompetitions);
    set({
      availableEvents: all,
      activeEventCards: all.filter(e => e.status === 'active').slice(0, 2),
    });
  },

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------
  userProfile: null,
  managedClub: null,
  visibleCompetitions: [],
  visibleCompetitionsLoaded: false,
  priorSportHistory: {},

  loadPriorSportHistory: async (sport, currentCompetition) => {
    // Cache per session — sport history doesn't change mid-app.
    if (get().priorSportHistory[sport] !== undefined) return;

    const userId = get().user?.id;
    if (!userId) return;

    // Other competitions in this sport (e.g. 'football' →
    // nfl_2025_sim if we're on nfl_2026). Read from the registry
    // unfiltered so beta-gated comps still count as history for
    // beta testers.
    const others = getAllEventsUnfiltered()
      .filter(e => e.sport === sport && e.competition !== currentCompetition)
      .map(e => e.competition);

    if (others.length === 0) {
      set(s => ({priorSportHistory: {...s.priorSportHistory, [sport]: false}}));
      return;
    }

    const {count} = await supabase
      .from('season_picks')
      .select('id', {count: 'exact', head: true})
      .eq('user_id', userId)
      .in('competition', others);

    set(s => ({
      priorSportHistory: {...s.priorSportHistory, [sport]: (count ?? 0) > 0},
    }));
  },

  loadVisibleCompetitions: async () => {
    // Capture pre-load state so we know whether this is the first
    // resolve of the session (used by the beta force-land below).
    const wasLoaded = get().visibleCompetitionsLoaded;

    const {data, error} = await supabase.rpc('get_visible_competitions');
    if (error) {
      // Fail open: if the RPC errors, treat everything as visible so
      // we don't accidentally hide the user's active sport. The server
      // is still authoritative for pool/data access via RLS.
      set({visibleCompetitions: [], visibleCompetitionsLoaded: true});
      return;
    }
    const rows = (data ?? []) as Array<{competition: string}>;
    const visible = rows.map(r => r.competition);
    set({visibleCompetitions: visible, visibleCompetitionsLoaded: true});

    // Beta-tester force-land — on the FIRST resolve of a session, if the
    // user has access to a sandbox/sim competition, drop them onto it so
    // they're testing against the right simulator state. Each beta user is
    // whitelisted (competition_access) for exactly one sim — testers →
    // nfl_2025_sim, Apple reviewer → nfl_2025_simA, Google → nfl_2025_simG —
    // so they land on theirs. After the initial sync we leave activeSport
    // alone so a super-admin can still switch to nfl_2026 manually via
    // Settings → Competition and stay there for the rest of the session.
    //
    // Note: this fires in DEV too. Earlier versions skipped DEV to
    // preserve the LoadingScreen DEV_ACTIVE_COMPETITION_KEY
    // hot-reload sanity, but per Tom that was sticking beta testers
    // on the wrong competition. If a dev wants to test 2026 in DEV,
    // they switch via Settings → Competition after boot.
    if (wasLoaded) return;

    const current = get().activeSport;

    // Defense in depth — if LoadingScreen restored a persisted
    // activeSport (e.g. AsyncStorage DEV_ACTIVE_COMPETITION_KEY
    // carrying nfl_2025_sim from a previous super-admin session)
    // that this user can't actually see, kick them to a visible
    // one. Without this, a logout-then-login-as-different-user
    // can leave a non-beta user looking at sim state.
    if (current && !visible.includes(current.competition)) {
      const fallback = getAllEventsUnfiltered().find(e => visible.includes(e.competition));
      if (fallback) {
        get().setActiveSport(fallback);
        set({activePoolId: null});
      }
      // Don't also run the sim force-land below — we've just
      // re-anchored the user. Re-evaluate on next session.
      return;
    }

    // Land on whichever sandbox/sim the user can see (each beta user is
    // whitelisted for exactly one). If they can see more than one (e.g. a
    // super-admin), the first in the visible list wins; they can switch.
    const sandbox = visible.find(c => isSandboxCompetition(c));
    if (!sandbox) return;
    if (current?.competition === sandbox) return;
    const sim = getAllEventsUnfiltered().find(e => e.competition === sandbox);
    if (sim) {
      get().setActiveSport(sim);
      // Clear sticky pool so the user lands on the sim pool list
      // instead of an nfl_2026 pool that no longer matches.
      set({activePoolId: null});
    }
  },

  loadManagedClub: async userId => {
    // The League (partner) this user is on the board of — a partner_members
    // row (chairman/director), independent of any Club Pool. Server-side
    // League Tools auth (_caller_can_manage_partner) admits both roles.
    const {data: memberRows} = await supabase
      .from('partner_members')
      .select('partner_id, role')
      .eq('user_id', userId)
      .limit(1);
    const membership = (memberRows ?? [])[0] as
      | {partner_id: string; role: 'chairman' | 'director'}
      | undefined;
    if (!membership) {
      set({managedClub: null});
      return;
    }
    const {data: partnerRows} = await supabase
      .from('partners')
      .select('id, name, club_pool_id')
      .eq('id', membership.partner_id)
      .eq('is_active', true)
      .limit(1);
    const row = (partnerRows ?? [])[0] as
      | {id: string; name: string; club_pool_id: string | null}
      | undefined;
    set({
      managedClub: row
        ? {
            id: row.id,
            name: row.name,
            clubPoolId: row.club_pool_id,
            role: membership.role,
          }
        : null,
    });
  },

  fetchProfile: async userId => {
    // IMPORTANT: keep this as `select('*')`. SuspensionGate +
    // is_super_admin gating both read off this row, and narrowing the
    // select silently drops those columns (RLS doesn't reject the
    // narrow read, it just returns less data). If you ever need to
    // reduce the payload, switch to an explicit column list that still
    // includes: is_platform_suspended, platform_suspension_reason,
    // is_super_admin.
    const {data} = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      set({userProfile: data as DbProfile});
      // Resolve "do you manage a Club?" alongside the profile load so
      // Settings + ClubAdminScreen don't each refetch on mount.
      get().loadManagedClub(userId).catch(() => {});
      // Resolve which competitions this user can see (filters the
      // sport switcher; beta-only competitions like nfl_2025_sim only
      // surface for whitelisted testers). AWAITED so the beta force-
      // land inside loadVisibleCompetitions runs before LoadingScreen
      // proceeds to fetch pools / set activePoolId. Without the await,
      // beta users get a brief NFL2026 activeSport + 2026 pool set
      // active before the sport flips to sim, and the persisted 2026
      // pool sticks. ~50-200ms latency cost on session boot.
      await get().loadVisibleCompetitions().catch(() => {});
      return data as DbProfile;
    }
    return null;
  },

  updateProfile: async (userId, fields) => {
    const {error} = await supabase
      .from('profiles')
      .update(fields)
      .eq('id', userId);

    if (error) {
      return false;
    }

    // Merge updated fields into local state
    set(state => ({
      userProfile: state.userProfile
        ? {...state.userProfile, ...fields}
        : null,
    }));
    return true;
  },

  // ---------------------------------------------------------------------------
  // Onboarding helpers
  // ---------------------------------------------------------------------------
  needsProfileSetup: () => {
    const profile = get().userProfile;
    return !profile || !profile.first_name;
  },

  needsTosAcceptance: () => {
    const profile = get().userProfile;
    return !profile || !profile.tos_accepted_at;
  },

  acceptTos: async (userId: string) => {
    // Read current TOS version from competition_config
    const {data: configRow} = await supabase
      .from('competition_config')
      .select('value')
      .eq('competition', 'global')
      .eq('key', 'current_tos_version')
      .single();

    const tosVersion = configRow?.value ?? '1.0';

    const {error} = await supabase.rpc('rpc_accept_tos', {
      p_tos_version: tosVersion,
    });

    if (error) {
      return false;
    }

    // Update local state
    set(state => ({
      userProfile: state.userProfile
        ? {
            ...state.userProfile,
            tos_accepted_at: new Date().toISOString(),
            tos_version: tosVersion,
          }
        : null,
    }));
    return true;
  },

  fetchCurrentTosVersion: async () => {
    const {data} = await supabase
      .from('competition_config')
      .select('value')
      .eq('competition', 'global')
      .eq('key', 'current_tos_version')
      .single();
    return data?.value ?? null;
  },

  needsTosUpdate: (currentTosVersion: string) => {
    const profile = get().userProfile;
    if (!profile || !profile.tos_version) return true;
    return profile.tos_version !== currentTosVersion;
  },

  // ---------------------------------------------------------------------------
  // Invite code (deep link flow)
  // ---------------------------------------------------------------------------
  pendingInviteCode: null,
  setPendingInviteCode: code => set({pendingInviteCode: code}),
  clearPendingInviteCode: () => set({pendingInviteCode: null}),

  // ---------------------------------------------------------------------------
  // Active event context
  // ---------------------------------------------------------------------------
  activeSport: null,
  setActiveSport: sport => {
    const current = get().activeSport;
    if (current === null) {
      // Initial set (app boot) — just set the sport and cached pools.
      // Don't clear activePoolId or fire loadPersistedPoolId here;
      // LoadingScreen handles pool selection after fetching pools.
      const cached = get().poolsByCompetition[sport.competition] ?? [];
      set({activeSport: sport, userPools: cached});
    } else if (current.competition !== sport.competition) {
      // User switching between sports — clear pool and restore cache
      const cached = get().poolsByCompetition[sport.competition] ?? [];
      set({activeSport: sport, userPools: cached, activePoolId: null});
      // Restore persisted pool selection for this competition
      get().loadPersistedPoolId(sport.competition);
    } else {
      set({activeSport: sport});
    }
    // DEV only: persist competition so Metro hot reloads preserve selection.
    // Production ignores this value — see LoadingScreen for the read path.
    if (__DEV__) {
      AsyncStorage.setItem(DEV_ACTIVE_COMPETITION_KEY, sport.competition).catch(
        () => {},
      );
    }
  },

  // ---------------------------------------------------------------------------
  // New-user onboarding demo (spec: docs/DEMO_WEEK_SPEC.md)
  // ---------------------------------------------------------------------------
  isDemoActive: false,
  demoIntroOpen: false,
  demoScoreOpen: false,
  demoResult: null,
  enterDemo: async () => {
    const {isDemoActive, activeSport, activePoolId} = get();
    // Snapshot the prior selection once (so re-entry doesn't clobber it).
    if (!isDemoActive) {
      _preDemoSport = activeSport;
      _preDemoPoolId = activePoolId;
    }
    // Best-effort server reset + demo-pool membership. The picks loop is
    // pool-independent, so a failure here doesn't block the demo render.
    try {
      await supabase.rpc('enter_demo');
    } catch {
      // ignore — non-critical to rendering the demo picks screen
    }
    // Set state directly (not via setActiveSport) to avoid its async
    // loadPersistedPoolId racing our activePoolId write. Open the scoring
    // explainer, clear any prior reveal.
    set({
      isDemoActive: true,
      activeSport: getDemoEvent(),
      activePoolId: DEMO_POOL_ID,
      activeBrandConfig: null,
      userPools: [],
      demoIntroOpen: true,
      demoScoreOpen: false,
      demoResult: null,
    });
  },
  exitDemo: () => {
    const prevSport = _preDemoSport;
    const prevPool = _preDemoPoolId;
    _preDemoSport = null;
    _preDemoPoolId = null;
    const demoReset = {
      isDemoActive: false,
      demoIntroOpen: false,
      demoScoreOpen: false,
      demoResult: null,
    };
    if (prevSport) {
      const cached = get().poolsByCompetition[prevSport.competition] ?? [];
      set({
        ...demoReset,
        activeSport: prevSport,
        activePoolId: prevPool,
        userPools: cached,
        activeBrandConfig: null,
      });
    } else {
      set(demoReset);
    }
  },
  dismissDemoIntro: () => set({demoIntroOpen: false}),
  dismissDemoScore: () => set({demoScoreOpen: false}),
  setDemoResult: r => set({demoResult: r, demoScoreOpen: true}),
  clearDemoReveal: () => set({demoResult: null, demoScoreOpen: false}),

  // ---------------------------------------------------------------------------
  // Pool state
  // ---------------------------------------------------------------------------
  activePoolId: null,
  defaultPoolId: null,
  userPools: [],
  visiblePools: [],
  poolRoles: {},
  manualGlobalJoins: {},
  poolsByCompetition: {},
  isLoadingPools: false,

  setActivePoolId: poolId => {
    // Update brand config from the selected pool
    const pool = poolId
      ? get().userPools.find(p => p.id === poolId)
      : null;
    const brandConfig = (pool?.brand_config as unknown as BrandConfig) ?? null;


    set({activePoolId: poolId, activeBrandConfig: brandConfig});
    const competition = get().activeSport?.competition;
    if (poolId && competition) {
      AsyncStorage.setItem(poolStorageKey(competition), poolId);
    } else if (competition) {
      AsyncStorage.removeItem(poolStorageKey(competition));
    }
  },

  setDefaultPoolId: poolId => {
    set({defaultPoolId: poolId});
    const competition = get().activeSport?.competition;
    if (competition) {
      AsyncStorage.setItem(defaultPoolStorageKey(competition), poolId);
    }
  },

  loadDefaultPoolId: async (competition: string) => {
    try {
      const poolId = await AsyncStorage.getItem(
        defaultPoolStorageKey(competition),
      );
      if (poolId) {
        set({defaultPoolId: poolId});
      }
    } catch {
      // AsyncStorage read failed — leave defaultPoolId as null
    }
  },

  fetchUserPools: async (userId, competition) => {
    set({isLoadingPools: true});
    // Join pools with pool_members to get pools this user belongs to
    const {data} = await supabase
      .from('pool_members')
      .select('pool_id, role, invite_code_used, pools!inner(*)')
      .eq('user_id', userId)
      .eq('pools.competition', competition)
      .eq('status', 'active');

    const pools: DbPool[] =
      data?.map((row: any) => row.pools as DbPool) ?? [];

    // Build poolId → role map and track manual joins
    const roles: Record<string, string> = {};
    const manualGlobalJoins: Record<string, boolean> = {};
    for (const row of data ?? []) {
      roles[(row as any).pool_id] = (row as any).role;
      // Track if user manually joined a global pool (has invite_code_used)
      if ((row as any).pools?.is_global && (row as any).invite_code_used) {
        manualGlobalJoins[(row as any).pool_id] = true;
      }
    }

    // Compute visible pools: hide global pools unless manually joined,
    // AND always hide pools flagged is_hidden_from_users (the analytics
    // Platform Pool — staff-only visibility per April 2026 spec).
    const visible = pools.filter(p => {
      if (p.is_hidden_from_users) return false;
      if (!p.is_global) return true;
      return !!manualGlobalJoins[p.id];
    });

    // Cache per competition and set as active list
    set(state => ({
      userPools: pools,
      visiblePools: visible,
      poolRoles: {...state.poolRoles, ...roles},
      manualGlobalJoins,
      poolsByCompetition: {...state.poolsByCompetition, [competition]: pools},
      isLoadingPools: false,
    }));

    // Fetch flagged counts for organizer/admin pools + recent broadcasts
    get().fetchFlaggedCounts();
    get().fetchRecentBroadcasts();
  },

  getPoolsForCompetition: (competition: string) => {
    return get().poolsByCompetition[competition] ?? [];
  },

  createPool: async ({userId, competition, name, isPublic}) => {
    const inviteCode = generateInviteCode();

    // Use SECURITY DEFINER RPC to create pool + add creator atomically
    const {data, error} = await supabase.rpc('create_pool', {
      p_name: name,
      p_competition: competition,
      p_is_public: isPublic,
      p_invite_code: inviteCode,
    });

    if (error) {
      return {error: error.message};
    }

    if (!data || data.error) {
      // Tier enforcement errors
      if (data?.error === 'pool_limit_reached') {
        return {error: 'pool_limit_reached', upgradeRequired: true};
      }
      return {error: data?.error ?? 'Failed to create pool'};
    }

    const typedPool = data.pool as DbPool;

    // Auto-select, add role, and add to both local list and competition cache.
    // IMPORTANT: also append to `visiblePools` — every pool-listing UI reads
    // that derived list, not `userPools`. Newly-created pools are never
    // global (organizers create non-global pools; globals are platform-
    // provisioned), so no filter check is needed. Without this update the
    // pool only appears after an app restart triggers `fetchUserPools`.
    set(state => {
      const updatedPools = [...state.userPools, typedPool];
      const updatedVisible = [...state.visiblePools, typedPool];
      return {
        userPools: updatedPools,
        visiblePools: updatedVisible,
        poolsByCompetition: {
          ...state.poolsByCompetition,
          [competition]: updatedPools,
        },
        activePoolId: typedPool.id,
        poolRoles: {...state.poolRoles, [typedPool.id]: 'organizer'},
      };
    });
    AsyncStorage.setItem(poolStorageKey(competition), typedPool.id);

    return {pool: typedPool};
  },

  joinPool: async (userId, inviteCode) => {
    // Use SECURITY DEFINER RPC to bypass RLS for pool lookup
    const {data, error} = await supabase.rpc('join_pool_by_invite', {
      p_invite_code: inviteCode.toUpperCase(),
    });

    if (error) {
      return {error: error.message};
    }

    if (!data || data.error) {
      if (data?.error === 'pool_full') {
        return {error: 'pool_full', poolFull: true};
      }
      return {error: data?.error ?? 'Invalid invite code or pool is full.'};
    }

    const typedPool = data.pool as DbPool;
    const competition = typedPool.competition;

    // Persist the selection first so the active-sport switch below (which
    // restores the persisted pool for the target competition) reads this value.
    AsyncStorage.setItem(poolStorageKey(competition), typedPool.id);

    // The Contest list is scoped to one active competition at a time. If the
    // joined Contest belongs to a different competition than the one currently
    // active, switch the active sport to it — otherwise the new Contest won't
    // appear in the list and a reopen would default back to the old
    // competition, hiding it permanently.
    const current = get().activeSport;
    if (current?.competition !== competition) {
      const event = getEventByCompetition(competition);
      if (event) {
        get().setActiveSport(event);
      }
    }

    // Set active pool immediately for instant UI feedback
    set({activePoolId: typedPool.id});

    // Re-fetch pools from DB — picks up invite_code_used, manualGlobalJoins, etc.
    await get().fetchUserPools(userId, competition);

    return {pool: typedPool};
  },

  loadPersistedPoolId: async (competition: string) => {
    const poolId = await AsyncStorage.getItem(poolStorageKey(competition));
    if (poolId) {
      set({activePoolId: poolId});
    }
  },

  clearPoolState: () => {
    const competition = get().activeSport?.competition;
    if (competition) {
      AsyncStorage.removeItem(poolStorageKey(competition));
    }
    set({activePoolId: null, userPools: []});
  },

  // ---------------------------------------------------------------------------
  // Pool member management
  // ---------------------------------------------------------------------------
  poolMembers: [],
  isLoadingMembers: false,

  fetchPoolMembers: async (poolId: string) => {
    set({isLoadingMembers: true});
    const {data} = await supabase
      .from('pool_members')
      .select('*, profiles:user_id(*)')
      .eq('pool_id', poolId)
      .eq('status', 'active')
      .order('joined_at', {ascending: true});

    const members =
      data?.map((row: any) => ({
        pool_id: row.pool_id,
        user_id: row.user_id,
        role: row.role,
        status: row.status,
        invited_by: row.invited_by,
        invite_code_used: row.invite_code_used,
        joined_at: row.joined_at,
        left_at: row.left_at,
        last_active_at: row.last_active_at,
        notification_override: row.notification_override,
        profile: row.profiles as DbProfile | undefined,
      })) ?? [];

    set({poolMembers: members, isLoadingMembers: false});
  },

  removePoolMember: async (poolId, userId) => {
    const {data, error} = await supabase.rpc('remove_pool_member', {
      p_pool_id: poolId,
      p_user_id: userId,
    });

    if (error) {
      return {success: false, error: error.message};
    }

    if (data?.error) {
      return {success: false, error: data.error};
    }

    // Remove from local state
    set(state => ({
      poolMembers: state.poolMembers.filter(m => m.user_id !== userId),
    }));

    return {success: true};
  },

  updateMemberRole: async (poolId, userId, newRole) => {
    const {data, error} = await supabase.rpc('update_member_role', {
      p_pool_id: poolId,
      p_user_id: userId,
      p_new_role: newRole,
    });

    if (error) {
      return {success: false, error: error.message};
    }

    if (data?.error) {
      return {success: false, error: data.error};
    }

    // Update local state
    set(state => ({
      poolMembers: state.poolMembers.map(m =>
        m.user_id === userId ? {...m, role: newRole as DbPoolMember['role']} : m,
      ),
    }));

    return {success: true};
  },

  grantPoolDelegate: async (poolId, email) => {
    const {data, error} = await supabase.rpc('grant_pool_delegate_by_email', {
      p_pool_id: poolId,
      p_email: email,
    });
    if (error) return {success: false, error: error.message};
    if (data?.error) return {success: false, error: data.error};
    return {success: true, pending: data?.assigned === 'pending'};
  },

  revokePoolDelegate: async (poolId, target) => {
    const {data, error} = await supabase.rpc('revoke_pool_delegate', {
      p_pool_id: poolId,
      p_user_id: target.userId ?? null,
      p_email: target.email ?? null,
    });
    if (error) return {success: false, error: error.message};
    if (data?.error) return {success: false, error: data.error};
    return {success: true};
  },

  listPoolDelegates: async poolId => {
    const {data, error} = await supabase.rpc('list_pool_delegates', {
      p_pool_id: poolId,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as {user_id: string | null; email: string | null; role: string; status: string}[])
      .map(r => ({
        userId: r.user_id,
        email: r.email,
        role: r.role as PoolDelegate['role'],
        status: r.status as PoolDelegate['status'],
      }));
  },

  setLeagueChairman: async (partnerId, email) => {
    const {data, error} = await supabase.rpc('admin_set_league_chairman', {
      p_partner_id: partnerId,
      p_email: email,
    });
    if (error) return {success: false, error: error.message};
    if (data?.error) return {success: false, error: data.error};
    return {success: true, pending: data?.assigned === 'pending'};
  },

  setClubPoolGaffer: async (partnerId, email) => {
    const {data, error} = await supabase.rpc('admin_set_club_pool_gaffer', {
      p_partner_id: partnerId,
      p_email: email,
    });
    if (error) return {success: false, error: error.message};
    if (data?.error) return {success: false, error: data.error};
    return {success: true, pending: data?.assigned === 'pending'};
  },

  grantPartnerDirector: async (partnerId, email) => {
    const {data, error} = await supabase.rpc('grant_partner_director_by_email', {
      p_partner_id: partnerId,
      p_email: email,
    });
    if (error) return {success: false, error: error.message};
    if (data?.error) return {success: false, error: data.error};
    return {success: true, pending: data?.assigned === 'pending'};
  },

  revokePartnerMember: async (partnerId, target) => {
    const {data, error} = await supabase.rpc('revoke_partner_member', {
      p_partner_id: partnerId,
      p_user_id: target.userId ?? null,
      p_email: target.email ?? null,
    });
    if (error) return {success: false, error: error.message};
    if (data?.error) return {success: false, error: data.error};
    return {success: true};
  },

  listPartnerMembers: async partnerId => {
    const {data, error} = await supabase.rpc('list_partner_members', {
      p_partner_id: partnerId,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as {user_id: string | null; email: string | null; role: string; status: string}[])
      .map(r => ({
        userId: r.user_id,
        email: r.email,
        role: r.role as PoolDelegate['role'],
        status: r.status as PoolDelegate['status'],
      }));
  },

  // ---------------------------------------------------------------------------
  // Pool settings management
  // ---------------------------------------------------------------------------

  updatePoolSettings: async (poolId, settings) => {
    const {data, error} = await supabase.rpc('update_pool_settings', {
      p_pool_id: poolId,
      p_name: settings.name ?? null,
      p_is_public: settings.isPublic ?? null,
      p_welcome_message: settings.welcomeMessage ?? null,
    });

    if (error) {
      return {success: false, error: error.message};
    }

    if (data?.error) {
      return {success: false, error: data.error};
    }

    // Update local state — mirror the change into both `userPools` and
    // `visiblePools`. Every pool-listing UI reads `visiblePools`; updates
    // that only touch `userPools` won't appear until the next fetch.
    const applyUpdate = (p: DbPool) =>
      p.id === poolId
        ? {
            ...p,
            ...(settings.name !== undefined ? {name: settings.name} : {}),
            ...(settings.isPublic !== undefined
              ? {is_public: settings.isPublic}
              : {}),
            ...(settings.welcomeMessage !== undefined
              ? {welcome_message: settings.welcomeMessage.trim() || null}
              : {}),
          }
        : p;
    set(state => ({
      userPools: state.userPools.map(applyUpdate),
      visiblePools: state.visiblePools.map(applyUpdate),
    }));

    return {success: true};
  },

  archivePool: async poolId => {
    const {data, error} = await supabase.rpc('archive_pool', {
      p_pool_id: poolId,
    });

    if (error) {
      return {success: false, error: error.message};
    }

    if (data?.error) {
      return {success: false, error: data.error};
    }

    // Remove from local state — mirror the removal into `visiblePools`
    // so Settings, Home, and the pool switcher all stop listing it
    // immediately. Without the visiblePools update the pool stays on
    // screen, and a second archive attempt hits the RPC which (rightly)
    // reports it's already archived.
    //
    // When the archived pool was the active one, fall back to a remaining
    // visible pool rather than nulling activePoolId. Leaving it null forces
    // the whole app shell into the "no active Contest" state mid-session,
    // which downstream consumers don't all expect — selecting the next pool
    // keeps the active selection valid (null only when none remain).
    set(state => {
      const userPools = state.userPools.filter(p => p.id !== poolId);
      const visiblePools = state.visiblePools.filter(p => p.id !== poolId);
      const wasActive = state.activePoolId === poolId;
      const activePoolId = wasActive
        ? visiblePools[0]?.id ?? null
        : state.activePoolId;
      const activeBrandConfig = wasActive
        ? ((visiblePools[0]?.brand_config as unknown as BrandConfig) ?? null)
        : state.activeBrandConfig;
      return {userPools, visiblePools, activePoolId, activeBrandConfig};
    });

    return {success: true};
  },

  // ---------------------------------------------------------------------------
  // Organizer broadcast
  // ---------------------------------------------------------------------------

  broadcastToPool: async (poolId, message) => {
    const {data, error} = await supabase.rpc('broadcast_to_pool', {
      p_pool_id: poolId,
      p_message: message,
    });

    if (error) {
      return {success: false, error: error.message};
    }

    if (data?.error) {
      return {
        success: false,
        error: data.error,
        remainingToday: data.remaining_today ?? undefined,
      };
    }

    // Fire broadcast email Edge Function (non-blocking — don't await)
    const profile = get().userProfile;
    const senderName =
      profile?.first_name ?? profile?.poolie_name ?? 'Contest Gaffer';

    supabase.functions
      .invoke('send-broadcast-email', {
        body: {pool_id: poolId, message, sender_name: senderName},
      })
      .then(res => {
        if (res.error) {
          console.warn('[broadcast-email] Edge Function error:', res.error);
        } else {
          console.log('[broadcast-email] Emails dispatched:', res.data);
        }
      })
      .catch(err => {
        console.warn('[broadcast-email] Failed to invoke:', err);
      });

    // Refresh broadcasts so MessageCenter shows the new one
    get().fetchRecentBroadcasts();

    return {
      success: true,
      recipients: data.recipients,
      remainingToday: data.remaining_today,
    };
  },

  fetchBroadcastsToday: async (poolId: string) => {
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const {count} = await supabase
      .from('organizer_notifications')
      .select('*', {count: 'exact', head: true})
      .eq('pool_id', poolId)
      .eq('notification_type', 'broadcast')
      .gte('sent_at', twentyFourHoursAgo);

    return count ?? 0;
  },

  // ---------------------------------------------------------------------------
  // SmackTalk unread counts
  // ---------------------------------------------------------------------------
  smackUnreadCounts: {},

  setSmackUnreadCount: (poolId, count) =>
    set(state => ({
      smackUnreadCounts: {...state.smackUnreadCounts, [poolId]: count},
    })),

  markPoolAsRead: async (poolId: string) => {
    const userId = get().user?.id;
    if (!userId) {
      return;
    }

    // Optimistic: clear count immediately
    set(state => ({
      smackUnreadCounts: {...state.smackUnreadCounts, [poolId]: 0},
    }));

    // Upsert read state
    await supabase.from('smack_read_state').upsert(
      {user_id: userId, pool_id: poolId, last_read_at: new Date().toISOString()},
      {onConflict: 'user_id,pool_id'},
    );
  },

  fetchSmackUnreadCounts: async (userId, poolIds) => {
    if (poolIds.length === 0) return;

    const {data, error} = await supabase
      .rpc('get_smack_unread_counts', {
        p_user_id: userId,
        p_pool_ids: poolIds,
      });

    if (error || !data) return;

    const counts: Record<string, number> = {};
    for (const row of data) {
      counts[row.pool_id] = Number(row.unread_count);
    }

    set({smackUnreadCounts: counts});
  },

  // ---------------------------------------------------------------------------
  // SmackTalk Realtime subscription
  // ---------------------------------------------------------------------------
  smackRealtimeChannel: null,

  subscribeSmackUnread: () => {
    // Idempotent singleton: bail if we already have a live channel. Three boot
    // paths (LoadingScreen, postAuthFlow, PoolWelcomeScreen) all call this on
    // session start; only the first wires the channel up. signOut tears it down
    // via unsubscribeSmackUnread.
    //
    // (The channel() wrapper in config/supabase.ts now gives every topic a
    // unique suffix, so this guard is no longer also working around Supabase's
    // dedup-by-name cache — it's purely a single-instance guard.)
    if (get().smackRealtimeChannel) return;

    const channel = supabase
      .channel('smack-unread-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'smack_messages',
        },
        (payload: any) => {
          const newMsg = payload.new;
          if (!newMsg?.pool_id || !newMsg?.user_id) {
            return;
          }

          const state = get();

          // Skip if this is the current user's own message
          if (newMsg.user_id === state.user?.id) {
            return;
          }

          // Skip if this pool is not in the user's pools
          const poolIds = new Set(state.userPools.map(p => p.id));
          if (!poolIds.has(newMsg.pool_id)) {
            return;
          }

          // Increment unread count for this pool
          set(s => ({
            smackUnreadCounts: {
              ...s.smackUnreadCounts,
              [newMsg.pool_id]: (s.smackUnreadCounts[newMsg.pool_id] ?? 0) + 1,
            },
          }));
        },
      )
      .subscribe();

    set({smackRealtimeChannel: channel});
  },

  unsubscribeSmackUnread: () => {
    const channel = get().smackRealtimeChannel;
    if (channel) {
      supabase.removeChannel(channel);
      set({smackRealtimeChannel: null});
    }
  },

  // ---------------------------------------------------------------------------
  // Flagged message counts (organizer/admin pools)
  // ---------------------------------------------------------------------------
  flaggedCounts: {},

  fetchFlaggedCounts: async () => {
    const {userPools, poolRoles} = get();
    // Only fetch for pools where user is organizer or admin
    const adminPools = userPools.filter(
      p => poolRoles[p.id] === 'organizer' || poolRoles[p.id] === 'admin',
    );
    if (adminPools.length === 0) {
      set({flaggedCounts: {}});
      return;
    }

    const poolIds = adminPools.map(p => p.id);
    const {data} = await supabase
      .from('smack_messages')
      .select('pool_id')
      .in('pool_id', poolIds)
      .eq('is_flagged', true)
      .eq('moderation_status', 'pending');

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.pool_id] = (counts[row.pool_id] ?? 0) + 1;
    }
    set({flaggedCounts: counts});
  },

  // ---------------------------------------------------------------------------
  // Recent broadcasts (last 24 hours across user's pools)
  // ---------------------------------------------------------------------------
  recentBroadcasts: [],

  fetchRecentBroadcasts: async () => {
    const {userPools, user} = get();
    if (userPools.length === 0) {
      set({recentBroadcasts: []});
      return;
    }

    const poolIds = userPools.map(p => p.id);
    // 30-day window to match the HomeInbox unread badge (was 24h, which made
    // the badge count messages the list couldn't show).
    const windowStart = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Join times — a broadcast sent before the user joined a pool isn't theirs,
    // so it's excluded here too (mirrors the HomeInbox badge logic).
    const {data: memberRows} = await supabase
      .from('pool_members')
      .select('pool_id, joined_at')
      .eq('user_id', user?.id ?? '')
      .in('pool_id', poolIds);
    const joinedByPool = new Map(
      (memberRows ?? []).map((r: any) => [r.pool_id, r.joined_at]),
    );

    const {data: rawBroadcasts} = await supabase
      .from('organizer_notifications')
      .select('pool_id, message, sent_at, organizer_id, notification_type')
      .in('pool_id', poolIds)
      .eq('notification_type', 'broadcast')
      .gte('sent_at', windowStart)
      .order('sent_at', {ascending: false})
      .limit(20);

    const data = (rawBroadcasts ?? []).filter((r: any) => {
      const joined = joinedByPool.get(r.pool_id);
      return !joined || new Date(r.sent_at) > new Date(joined);
    });

    if (data.length === 0) {
      set({recentBroadcasts: []});
      return;
    }

    // Fetch sender names
    const senderIds = [...new Set(data.map((r: any) => r.organizer_id))];
    const {data: profiles} = await supabase
      .from('profiles')
      .select('id, first_name, last_name, poolie_name, display_name_preference')
      .in('id', senderIds);

    const nameMap: Record<string, string> = {};
    for (const p of profiles ?? []) {
      const pref = p.display_name_preference ?? 'first_name';
      if (pref === 'poolie_name' && p.poolie_name) {
        nameMap[p.id] = p.poolie_name;
      } else {
        nameMap[p.id] = [p.first_name, p.last_name?.charAt(0)]
          .filter(Boolean)
          .join(' ') || 'Organizer';
      }
    }

    const poolNameMap: Record<string, string> = {};
    for (const p of userPools) {
      poolNameMap[p.id] = p.name;
    }

    const broadcasts = data.map((r: any) => ({
      poolId: r.pool_id,
      poolName: poolNameMap[r.pool_id] ?? 'Pool',
      message: r.message,
      sentAt: r.sent_at,
      senderName: nameMap[r.organizer_id] ?? 'Organizer',
    }));

    set({recentBroadcasts: broadcasts});
  },

  // ---------------------------------------------------------------------------
  // Global pool auto-enrollment
  // ---------------------------------------------------------------------------
  ensureGlobalPoolMembership: async () => {
    const userId = get().user?.id;
    if (!userId) return;

    // Call the SECURITY DEFINER RPC — enrolls user in all active global pools
    await supabase.rpc('auto_enroll_global_pools');
  },

  // ---------------------------------------------------------------------------
  // Brand config
  // ---------------------------------------------------------------------------
  activeBrandConfig: null,
  setActiveBrandConfig: config => set({activeBrandConfig: config}),
  updatePoolBrandConfig: (poolId, config) => {
    // Mirror into visiblePools too — see note in archivePool / updatePoolSettings.
    const asRecord = config as Record<string, unknown> | null;
    const applyBrand = (p: DbPool) =>
      p.id === poolId ? {...p, brand_config: asRecord} : p;
    set(state => ({
      userPools: state.userPools.map(applyBrand),
      visiblePools: state.visiblePools.map(applyBrand),
      // If this is the active pool, also update the global theme. The
      // theme reads BrandConfig shape; the cast is safe because a
      // partner's brand_config carries the same keys as BrandConfig
      // (partner_name, primary_color, logo, ...).
      ...(state.activePoolId === poolId
        ? {activeBrandConfig: config as BrandConfig | null}
        : {}),
    }));
  },

  // ---------------------------------------------------------------------------
  // Feature flags
  // ---------------------------------------------------------------------------
  showGlobalPool: false,

  // ---------------------------------------------------------------------------
  // History & Hardware
  // ---------------------------------------------------------------------------
  userHardware: [],
  hasHistory: false,
  historyVisibility: 'pools_only',
  playerArchetype: null,

  loadUserHardware: async () => {
    const userId = get().user?.id;
    if (!userId) return;

    const {data} = await supabase
      .from('user_hardware')
      .select('*')
      .eq('user_id', userId)
      .order('awarded_at', {ascending: false});

    const items: UserHardwareItem[] = (data ?? []).map((r: any) => ({
      id: r.id,
      hardwareSlug: r.hardware_slug,
      hardwareName: r.hardware_name,
      category: r.category,
      scope: r.scope,
      competition: r.competition,
      seasonYear: r.season_year,
      week: r.week,
      poolId: r.pool_id,
      contextJson: r.context_json ?? {},
      awardedAt: r.awarded_at,
      isVisible: r.is_visible,
    }));

    // Check if user has any history (non-no-show week in current competition)
    const competition = nflSeason.competition;
    const {count, error: countError} = await supabase
      .from('season_user_totals')
      .select('id', {count: 'exact', head: true})
      .eq('user_id', userId)
      .eq('competition', competition)
      .eq('is_no_show', false);

    // Read visibility preference from profile
    const profile = get().userProfile;
    const visibility = (profile as any)?.history_visibility ?? 'pools_only';

    set({
      userHardware: items,
      hasHistory: (count ?? 0) > 0,
      historyVisibility: visibility,
    });

    // Compute archetype after loading hardware
    get().computePlayerArchetype();
  },

  updateHistoryVisibility: async (v: 'private' | 'pools_only' | 'public') => {
    const userId = get().user?.id;
    if (!userId) return;

    await supabase
      .from('profiles')
      .update({history_visibility: v})
      .eq('id', userId);

    set({historyVisibility: v});
  },

  computePlayerArchetype: () => {
    const hardware = get().userHardware;
    const profile = get().userProfile;
    if (!hardware.length || !profile) {
      set({playerArchetype: null});
      return;
    }

    // Count career stats from hardware
    const poolChampionCount = hardware.filter(h => h.hardwareSlug === 'pool_champion').length;
    const poolChampionPools = new Set(hardware.filter(h => h.hardwareSlug === 'pool_champion').map(h => h.poolId)).size;
    const ironPoolieCount = hardware.filter(h => h.hardwareSlug === 'iron_poolie').length;
    const gunslingerCount = hardware.filter(h => h.hardwareSlug === 'gunslinger_week').length;
    const sharpshooterCount = hardware.filter(h => h.hardwareSlug === 'sharpshooter_week').length;

    // Career stats from profiles table
    const careerCorrect = (profile as any).career_picks_correct ?? 0;
    const careerTotal = (profile as any).career_picks_total ?? 0;
    const careerHPCorrect = (profile as any).career_hotpick_correct ?? 0;
    const careerHPTotal = (profile as any).career_hotpick_total ?? 0;
    const careerPickRate = careerTotal > 0 ? careerCorrect / careerTotal : 0;
    const careerHPRate = careerHPTotal > 0 ? careerHPCorrect / careerHPTotal : 0;

    // Determine archetype by priority
    // The Closer: Pool Champion in 2+ different pools
    if (poolChampionCount >= 2 && poolChampionPools >= 2) {
      set({
        playerArchetype: {
          label: 'The Closer',
          description: `You know how to finish. ${poolChampionCount} Contest Championships across ${poolChampionPools} different Contests.`,
        },
      });
      return;
    }

    // The Sharpshooter: career regular pick win rate >= 65%
    if (careerTotal >= 100 && careerPickRate >= 0.65) {
      set({
        playerArchetype: {
          label: 'The Sharpshooter',
          description: `Pure knowledge. You've hit ${Math.round(careerPickRate * 100)}% of your regular picks across your career.`,
        },
      });
      return;
    }

    // The Gunslinger: frequent high-rank HotPick wins
    if (gunslingerCount >= 3) {
      set({
        playerArchetype: {
          label: 'The Gunslinger',
          description: `You go big. ${gunslingerCount} Gunslinger awards. It's cost you. It's also won you ${poolChampionCount} Contest${poolChampionCount !== 1 ? 's' : ''}.`,
        },
      });
      return;
    }

    // The Grinder: Iron Poolie in 2+ seasons
    if (ironPoolieCount >= 2) {
      set({
        playerArchetype: {
          label: 'The Grinder',
          description: `Never missed a week. ${ironPoolieCount} Iron Player awards. ${careerCorrect} correct picks. Quietly dangerous.`,
        },
      });
      return;
    }

    // No archetype threshold met — show nothing
    set({playerArchetype: null});
  },

  // ---------------------------------------------------------------------------
  // Home Redesign §6.6 — Last-week HotPick recap + Week Mini-Strip
  // ---------------------------------------------------------------------------
  // Both queries respect Hard Rule #3 (client never computes scores). They
  // read pre-computed values: season_picks.is_correct for the last-week
  // HotPick chip, and season_user_totals.week_points for the week strip.
  // No SUM or AVG happens here.
  // ---------------------------------------------------------------------------
  lastWeekHotPick: null,
  recentWeeks: [],
  hotPickHitRate: null,
  loadHotPickHitRate: async (userId, competition) => {
    // Weeks with is_hotpick_correct = null had no HotPick attempt and
    // don't count toward numerator or denominator.
    const {data} = await supabase
      .from('season_user_totals')
      .select('is_hotpick_correct')
      .eq('user_id', userId)
      .eq('competition', competition);
    if (!data) {
      set({hotPickHitRate: null});
      return;
    }
    let hits = 0;
    let total = 0;
    for (const row of data as Array<{is_hotpick_correct: boolean | null}>) {
      if (row.is_hotpick_correct == null) continue;
      total += 1;
      if (row.is_hotpick_correct) hits += 1;
    }
    set({hotPickHitRate: total > 0 ? {hits, total} : null});
  },

  loadLastWeekHotPick: async (userId, competition, currentWeek) => {
    if (currentWeek <= 1) {
      set({lastWeekHotPick: null});
      return;
    }
    const targetWeek = currentWeek - 1;

    // Read the user's HotPick row for the prior week. is_correct + points
    // are server-computed by the scoring Edge Function; we only display.
    const {data: pick} = await supabase
      .from('season_picks')
      .select('picked_team, is_correct, points')
      .eq('user_id', userId)
      .eq('competition', competition)
      .eq('week', targetWeek)
      .eq('is_hotpick', true)
      .maybeSingle();

    if (!pick || pick.is_correct == null) {
      set({lastWeekHotPick: null});
      return;
    }

    set({
      lastWeekHotPick: {
        team:      pick.picked_team,
        isCorrect: pick.is_correct,
        points:    pick.points ?? 0,
      },
    });
  },

  loadRecentWeeks: async (userId, competition) => {
    // Pre-computed per-week totals. Last 4 weeks descending; display ascending.
    const {data} = await supabase
      .from('season_user_totals')
      .select('week, week_points, correct_picks, total_picks')
      .eq('user_id', userId)
      .eq('competition', competition)
      .order('week', {ascending: false})
      .limit(4);

    const rows = (data ?? []) as Array<{
      week: number;
      week_points: number | null;
      correct_picks: number | null;
      total_picks: number | null;
    }>;
    // Per-week earned is `week_points`. `playoff_points` is NOT a separate
    // bucket — the scoring fn sets it equal to week_points for weeks ≥ 19 so
    // the playoff-scoped leaderboard can sum it. Adding both double-counts
    // playoff weeks (a +12 week rendered as +24).
    const ascending = [...rows].reverse().map(r => ({
      week:         r.week,
      total:        r.week_points ?? 0,
      correctPicks: r.correct_picks ?? 0,
      totalPicks:   r.total_picks ?? 0,
    }));
    set({recentWeeks: ascending});
  },

  // ---------------------------------------------------------------------------
  // Home Redesign §6.4.6 — Pool Module indicators + rank batch
  // ---------------------------------------------------------------------------
  poolIndicators: {},

  loadPoolIndicators: async (userId, poolIds) => {
    if (poolIds.length === 0) {
      set({poolIndicators: {}});
      return;
    }

    // One aggregated query across all pools — never N+1 per Module.
    // Counts organizer_notifications.sent_at > notification_read_state.last_read_at.
    const [unreadResult, readStateResult] = await Promise.all([
      supabase
        .from('organizer_notifications')
        .select('pool_id, sent_at')
        .in('pool_id', poolIds)
        .order('sent_at', {ascending: false}),
      supabase
        .from('notification_read_state')
        .select('pool_id, last_read_at')
        .in('pool_id', poolIds)
        .eq('user_id', userId),
    ]);

    const lastReadByPool = new Map<string, string>();
    for (const row of (readStateResult.data ?? []) as Array<{
      pool_id: string;
      last_read_at: string;
    }>) {
      lastReadByPool.set(row.pool_id, row.last_read_at);
    }

    const indicators: Record<string, {orgUnread: number; mostRecentAt: string | null}> = {};
    for (const pid of poolIds) {
      indicators[pid] = {orgUnread: 0, mostRecentAt: null};
    }

    for (const row of (unreadResult.data ?? []) as Array<{
      pool_id: string;
      sent_at: string;
    }>) {
      const cell = indicators[row.pool_id];
      if (!cell) continue;
      const lastRead = lastReadByPool.get(row.pool_id);
      // If we've never visited the pool's notifications, EVERYTHING is unread.
      if (!lastRead || row.sent_at > lastRead) {
        cell.orgUnread += 1;
      }
      // mostRecentAt = the newest sent_at we've seen for this pool (any read state).
      if (!cell.mostRecentAt || row.sent_at > cell.mostRecentAt) {
        cell.mostRecentAt = row.sent_at;
      }
    }

    set({poolIndicators: indicators});
  },

  markOrgNotificationsRead: async (userId, poolId) => {
    const now = new Date().toISOString();
    // Upsert by (user_id, pool_id) — primary key composite. RLS allows
    // user to insert/update their own rows only.
    await supabase
      .from('notification_read_state')
      .upsert(
        {user_id: userId, pool_id: poolId, last_read_at: now},
        {onConflict: 'user_id,pool_id'},
      );
    set(state => ({
      poolIndicators: {
        ...state.poolIndicators,
        [poolId]: {...(state.poolIndicators[poolId] ?? {mostRecentAt: null}), orgUnread: 0},
      },
    }));
  },

  userRankByPool: {},

  weekRankByPool: {},
  loadWeekRankByPool: async (userId, poolIds, competition, week) => {
    if (poolIds.length === 0 || week <= 0) {
      weekRankLatestTag = '';
      set({weekRankByPool: {}});
      return;
    }
    weekRankLatestTag = `${competition}::${week}`;
    const {data: members} = await supabase
      .from('pool_members')
      .select('pool_id, user_id')
      .in('pool_id', poolIds)
      .eq('status', 'active');
    if (!members) {
      set({weekRankByPool: {}});
      return;
    }
    const memberIds = [...new Set(members.map((r: any) => r.user_id))];
    if (memberIds.length === 0) {
      set({weekRankByPool: {}});
      return;
    }
    const {data: totals} = await supabase
      .from('season_user_totals')
      .select('user_id, week_points')
      .eq('competition', competition)
      .eq('week', week)
      .in('user_id', memberIds);
    const pointsByUser: Record<string, number> = {};
    for (const r of totals ?? []) {
      pointsByUser[(r as any).user_id] =
        (pointsByUser[(r as any).user_id] ?? 0) + ((r as any).week_points ?? 0);
    }
    const membersByPool: Record<string, string[]> = {};
    for (const row of members) {
      const pid = (row as any).pool_id as string;
      const uid = (row as any).user_id as string;
      if (!membersByPool[pid]) membersByPool[pid] = [];
      membersByPool[pid].push(uid);
    }
    const map: Record<string, {rank: number; memberCount: number; weekPoints: number}> = {};
    for (const pid of Object.keys(membersByPool)) {
      const ids = membersByPool[pid];
      const ranked = ids
        .map(uid => ({uid, pts: pointsByUser[uid] ?? 0}))
        .sort((a, b) => b.pts - a.pts);
      const idx = ranked.findIndex(r => r.uid === userId);
      if (idx === -1) continue;
      map[pid] = {
        rank: idx + 1,
        memberCount: ids.length,
        weekPoints: ranked[idx].pts,
      };
    }
    // Race-condition guard — discard if a newer call has already been
    // issued for a different (week, competition) tuple. Avoids the
    // late-response-overwrite bug without a cross-store import.
    const tag = `${competition}::${week}`;
    if (weekRankLatestTag !== tag) return;
    set({weekRankByPool: map});
  },

  loadUserRankByPool: async (userId, poolIds) => {
    if (poolIds.length === 0) {
      set({userRankByPool: {}});
      return;
    }

    // One RPC round trip for all pools at once.
    const {data, error} = await supabase.rpc('get_user_ranks_in_pools', {
      p_user_id:  userId,
      p_pool_ids: poolIds,
    });

    if (error || !data) {
      set({userRankByPool: {}});
      return;
    }

    const map: Record<string, {rank: number; memberCount: number; total: number}> = {};
    for (const row of data as Array<{
      pool_id: string;
      user_rank: number;
      member_count: number;
      user_total: number;
    }>) {
      map[row.pool_id] = {
        rank:        row.user_rank,
        memberCount: row.member_count,
        total:       row.user_total,
      };
    }
    set({userRankByPool: map});
  },

  // ---------------------------------------------------------------------------
  // Home Redesign §6.4.7 — Partner Module data + indicators
  // ---------------------------------------------------------------------------
  partnersById: {},
  activePartnerIds: [],
  loadActivePartners: async () => {
    // Fetch every active partner with a configured perk — these populate
    // the "YOUR PARTNERS" section on Home regardless of whether the user
    // has a pool aligned with them.
    const {data} = await supabase
      .from('partners')
      .select('id, name, slug, perk_text, perk_icon, brand_config')
      .eq('is_active', true)
      .not('perk_text', 'is', null);
    if (!data) {
      set({activePartnerIds: []});
      return;
    }
    const rows = data as Array<{
      id: string;
      name: string;
      slug: string;
      perk_text: string | null;
      perk_icon: string | null;
      brand_config: Record<string, unknown> | null;
    }>;
    const map: Record<string, {
      id: string;
      name: string;
      slug: string;
      perk_text: string | null;
      perk_icon: string | null;
      logo_url: string | null;
      primary_color: string | null;
    }> = {};
    const ids: string[] = [];
    for (const row of rows) {
      const bc = (row.brand_config ?? {}) as Record<string, unknown>;
      const logo = (bc.logo ?? {}) as Record<string, unknown>;
      // Tolerate both brand_config logo shapes (REFERENCE.md §15): the
      // nested `logo.full` (current) and the legacy flat `logo_url`
      // some partners still carry. Without the flat fallback, those
      // Clubs render a LogoMark initials block on partner tiles even
      // though the Contest card below correctly resolves the same
      // legacy field via its own helper.
      const logoUrl =
        typeof logo.full === 'string' && logo.full.length > 0
          ? (logo.full as string)
          : typeof bc.logo_url === 'string' && (bc.logo_url as string).length > 0
            ? (bc.logo_url as string)
            : null;
      map[row.id] = {
        id:            row.id,
        name:          row.name,
        slug:          row.slug,
        perk_text:     row.perk_text,
        perk_icon:     row.perk_icon,
        logo_url:      logoUrl,
        primary_color: typeof bc.primary_color === 'string' ? bc.primary_color : null,
      };
      ids.push(row.id);
    }
    // Merge into partnersById so existing aligned-partner lookups still
    // work; broader set just expands what's known.
    set(state => ({
      partnersById: {...state.partnersById, ...map},
      activePartnerIds: ids,
    }));
  },

  loadAlignedPartners: async (partnerIds) => {
    if (partnerIds.length === 0) {
      set({partnersById: {}});
      return;
    }

    // Load every active Club the user is connected to via their Contests
    // — Official Clubs, affiliated Clubs, legacy partner_id Clubs.
    // (Earlier this filtered to perks-only per spec §6.4.7, but the home
    // YOUR CLUBS list is now the authoritative "Clubs you're connected
    // to" surface; Clubs without perks still belong there.)
    const {data} = await supabase
      .from('partners')
      .select('id, name, slug, perk_text, perk_icon, brand_config')
      .in('id', partnerIds)
      .eq('is_active', true);

    const map: Record<string, {
      id: string;
      name: string;
      slug: string;
      perk_text: string | null;
      perk_icon: string | null;
      logo_url: string | null;
      primary_color: string | null;
    }> = {};

    for (const row of (data ?? []) as Array<{
      id: string;
      name: string;
      slug: string;
      perk_text: string | null;
      perk_icon: string | null;
      brand_config: Record<string, unknown> | null;
    }>) {
      const bc = (row.brand_config ?? {}) as Record<string, unknown>;
      const logo = (bc.logo ?? {}) as Record<string, unknown>;
      // Tolerate both brand_config logo shapes (REFERENCE.md §15): the
      // nested `logo.full` (current) and the legacy flat `logo_url`
      // some partners still carry. Without the flat fallback, those
      // Clubs render a LogoMark initials block on partner tiles even
      // though the Contest card below correctly resolves the same
      // legacy field via its own helper.
      const logoUrl =
        typeof logo.full === 'string' && logo.full.length > 0
          ? (logo.full as string)
          : typeof bc.logo_url === 'string' && (bc.logo_url as string).length > 0
            ? (bc.logo_url as string)
            : null;
      map[row.id] = {
        id:            row.id,
        name:          row.name,
        slug:          row.slug,
        perk_text:     row.perk_text,
        perk_icon:     row.perk_icon,
        logo_url:      logoUrl,
        primary_color: typeof bc.primary_color === 'string' ? bc.primary_color : null,
      };
    }
    set({partnersById: map});
  },

  partnerIndicators: {},

  loadPartnerIndicators: async (userId, partnerIds) => {
    if (partnerIds.length === 0) {
      set({partnerIndicators: {}});
      return;
    }

    // Parallel queries (notifications + read-state) — never per-Module.
    const [notifResult, readStateResult] = await Promise.all([
      supabase
        .from('partner_notifications')
        .select('partner_id, sent_at')
        .in('partner_id', partnerIds)
        .order('sent_at', {ascending: false}),
      supabase
        .from('partner_notification_read_state')
        .select('partner_id, last_read_at')
        .in('partner_id', partnerIds)
        .eq('user_id', userId),
    ]);

    const lastReadByPartner = new Map<string, string>();
    for (const row of (readStateResult.data ?? []) as Array<{
      partner_id: string;
      last_read_at: string;
    }>) {
      lastReadByPartner.set(row.partner_id, row.last_read_at);
    }

    const indicators: Record<string, {unread: number; mostRecentAt: string | null}> = {};
    for (const pid of partnerIds) {
      indicators[pid] = {unread: 0, mostRecentAt: null};
    }

    for (const row of (notifResult.data ?? []) as Array<{
      partner_id: string;
      sent_at: string;
    }>) {
      const cell = indicators[row.partner_id];
      if (!cell) continue;
      const lastRead = lastReadByPartner.get(row.partner_id);
      if (!lastRead || row.sent_at > lastRead) {
        cell.unread += 1;
      }
      if (!cell.mostRecentAt || row.sent_at > cell.mostRecentAt) {
        cell.mostRecentAt = row.sent_at;
      }
    }

    set({partnerIndicators: indicators});
  },

  markPartnerNotificationsRead: async (userId, partnerId) => {
    const now = new Date().toISOString();
    await supabase
      .from('partner_notification_read_state')
      .upsert(
        {user_id: userId, partner_id: partnerId, last_read_at: now},
        {onConflict: 'user_id,partner_id'},
      );
    set(state => ({
      partnerIndicators: {
        ...state.partnerIndicators,
        [partnerId]: {
          ...(state.partnerIndicators[partnerId] ?? {mostRecentAt: null}),
          unread: 0,
        },
      },
    }));
  },

  poolAffiliations: {},

  loadPoolAffiliations: async (poolIds) => {
    if (poolIds.length === 0) {
      set({poolAffiliations: {}});
      return;
    }

    // One query for all pools. RLS gates SELECT to active members of each
    // pool, so this is safe to call with the full visible pool list.
    const {data, error} = await supabase
      .from('pool_partner_affiliations')
      .select('pool_id, partner_id, brand_config_snapshot, is_primary, created_at')
      .in('pool_id', poolIds);

    if (error) {
      // Don't blow away existing data on transient failures.
      return;
    }

    type Row = {
      pool_id:               string;
      partner_id:            string;
      brand_config_snapshot: Record<string, unknown> | null;
      is_primary:            boolean;
      created_at:            string;
    };

    const byPool: Record<string, PoolAffiliation[]> = {};
    for (const pid of poolIds) byPool[pid] = [];

    for (const row of (data ?? []) as Row[]) {
      const bc   = (row.brand_config_snapshot ?? {}) as Record<string, unknown>;
      const logo = (bc.logo ?? {}) as Record<string, unknown>;
      const logoUrl =
        typeof logo.full === 'string' && logo.full.length > 0
          ? logo.full
          : typeof bc.logo_url === 'string' && bc.logo_url.length > 0
          ? bc.logo_url
          : null;
      const colorOrNull = (key: string): string | null =>
        typeof bc[key] === 'string' && (bc[key] as string).length > 0
          ? (bc[key] as string)
          : null;
      const brandColors = {
        primary:    colorOrNull('primary_color'),
        secondary:  colorOrNull('secondary_color'),
        background: colorOrNull('background_color'),
        highlight:  colorOrNull('highlight_color'),
      };
      const partnerName =
        typeof bc.partner_name === 'string' && bc.partner_name.length > 0
          ? bc.partner_name
          : 'League';

      byPool[row.pool_id]?.push({
        partnerId:    row.partner_id,
        partnerName,
        brandColors,
        logoUrl,
        isPrimary:    row.is_primary,
      });
    }

    // Sort each pool's affiliations: primary first, then by partner name.
    for (const pid of Object.keys(byPool)) {
      byPool[pid].sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.partnerName.localeCompare(b.partnerName, undefined, {
          sensitivity: 'base',
        });
      });
    }

    // Merge — never replace — so a single-pool refresh from
    // PoolSettings / PartnerDirectory doesn't clobber the rest of the
    // map loaded by HomeScreen's all-pool fetch.
    set(state => ({poolAffiliations: {...state.poolAffiliations, ...byPool}}));
  },
}));
