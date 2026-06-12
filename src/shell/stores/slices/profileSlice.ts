// Profile, managed-League resolution, visible-competition gating, and
// onboarding/TOS helper actions for the global store. Extracted verbatim;
// receives the store's own set/get (these cross-call setActiveSport and each
// other through the merged store). Pick<GlobalState> makes tsc verify the set.
import type {StoreApi} from 'zustand';
import {supabase} from '@shared/config/supabase';
import {getAllEventsUnfiltered} from '@sports/registry';
import {isSandboxCompetition} from '@shared/utils/competition';
import type {DbProfile} from '@shared/types/database';
import type {GlobalState} from '../globalStore.types';

type Set = StoreApi<GlobalState>['setState'];
type Get = StoreApi<GlobalState>['getState'];

type ProfileSlice = Pick<
  GlobalState,
  | 'userProfile'
  | 'managedClub'
  | 'visibleCompetitions'
  | 'visibleCompetitionsLoaded'
  | 'priorSportHistory'
  | 'loadPriorSportHistory'
  | 'loadVisibleCompetitions'
  | 'loadManagedClub'
  | 'fetchProfile'
  | 'updateProfile'
  | 'needsProfileSetup'
  | 'needsTosAcceptance'
  | 'acceptTos'
  | 'fetchCurrentTosVersion'
  | 'needsTosUpdate'
>;

export const createProfileSlice = (set: Set, get: Get): ProfileSlice => ({
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
      .select('id, name, club_pool_id, brand_config')
      .eq('id', membership.partner_id)
      .eq('is_active', true)
      .limit(1);
    const row = (partnerRows ?? [])[0] as
      | {id: string; name: string; club_pool_id: string | null; brand_config: any}
      | undefined;
    // Logo for the board-discovery tile. brand_config carries either a nested
    // logo.full or a flat logo_url (REFERENCE §15 shape drift) — tolerate both.
    const bc = row?.brand_config ?? null;
    const logo: string | null = bc?.logo?.full ?? bc?.logo_url ?? null;
    set({
      managedClub: row
        ? {
            id: row.id,
            name: row.name,
            clubPoolId: row.club_pool_id,
            role: membership.role,
            logo,
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
});
