import {create} from 'zustand';
import type {AnyEventConfig} from '@shared/types/templates';
import type {DbPool, DbProfile} from '@shared/types/database';
import type {BrandConfig} from '@shell/theme/types';
import {supabase} from '@shared/config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getAllEventsUnfiltered, getEventsByPriority, getDemoEvent, getEventByCompetition, DEMO_POOL_ID} from '@sports/registry';
import {deactivateDeviceTokens} from '@shell/services/pushNotifications';
import {setMonitoringUser} from '@shared/monitoring/sentry';
import {isSandboxCompetition} from '@shared/utils/competition';
import {createSmackUnreadSlice} from './slices/smackUnreadSlice';
import {createDelegateSlice} from './slices/delegateSlice';
import {createHistoryHardwareSlice} from './slices/historyHardwareSlice';
import {createBroadcastsSlice} from './slices/broadcastsSlice';
import {createAffiliationsSlice} from './slices/affiliationsSlice';
import {createHomeRecapSlice} from './slices/homeRecapSlice';
import {createPoolIndicatorsSlice} from './slices/poolIndicatorsSlice';
import {createPartnerModuleSlice} from './slices/partnerModuleSlice';
import {createPoolAdminSlice} from './slices/poolAdminSlice';
import type {GlobalState} from './globalStore.types';
// Re-exported so existing consumers keep importing these from globalStore.
export type {
  PoolAffiliation,
  PoolDelegate,
  UserHardwareItem,
  PlayerArchetype,
} from './globalStore.types';

const POOL_STORAGE_PREFIX = 'hotpick_active_pool_';
const DEFAULT_POOL_PREFIX = 'hotpick_default_pool_';

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

export const useGlobalStore = create<GlobalState>((set, get) => ({
  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  user: null,
  isAuthLoading: true,
  setUser: user => {
    // Tag monitoring events with the auth user id only (no PII). No-ops when
    // monitoring isn't active.
    setMonitoringUser(user?.id ?? null);
    set({user});
  },
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
    setMonitoringUser(null);
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
  // Pool administration: member mgmt, settings, broadcasts, global-pool enroll
  // (extracted into slices/poolAdminSlice.ts — same set/get, same behaviour)
  // ---------------------------------------------------------------------------
  ...createPoolAdminSlice(set, get),

  // Pool-board + partner-board (League) delegate management
  // (extracted into slices/delegateSlice.ts — pure RPC wrappers, same behaviour)
  ...createDelegateSlice(),

  // ---------------------------------------------------------------------------
  // SmackTalk unread counts, Realtime, and flagged-message counts
  // (extracted into slices/smackUnreadSlice.ts — same set/get, same behaviour)
  // ---------------------------------------------------------------------------
  ...createSmackUnreadSlice(set, get),

  // ---------------------------------------------------------------------------
  // Recent broadcasts (across user's pools)
  // (extracted into slices/broadcastsSlice.ts — same set/get, same behaviour)
  // ---------------------------------------------------------------------------
  ...createBroadcastsSlice(set, get),

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
  // History, hardware (career awards) & player archetype
  // (extracted into slices/historyHardwareSlice.ts — same set/get, same behaviour)
  // ---------------------------------------------------------------------------
  ...createHistoryHardwareSlice(set, get),

  // ---------------------------------------------------------------------------
  // Last-week HotPick recap + Week Mini-Strip (Home Redesign §6.6)
  // (extracted into slices/homeRecapSlice.ts — same set, same behaviour)
  // ---------------------------------------------------------------------------
  ...createHomeRecapSlice(set),

  // ---------------------------------------------------------------------------
  // Pool Module indicators + per-pool rank batch (Home Redesign §6.4.6)
  // (extracted into slices/poolIndicatorsSlice.ts — same set, same behaviour)
  // ---------------------------------------------------------------------------
  ...createPoolIndicatorsSlice(set),

  // ---------------------------------------------------------------------------
  // Partner Module data + indicators (Home Redesign §6.4.7)
  // (extracted into slices/partnerModuleSlice.ts — same set, same behaviour)
  // ---------------------------------------------------------------------------
  ...createPartnerModuleSlice(set),

  // Pool partner-affiliation (League) loading
  // (extracted into slices/affiliationsSlice.ts — same set/get, same behaviour)
  ...createAffiliationsSlice(set, get),
}));
