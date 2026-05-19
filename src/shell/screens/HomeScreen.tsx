// Home composes the redesigned hero suite (HomeHeader → IdentityBar →
// StateHero → Insight → Pool/Partner stacks). All Supabase reads live
// in store loaders fired here so child modules can stay presentational.

import React, {useEffect, useMemo} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {KeyRound, Plus} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {isScheduledStatus} from '@sports/nfl/utils/gameStatus';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useTheme} from '@shell/theme/hooks';
import {spacing, bodyType} from '@shared/theme';

import {SystemMessageSlot} from '@shell/components/home/SystemMessageSlot';
import {HomeHeader} from '@shell/components/home/HomeHeader';
import {IdentityBar} from '@shell/components/home/IdentityBar';
import {StateHero} from '@shell/components/home/StateHero';
import {Insight} from '@shell/components/home/Insight';
import {PoolModule} from '@shell/components/home/PoolModule';
import {PartnerModule} from '@shell/components/home/PartnerModule';
import {resolveHomeState} from '@shell/components/home/resolveHomeState';

export function HomeScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const userId       = useGlobalStore(s => s.user?.id);
  const visiblePools = useGlobalStore(s => s.visiblePools);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const weekState    = useNFLStore(s => s.weekState);
  const currentWeek  = useNFLStore(s => s.currentWeek);
  const competition  = useNFLStore(s => s.competition);

  const loadLastWeekHotPick   = useGlobalStore(s => s.loadLastWeekHotPick);
  const loadRecentWeeks       = useGlobalStore(s => s.loadRecentWeeks);
  const loadHotPickHitRate    = useGlobalStore(s => s.loadHotPickHitRate);
  const loadPoolIndicators    = useGlobalStore(s => s.loadPoolIndicators);
  const loadUserRankByPool    = useGlobalStore(s => s.loadUserRankByPool);
  const loadWeekRankByPool    = useGlobalStore(s => s.loadWeekRankByPool);
  const loadAlignedPartners   = useGlobalStore(s => s.loadAlignedPartners);
  const loadActivePartners    = useGlobalStore(s => s.loadActivePartners);
  const activePartnerIds      = useGlobalStore(s => s.activePartnerIds);
  const loadPartnerIndicators = useGlobalStore(s => s.loadPartnerIndicators);
  const fetchUserPickStatus    = useNFLStore(s => s.fetchUserPickStatus);
  const fetchUserHotPick       = useNFLStore(s => s.fetchUserHotPick);
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
    () => resolveHomeState(visiblePools.length, currentPhase, weekState),
    [visiblePools.length, currentPhase, weekState],
  );

  const isPicksFlow =
    homeState === 'picks_open'   ||
    homeState === 'picks_locked' ||
    homeState === 'games_live';
  const showInsight      = isPicksFlow;
  const showPoolStack    = homeState !== 'zero_pools';
  const showPartnerStack = homeState !== 'zero_pools';

  // ---------------------------------------------------------------------------
  // Partition pools for the Pool stack + Partner stack.
  // ---------------------------------------------------------------------------
  const {privatePoolIds, alignedPoolsByPartner, partnerIds} = useMemo(() => {
    const privatePools: string[] = [];
    const alignedMap: Record<string, typeof visiblePools> = {};
    const partners: string[] = [];
    for (const p of visiblePools) {
      if (p.partner_id) {
        if (!alignedMap[p.partner_id]) {
          alignedMap[p.partner_id] = [];
          partners.push(p.partner_id);
        }
        alignedMap[p.partner_id].push(p);
      } else {
        privatePools.push(p.id);
      }
    }
    return {
      privatePoolIds:        privatePools,
      alignedPoolsByPartner: alignedMap,
      partnerIds:            partners,
    };
  }, [visiblePools]);

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

  // Partner render order: aligned first, then the rest of the active
  // partner roster.
  const partnerRenderIds = useMemo(() => {
    const unaligned = activePartnerIds.filter(id => !partnerIds.includes(id));
    return [...partnerIds, ...unaligned];
  }, [partnerIds, activePartnerIds]);

  useEffect(() => {
    const unsub = subscribeToCompetitionConfig();
    return unsub;
  }, [subscribeToCompetitionConfig]);

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

  useEffect(() => {
    if (!userId || !competition || currentWeek <= 0) return;
    fetchUserPickStatus(userId).catch(() => {});
    fetchUserHotPick(userId, currentWeek).catch(() => {});
  }, [userId, competition, currentWeek, fetchUserPickStatus, fetchUserHotPick]);

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
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [
    homeState,
    userId,
    competition,
    fetchSeasonLeaderboard,
    loadRecentWeeks,
    loadHotPickHitRate,
  ]);
  return (
    <View style={[styles.wrap, {backgroundColor: colors.background}]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <HomeHeader />
        <SystemMessageSlot />
        <IdentityBar />
        <StateHero state={homeState} />

        {showInsight && <Insight />}

        {showPoolStack && visiblePools.length > 0 && (
          <View style={styles.section}>
            <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textTertiary}]}>
              YOUR POOLS
            </Text>
            {visiblePools.map(p => (
              <PoolModule key={p.id} pool={p} />
            ))}
            <View style={styles.poolActionsRow}>
              <Pressable
                onPress={() => navigation.navigate('JoinPool')}
                style={({pressed}) => [
                  styles.poolActionBtn,
                  {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
                ]}
                accessibilityRole="button"
                accessibilityLabel="Join a pool with an invite code">
                <KeyRound size={16} color={colors.textSecondary} strokeWidth={2} />
                <View style={styles.poolActionLabel}>
                  <Text
                    style={[bodyType.bold, styles.poolActionPrimary, {color: colors.textPrimary}]}>
                    Join a pool
                  </Text>
                  <Text
                    style={[bodyType.regular, styles.poolActionSecondary, {color: colors.textTertiary}]}>
                    with invite code
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate('CreatePool')}
                style={({pressed}) => [
                  styles.poolActionBtn,
                  {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
                ]}
                accessibilityRole="button"
                accessibilityLabel="Create a new pool and invite friends">
                <Plus size={16} color={colors.textSecondary} strokeWidth={2} />
                <View style={styles.poolActionLabel}>
                  <Text
                    style={[bodyType.bold, styles.poolActionPrimary, {color: colors.textPrimary}]}>
                    Create a pool
                  </Text>
                  <Text
                    style={[bodyType.regular, styles.poolActionSecondary, {color: colors.textTertiary}]}>
                    and invite friends
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        )}

        {showPartnerStack && (partnerIds.length > 0 || activePartnerIds.length > 0) && (
          <View style={styles.section}>
            <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textTertiary}]}>
              YOUR PARTNERS
            </Text>
            {partnerRenderIds.map(pid => (
              <PartnerModule
                key={pid}
                partnerId={pid}
                alignedPools={alignedPoolsByPartner[pid] ?? []}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

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
  poolActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: spacing.lg,
    marginTop: 4,
  },
  poolActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  poolActionLabel: {
    flexShrink: 1,
    minWidth: 0,
  },
  poolActionPrimary: {
    fontSize: 14,
    lineHeight: 17,
  },
  poolActionSecondary: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 1,
  },
});
