// Home composes the redesigned hero suite (HomeHeader → IdentityBar →
// StateHero → Insight → Pool/Partner stacks). All Supabase reads live
// in store loaders fired here so child modules can stay presentational.

import React, {useCallback, useEffect, useMemo} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {KeyRound, Plus} from 'lucide-react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {isScheduledStatus} from '@sports/nfl/utils/gameStatus';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useTheme} from '@shell/theme/hooks';
import {spacing, bodyType} from '@shared/theme';
import {ordinalSuffix} from '@shared/utils/format';

import {SystemMessageSlot} from '@shell/components/home/SystemMessageSlot';
import {HomeHeader} from '@shell/components/home/HomeHeader';
import {IdentityBar} from '@shell/components/home/IdentityBar';
import {ManagedLeagueModule} from '@shell/components/home/ManagedLeagueModule';
import {JoinPublicContestButton} from '@shell/components/home/JoinPublicContestButton';
import {StateHero} from '@shell/components/home/StateHero';
import {HeroSkeleton} from '@shell/components/home/HeroSkeleton';
import {CrossContestStrip} from '@shell/components/home/CrossContestStrip';
import {OffSeasonActions, PreSeasonActions, ReturningOffCycleActions} from '@shell/components/home/OffCycleActions';
import {Insight} from '@shell/components/home/Insight';
import {HomeInbox} from '@shell/components/home/HomeInbox';
import {ContestCarousel} from '@shell/components/home/ContestCarousel';
import {ContestActionPill, contestActionPillStyles} from '@shell/components/ContestActionPill';
import {PartnerModule} from '@shell/components/home/PartnerModule';
import {resolveHomeState} from '@shell/components/home/resolveHomeState';
import {LEXICON} from '@shared/lexicon';

