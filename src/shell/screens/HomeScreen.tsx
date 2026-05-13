// src/shell/screens/HomeScreen.tsx
// Spec: 260513_HotPick_HomeRedesign_Spec.docx §6.1 + §6.2
//
// v1 production Home Screen. Composes the new component suite:
//
//   SystemMessageSlot           (top of stack)
//   IdentityBar                 (always visible)
//   StateHero                   (always visible; routes 10 sub-variants)
//   LastWeekRecapChip           (picks_open + picks_locked only)
//   WeekMiniStrip               (in-cycle states only)
//   PoolModule × N              (one per visible pool)
//   PartnerModule × N           (one per DISTINCT aligned partner)
//
// All data loaders fire on mount + when their dependencies change. No
// per-Module useEffect — every aggregation lives in globalStore loaders.

import React, {useEffect, useMemo} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme/hooks';
import {spacing} from '@shared/theme';

import {SystemMessageSlot} from '@shell/components/home/SystemMessageSlot';
import {IdentityBar} from '@shell/components/home/IdentityBar';
import {StateHero, type HomeState} from '@shell/components/home/StateHero';
import {LastWeekRecapChip} from '@shell/components/home/LastWeekRecapChip';
import {WeekMiniStrip} from '@shell/components/home/WeekMiniStrip';
import {PoolModule} from '@shell/components/home/PoolModule';
import {PartnerModule} from '@shell/components/home/PartnerModule';

const NFL_2026 = 'nfl_2026';

/**
 * resolveHomeState — spec §6.1. Maps (visiblePools, current_phase, week_state)
 * to one of 10 states. Zero-pools is an overlay that overrides everything.
 */
function resolveHomeState(
  visiblePoolCount: number,
  phase: string,
  weekState: string,
): HomeState {
  if (visiblePoolCount === 0) return 'zero_pools';
  if (phase === 'PRE_SEASON')        return 'pre_season_idle';
  if (phase === 'REGULAR_COMPLETE')  return 'regular_complete_bridge';
  if (phase === 'SUPERBOWL_INTRO')   return 'superbowl_intro_bridge';
  if (phase === 'SEASON_COMPLETE')   return 'season_complete';

  // In-cycle: REGULAR | PLAYOFFS | SUPERBOWL
  switch (weekState) {
    case 'picks_open': return 'picks_open';
    case 'locked':     return 'picks_locked';
    case 'live':       return 'games_live';
    case 'settling':   return 'settling';
    case 'complete':   return 'complete';
    default:           return 'pre_season_idle';
  }
}

export function HomeScreen() {
  const {colors} = useTheme();

  // ---------------------------------------------------------------------------
  // Inputs from the existing stores. These are READS only; no aggregation.
  // ---------------------------------------------------------------------------
  const userId       = useGlobalStore(s => s.user?.id);
  const visiblePools = useGlobalStore(s => s.visiblePools);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const weekState    = useNFLStore(s => s.weekState);
  const currentWeek  = useNFLStore(s => s.currentWeek);

  // Loaders — pulled once per render so the deps below stay stable.
  const loadLastWeekHotPick   = useGlobalStore(s => s.loadLastWeekHotPick);
  const loadRecentWeeks       = useGlobalStore(s => s.loadRecentWeeks);
  const loadPoolIndicators    = useGlobalStore(s => s.loadPoolIndicators);
  const loadUserRankByPool    = useGlobalStore(s => s.loadUserRankByPool);
  const loadAlignedPartners   = useGlobalStore(s => s.loadAlignedPartners);
  const loadPartnerIndicators = useGlobalStore(s => s.loadPartnerIndicators);

  // ---------------------------------------------------------------------------
  // Resolve the home state.
  // ---------------------------------------------------------------------------
  const homeState = useMemo(
    () => resolveHomeState(visiblePools.length, currentPhase, weekState),
    [visiblePools.length, currentPhase, weekState],
  );

  // Element-level visibility per spec §6.2 anatomy table.
  const showRecapChip   = homeState === 'picks_open' || homeState === 'picks_locked';
  const showWeekStrip   = (
    homeState === 'picks_open'  ||
    homeState === 'picks_locked' ||
    homeState === 'games_live'  ||
    homeState === 'settling'    ||
    homeState === 'complete'
  );
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

  // ---------------------------------------------------------------------------
  // Fire all loaders. Each loader is store-cached; safe to call repeatedly.
  // ---------------------------------------------------------------------------
  const allPoolIds = useMemo(() => visiblePools.map(p => p.id), [visiblePools]);

  useEffect(() => {
    if (!userId) return;
    loadLastWeekHotPick(userId, NFL_2026, currentWeek).catch(() => {});
    loadRecentWeeks(userId, NFL_2026).catch(() => {});
  }, [userId, currentWeek, loadLastWeekHotPick, loadRecentWeeks]);

  useEffect(() => {
    if (!userId) return;
    loadPoolIndicators(userId, allPoolIds).catch(() => {});
  }, [userId, allPoolIds, loadPoolIndicators]);

  useEffect(() => {
    if (!userId) return;
    loadUserRankByPool(userId, privatePoolIds).catch(() => {});
  }, [userId, privatePoolIds, loadUserRankByPool]);

  useEffect(() => {
    loadAlignedPartners(partnerIds).catch(() => {});
  }, [partnerIds, loadAlignedPartners]);

  useEffect(() => {
    if (!userId) return;
    loadPartnerIndicators(userId, partnerIds).catch(() => {});
  }, [userId, partnerIds, loadPartnerIndicators]);

  // ---------------------------------------------------------------------------
  // Render — spec §6.2 element stack, top to bottom.
  // ---------------------------------------------------------------------------
  return (
    <View style={[styles.wrap, {backgroundColor: colors.background}]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <SystemMessageSlot />
        <IdentityBar />
        <StateHero state={homeState} />

        {showRecapChip && <LastWeekRecapChip />}
        {showWeekStrip && <WeekMiniStrip />}

        {showPoolStack && visiblePools.length > 0 && (
          <View style={styles.section}>
            {visiblePools.map(p => (
              <PoolModule key={p.id} pool={p} />
            ))}
          </View>
        )}

        {showPartnerStack && partnerIds.length > 0 && (
          <View style={styles.section}>
            {partnerIds.map(pid => (
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
  section: {marginTop: spacing.md},
});