export function HomeScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const userId       = useGlobalStore(s => s.user?.id);
  const visiblePools = useGlobalStore(s => s.visiblePools);
  const defaultPoolId = useGlobalStore(s => s.defaultPoolId);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const weekState    = useNFLStore(s => s.weekState);
  const currentWeek  = useNFLStore(s => s.currentWeek);
  const competition  = useNFLStore(s => s.competition);
  const configLoaded = useNFLStore(s => s.configLoaded);

  const loadLastWeekHotPick   = useGlobalStore(s => s.loadLastWeekHotPick);
  const loadRecentWeeks       = useGlobalStore(s => s.loadRecentWeeks);
  const loadHotPickHitRate    = useGlobalStore(s => s.loadHotPickHitRate);
  const loadPoolIndicators    = useGlobalStore(s => s.loadPoolIndicators);
  const loadUserRankByPool    = useGlobalStore(s => s.loadUserRankByPool);
  const loadPoolAffiliations  = useGlobalStore(s => s.loadPoolAffiliations);
  const loadWeekRankByPool    = useGlobalStore(s => s.loadWeekRankByPool);
  const loadAlignedPartners   = useGlobalStore(s => s.loadAlignedPartners);
  const loadActivePartners    = useGlobalStore(s => s.loadActivePartners);
  const poolAffiliations      = useGlobalStore(s => s.poolAffiliations);
  const loadPartnerIndicators = useGlobalStore(s => s.loadPartnerIndicators);
  const fetchUserPickStatus    = useNFLStore(s => s.fetchUserPickStatus);
  const fetchUserHotPick       = useNFLStore(s => s.fetchUserHotPick);
  const fetchWeekResult        = useNFLStore(s => s.fetchWeekResult);
  const fetchLiveScores        = useNFLStore(s => s.fetchLiveScores);
  const subscribeToLiveScores  = useNFLStore(s => s.subscribeToLiveScores);
  const fetchHighestRankedGame = useNFLStore(s => s.fetchHighestRankedGame);
  const fetchSeasonUserPicks   = useSeasonStore(s => s.fetchUserPicks);
  const fetchSeasonWeekGames   = useSeasonStore(s => s.fetchWeekGames);
  const fetchSeasonLeaderboard = useSeasonStore(s => s.fetchLeaderboard);
  const seasonInitialize       = useSeasonStore(s => s.initialize);
  const seasonConfig           = useSeasonStore(s => s.config);
  const activeSport            = useGlobalStore(s => s.activeSport);
  const activePoolId           = useGlobalStore(s => s.activePoolId);
  const subscribeToCompetitionConfig = useNFLStore(s => s.subscribeToCompetitionConfig);

  const homeState = useMemo(
    () => resolveHomeState(currentPhase, weekState),
    [currentPhase, weekState],
  );

  // Gate on configLoaded: until the real competition_config loads, the store
  // holds its defaults (REGULAR / picks_open / week 1), which would briefly
  // flash the Week 1 picks-open hero + CTA before the true phase (e.g.
  // PRE_SEASON) resolves on a cold launch / reviewer reload.
  const isPicksFlow =
    configLoaded &&
    (homeState === 'picks_open'   ||
     homeState === 'picks_locked' ||
     homeState === 'games_live');
  const showInsight      = isPicksFlow;
  // Everyone sees the hero + YOUR CONTESTS + YOUR CLUBS — the
  // off-cycle hero (OffSeasonHero etc.) plus the section headers and
  // their orientation copy carry the new-user onboarding directly on
  // the homescreen, so there's no separate ZeroPoolsHero overlay
  // anymore.
  const showHero         = true;
  const showPoolStack    = true;
  const showPartnerStack = true;

  // ---------------------------------------------------------------------------
  // Partition pools for the Pool stack + Partner stack.
  // ---------------------------------------------------------------------------
  const {privatePoolIds, alignedPoolsByPartner, partnerIds} = useMemo(() => {
    const privatePools: string[] = [];
    const alignedMap: Record<string, typeof visiblePools> = {};
    const partners: string[] = [];

    // A pool is connected to a Club when ANY of these are true:
    //   1. pool.owning_club_id is set (Official Club Contest)
    //   2. pool has rows in pool_partner_affiliations (multi-affiliate)
    //   3. pool.partner_id is set (legacy single-Club fallback)
    // All three feed YOUR CLUBS — every Club touching the user's pools
    // gets a tile, with the connected pools listed under it.
    const attach = (partnerId: string, pool: (typeof visiblePools)[number]) => {
      if (!alignedMap[partnerId]) {
        alignedMap[partnerId] = [];
        partners.push(partnerId);
      }
      // Avoid double-listing a pool under the same partner.
      if (!alignedMap[partnerId].some(x => x.id === pool.id)) {
        alignedMap[partnerId].push(pool);
      }
    };

    for (const p of visiblePools) {
      const affiliates = poolAffiliations[p.id] ?? [];
      const hasClubConnection =
        !!p.owning_club_id || affiliates.length > 0 || !!p.partner_id;

      if (!hasClubConnection) {
        privatePools.push(p.id);
        continue;
      }

      if (p.owning_club_id) attach(p.owning_club_id, p);
      for (const a of affiliates) attach(a.partnerId, p);
      // Legacy single-Club fallback — only use it when the affiliations
      // slice hasn't populated yet (matches PoolModule's behavior).
      if (affiliates.length === 0 && p.partner_id) attach(p.partner_id, p);
    }
    return {
      privatePoolIds:        privatePools,
      alignedPoolsByPartner: alignedMap,
      partnerIds:            partners,
    };
  }, [visiblePools, poolAffiliations]);

  // Default pool pins to the top of the Home pool stack; the rest sort
  // alphabetically. Set via the star icon in Settings → My Pools.
  const sortedVisiblePools = useMemo(() => {
    const byName = [...visiblePools].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '', undefined, {sensitivity: 'base'}),
    );
    if (!defaultPoolId) return byName;
    const idx = byName.findIndex(p => p.id === defaultPoolId);
    if (idx <= 0) return byName;
    const [pinned] = byName.splice(idx, 1);
    return [pinned, ...byName];
  }, [visiblePools, defaultPoolId]);

  const allPoolIds = useMemo(() => visiblePools.map(p => p.id), [visiblePools]);
  const liveScores = useNFLStore(s => s.liveScores);

  // Derived flags — kept stable so dependent effects don't re-fire on
  // every Realtime score push.
  const someGameStarted = useMemo(
    () => Object.values(liveScores).some(g => !isScheduledStatus(g.status)),
    [liveScores],
  );
  const pastKickoff =
    homeState === 'picks_locked' ||
    homeState === 'games_live'   ||
    homeState === 'settling'     ||
    homeState === 'complete';

  // Re-subscribe whenever the active competition changes. The channel filters
  // competition_config UPDATEs by `competition=eq.<id>`, captured at call time
  // from the store. Without `competition` in the deps, a home screen that
  // mounts on the default nfl_2026 before the beta force-land flips the store
  // to nfl_2025_sim stays bound to the wrong competition forever — so live
  // week_state / current_phase changes (e.g. from the season simulator) never
  // arrive and the CTA hero + HotPick never advance.
  useEffect(() => {
    const unsub = subscribeToCompetitionConfig();
    return unsub;
  }, [subscribeToCompetitionConfig, competition]);

  // Refetch the live slices whenever Home regains focus. Realtime is the
  // primary update path, but a missed event (socket hiccup, or just sitting on
  // another tab while week_state advanced) would otherwise leave Home stale
  // until a manual pull-to-refresh. AppState's foreground refetch only fires on
  // OS background→active, not in-app tab switches — this covers that gap so
  // returning to Home always shows current state. Cheap + idempotent; skips the
  // first focus since mount already fetched everything.
  const didFocusInit = React.useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!didFocusInit.current) {
        didFocusInit.current = true;
        return;
      }
      if (!userId || !competition) return;
      const nfl = useNFLStore.getState();
      nfl.fetchCompetitionConfig().catch(() => {});
      if (currentWeek > 0) {
        nfl.fetchUserPickStatus(userId).catch(() => {});
        nfl.fetchUserHotPick(userId, currentWeek).catch(() => {});
        nfl.fetchLiveScores().catch(() => {});
      }
      if (allPoolIds.length > 0) {
        loadPoolIndicators(userId, allPoolIds).catch(() => {});
        loadUserRankByPool(userId, allPoolIds).catch(() => {});
      }
    }, [userId, competition, currentWeek, allPoolIds, loadPoolIndicators, loadUserRankByPool]),
  );

  useEffect(() => {
    if (!userId || !competition) return;
    loadLastWeekHotPick(userId, competition, currentWeek).catch(() => {});
    loadRecentWeeks(userId, competition).catch(() => {});
    loadHotPickHitRate(userId, competition).catch(() => {});
  }, [userId, competition, currentWeek, loadLastWeekHotPick, loadRecentWeeks, loadHotPickHitRate]);

  useEffect(() => {
    if (!userId) return;
    loadPoolIndicators(userId, allPoolIds).catch(() => {});
  }, [userId, allPoolIds, loadPoolIndicators]);

  // Affiliations drive the 3-state Contest card. Cheap one-shot query
  // gated by RLS to the user's own pools; no Realtime subscription —
  // Gaffer edits to affiliations are infrequent and a re-mount picks
  // them up.
  useEffect(() => {
    if (allPoolIds.length === 0) return;
    loadPoolAffiliations(allPoolIds).catch(() => {});
  }, [allPoolIds, loadPoolAffiliations]);

  useEffect(() => {
    if (!userId) return;
    loadUserRankByPool(userId, allPoolIds).catch(() => {});
  }, [userId, allPoolIds, loadUserRankByPool]);

  useEffect(() => {
    if (!userId || !competition || currentWeek <= 0 || allPoolIds.length === 0) return;
    if (!someGameStarted && !pastKickoff) return;
    loadWeekRankByPool(userId, allPoolIds, competition, currentWeek).catch(() => {});
  }, [userId, competition, currentWeek, allPoolIds, someGameStarted, pastKickoff, loadWeekRankByPool]);

  useEffect(() => {
    loadAlignedPartners(partnerIds).catch(() => {});
  }, [partnerIds, loadAlignedPartners]);

  useEffect(() => {
    loadActivePartners().catch(() => {});
  }, [loadActivePartners]);

  useEffect(() => {
    if (!userId) return;
    loadPartnerIndicators(userId, partnerIds).catch(() => {});
  }, [userId, partnerIds, loadPartnerIndicators]);

  // Fetch the user's pick status + HotPick once config has loaded and on each
  // week change. The config subscription only clears the HotPick on an actual
  // week rollover (not on same-week transitions), and currentWeek changing then
  // re-runs this to load the new week's HotPick. configLoaded gates the initial
  // load so it doesn't fire with a stale currentWeek before config resolves.
  useEffect(() => {
    if (!configLoaded) return;
    if (!userId || !competition || currentWeek <= 0) return;
    fetchUserPickStatus(userId).catch(() => {});
    fetchUserHotPick(userId, currentWeek).catch(() => {});
  }, [userId, competition, currentWeek, configLoaded, fetchUserPickStatus, fetchUserHotPick]);

  // Live scores re-fetch on currentWeek change — fetchLiveScores REPLACES
  // (not merges) so last week's final entries are wiped, preventing
  // "every game final" weekComplete from sticking after rollover.
  useEffect(() => {
    if (!competition || currentWeek <= 0) return;
    fetchLiveScores().catch(() => {});
    fetchHighestRankedGame().catch(() => {});
    const unsub = subscribeToLiveScores();
    return unsub;
  }, [competition, currentWeek, fetchLiveScores, fetchHighestRankedGame, subscribeToLiveScores]);

  // Bootstrap seasonStore.config from Home too — MainTabNavigator runs
  // initialize as well, but only after activeSport + activePoolId resolve.
  // On iOS that can land later than the first Home render.
  useEffect(() => {
    if (!activeSport || activeSport.templateType !== 'season') return;
    if (!activePoolId) return;
    if (seasonConfig && seasonConfig.competition === activeSport.competition) return;
    seasonInitialize(activeSport, activePoolId).catch(() => {});
  }, [activeSport, activePoolId, seasonConfig, seasonInitialize]);

  useEffect(() => {
    if (!userId || currentWeek <= 0) return;
    fetchSeasonUserPicks(userId, currentWeek).catch(() => {});
    fetchSeasonWeekGames(currentWeek).catch(() => {});
  }, [userId, currentWeek, fetchSeasonUserPicks, fetchSeasonWeekGames, seasonConfig]);

  useEffect(() => {
    if (!seasonConfig) return;
    fetchSeasonLeaderboard().catch(() => {});
  }, [seasonConfig, currentWeek, homeState, fetchSeasonLeaderboard]);

  // Populate this week's result for the settling/complete heroes ("This week
  // +N pts"). Reads the user's season_user_totals row; without this weekResult
  // stays null and the hero shows +0.
  useEffect(() => {
    if (!userId || !competition || currentWeek <= 0) return;
    if (homeState !== 'settling' && homeState !== 'complete') return;
    fetchWeekResult(userId, currentWeek).catch(() => {});
  }, [userId, competition, currentWeek, homeState, configLoaded, fetchWeekResult]);

  // While the backend is computing final scores, season_user_totals
  // updates aren't pushed via Realtime — poll the season aggregates so
  // SEASON PTS / recent weeks / hit rate roll forward.
  useEffect(() => {
    if (homeState !== 'settling') return;
    if (!userId || !competition) return;
    const tick = () => {
      fetchSeasonLeaderboard().catch(() => {});
      loadRecentWeeks(userId, competition).catch(() => {});
      loadHotPickHitRate(userId, competition).catch(() => {});
      fetchWeekResult(userId, currentWeek).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [
    homeState,
    userId,
    competition,
    currentWeek,
    fetchSeasonLeaderboard,
    loadRecentWeeks,
    loadHotPickHitRate,
    fetchWeekResult,
  ]);

  // Off-cycle (off-season / pre-season): a returning user who already has
  // Contests set up for the upcoming season should see them, not just the
  // Create/Join action stack. visiblePools is already scoped to the active
  // competition (e.g. nfl_2026), so these ARE the upcoming-season Contests.
  // Off-cycle (off-season / pre-season) contests now use the same swipe
  // carousel as the in-cycle YOUR CONTESTS section, so the experience is
  // consistent across all phases (per Tom, 2026-06-15).
  const offCycleContests = visiblePools.length > 0 ? (
    <ContestCarousel pools={sortedVisiblePools} />
  ) : null;

  // Off-cycle Clubs: if the user's upcoming-season Contests carry valid Club
  // affiliations (partnerIds, derived from visiblePools above), show the real
  // YOUR CLUBS stack instead of the generic one-line teaser.
  const offCycleClubs = partnerIds.length > 0 ? (
    <View style={styles.section}>
      <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textTertiary}]}>
        YOUR {LEXICON.league.plural.toUpperCase()}
      </Text>
      {partnerIds.map(pid => (
        <PartnerModule key={pid} partnerId={pid} />
      ))}
    </View>
  ) : null;

  return (
    <View style={[styles.wrap, {backgroundColor: colors.background}]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <HomeHeader />
        <SystemMessageSlot />
        <IdentityBar />
        {showHero &&
          (configLoaded ? (
            <StateHero state={homeState} />
          ) : (
            // Hero-shaped skeleton until config resolves, so we never flash
            // the default-state (Week 1 picks-open) hero on a cold launch.
            <HeroSkeleton />
          ))}

        {/* HotPick super-admin broadcast banner — always sits ABOVE Your
            Contests in every state (in-cycle and off-cycle), per the
            2026-06-15 sender-routing model. Scoped to the hidden Platform
            Pool; self-hides when there's nothing unread. */}
        <HomeInbox />

        {/* Off-cycle layout per the OffseasonPreseasonHome spec
            (May 29, 2026): action stack → cross-Contest strip →
            Clubs teaser. The pool list + Join/Create-as-list-affordance
            from the regular YOUR CONTESTS section don't apply here;
            the action stack owns Create/Join, and the Clubs teaser
            shrinks to one line. RecruiterBand is silent in the spec,
            so we drop it from these states. */}
        {homeState === 'off_season_idle' && (
          <>
            {offCycleContests}
            {visiblePools.length > 0 ? <ReturningOffCycleActions /> : <OffSeasonActions />}
            <CrossContestStrip />
            {offCycleClubs ?? <ClubsTeaser />}
          </>
        )}
        {homeState === 'pre_season_games' && (
          <>
            {/* Directly under the hero's kickoff countdown. */}
            <PreseasonPicksOpenLine />
            {offCycleContests}
            {visiblePools.length > 0 ? <ReturningOffCycleActions /> : <PreSeasonActions />}
            <CrossContestStrip />
            {offCycleClubs ?? <ClubsTeaser />}
          </>
        )}

        {showInsight && <Insight />}

        {/* Board Discovery Tile — routes partner board members (Chairman /
            Director) into League Tools. Self-hides when not on a board. */}
        <ManagedLeagueModule />

        {/* Join-the-public-contest CTA for new users with no contests.
            Self-hides once the user is in any pool. */}
        <JoinPublicContestButton />

        {/* In-cycle YOUR CONTESTS section — replaced on off-cycle
            states (off_season_idle / pre_season_games) by the action
            stack + cross-Contest strip above. */}
        {showPoolStack
          && homeState !== 'off_season_idle'
          && homeState !== 'pre_season_games' && (
          <View style={styles.section}>
            {/* Swipe carousel: one contest card per swipe, dots track the
                active/visible one (orange). Swiping sets the global active
                contest (Hard Rule #20). When the user has no visible pools we
                still show the title + the Join/Create affordance below. */}
            {visiblePools.length > 0 ? (
              <ContestCarousel pools={sortedVisiblePools} />
            ) : (
              <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textTertiary}]}>
                YOUR {LEXICON.contest.plural.toUpperCase()}
              </Text>
            )}
            <View style={contestActionPillStyles.row}>
              <ContestActionPill
                Icon={KeyRound}
                label="Join a Contest"
                sublabel="with invite code"
                onPress={() => navigation.navigate('JoinPool')}
                accessibilityLabel="Join a Contest with an invite code"
              />
              <ContestActionPill
                Icon={Plus}
                label="Create a Contest"
                sublabel="and invite friends"
                onPress={() => navigation.navigate('CreatePool')}
                accessibilityLabel="Create a new Contest and invite friends"
              />
            </View>
            {/* Onboarding explainer — only useful until the player is in more
                than one Contest; drop it once they've got several. */}
            {visiblePools.length <= 1 && (
              <Text style={[bodyType.regular, styles.sectionNote, {color: colors.textSecondary}]}>
                Be in as many Contests as you want. They'll all live right here. You can also make picks on your own and join a Contest later. It's just more fun with someone keeping score.
              </Text>
            )}
          </View>
        )}

        {showPartnerStack
          && homeState !== 'off_season_idle'
          && homeState !== 'pre_season_games' && (
          // In-cycle YOUR CLUBS section with the full Gaffer / Perks
          // explainer. Off-cycle states use the shrunken one-line
          // ClubsTeaser per spec.
          <View style={styles.section}>
            <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textTertiary}]}>
              YOUR {LEXICON.league.plural.toUpperCase()}
            </Text>
            {/* "What is a Club" explainer — onboarding only. Once the player is
                in a Club-affiliated Contest (partnerIds populated) they know
                what Clubs are, so drop it and just show their Clubs. */}
            {partnerIds.length === 0 && (
              <Text style={[bodyType.regular, styles.sectionNote, {color: colors.textSecondary}]}>
                These are bars, shops, and brands that back Contests with perks for everyone.
              </Text>
            )}
            {partnerIds.map(pid => (
              <PartnerModule key={pid} partnerId={pid} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ----------------------------------------------------------------------
// Off-cycle inline helpers per the OffseasonPreseasonHome spec.
// ----------------------------------------------------------------------


/** Pre-season line stating when Week 1 picks open (from season_picks_open_at).
 *  Sits under the kickoff countdown. Hidden until the date is loaded. */
function PreseasonPicksOpenLine() {
  const {colors} = useTheme();
  const picksOpenAt = useNFLStore(s => s.picksOpenAt);
  if (!picksOpenAt) return null;
  const day = picksOpenAt.getDate();
  const dateLabel =
    `${picksOpenAt.toLocaleDateString('en-US', {month: 'long'})} ${day}${ordinalSuffix(day)}`;
  return (
    <Text style={[bodyType.regular, offCycleStyles.picksOpenLine, {color: colors.textSecondary}]}>
      Week 1 picks go LIVE on{' '}
      <Text style={[bodyType.bold, {color: colors.textPrimary}]}>{dateLabel}</Text>
    </Text>
  );
}

/** One-line Clubs teaser for off-cycle states per spec §6 + Appendix.
 *  Replaces the longer Gaffer/Perks explainer that lives in the
 *  in-cycle YOUR CLUBS section. */
function ClubsTeaser() {
  const {colors} = useTheme();
  return (
    <View style={offCycleStyles.clubsBlock}>
      <Text style={[bodyType.bold, offCycleStyles.clubsLabel, {color: colors.textTertiary}]}>
        YOUR {LEXICON.league.plural.toUpperCase()}
      </Text>
      <Text style={[bodyType.regular, offCycleStyles.clubsTeaser, {color: colors.textSecondary}]}>
        These are bars, shops, and brands that back Contests with perks for everyone.
      </Text>
    </View>
  );
}

const offCycleStyles = StyleSheet.create({
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
  },
  countdownText: {fontSize: 14, lineHeight: 20},
  picksOpenLine: {
    fontSize: 13,
    lineHeight: 18,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  clubsBlock: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: 6,
  },
  clubsLabel:  {fontSize: 11, letterSpacing: 1.8, marginBottom: 4},
  clubsTeaser: {fontSize: 14, lineHeight: 20},
});

const styles = StyleSheet.create({
  wrap:    {flex: 1},
  scroll:  {paddingBottom: spacing.xxl},
  section: {marginTop: spacing.lg},
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1.8,
    paddingHorizontal: spacing.lg,
    marginBottom: 10,
  },
  // Explanatory line that sits under a section header or below a CTA
  // row. Mirrors the welcomeSub style on OffSeasonHero (14px / 20
  // lineHeight / textSecondary, non-italic) so the HotPick description
  // and the YOUR CONTESTS / YOUR CLUBS notes read as the same voice.
  sectionNote: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
    marginTop: 6,
    marginBottom: 6,
  },
});
