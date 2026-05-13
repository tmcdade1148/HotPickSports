// src/shell/components/home/PoolModule.tsx
// Spec: 260513_HotPick_HomeRedesign_Spec.docx §6.4.6
//
// Renders one full-width card per visible pool. Stacks vertically; the parent
// (HomeScreen) calls loadPoolIndicators + loadUserRankByPool in one batch on
// mount — never per-Module useEffect (spec Red Flag).
//
// Two flavors:
//   • Private pool      — left stripe in HotPick primary; rank chip shown
//   • Aligned partner   — left stripe in pool.brand_config.primary_color;
//                          rank chip OMITTED per the May 13 2026 locked
//                          decision (partner pools never ranked)
//
// Tap targets (per Rule #20 — pool selection is global app state):
//   • Card body  → setActivePoolId + navigate to Leaderboard
//   • Indicator  → setActivePoolId + navigate to SmackTalk
//
// All indicator data flows in via globalStore — no Realtime subscriptions
// or fetches inside the component.

import React, {useMemo} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import type {DbPool} from '@shared/types/database';

const ORDINAL_SUFFIX = (n: number): string => {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1:  return 'st';
    case 2:  return 'nd';
    case 3:  return 'rd';
    default: return 'th';
  }
};

const RECENT_WINDOW_MS = 60 * 60 * 1000; // 1 hour — drives the pulsing accent ring

export interface PoolModuleProps {
  pool: DbPool;
}

export function PoolModule({pool}: PoolModuleProps) {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);

  // Indicator counts — both channels (smack + organizer notifications)
  const smackUnread = useGlobalStore(s => s.smackUnreadCounts[pool.id] ?? 0);
  const poolInd     = useGlobalStore(s => s.poolIndicators[pool.id]);
  const orgUnread   = poolInd?.orgUnread ?? 0;
  const totalUnread = smackUnread + orgUnread;

  // Per-pool rank (private pools only — partner pools are not ranked).
  const isPartnerAligned = pool.partner_id != null;
  const rankData = useGlobalStore(s => s.userRankByPool[pool.id]);

  // Partner stripe color: read from pools.brand_config.primary_color
  // (copied from the partner at pool-creation time per Hard Rule #23).
  // Fall back to HotPick flame for private pools.
  const stripeColor = useMemo(() => {
    if (isPartnerAligned && pool.brand_config && typeof pool.brand_config === 'object') {
      const bc = pool.brand_config as Record<string, unknown>;
      const primary = bc.primary_color;
      if (typeof primary === 'string' && primary.length > 0) return primary;
    }
    return colors.primary;
  }, [isPartnerAligned, pool.brand_config, colors.primary]);

  // Partner display name — also from copied brand_config
  const partnerName = useMemo(() => {
    if (!isPartnerAligned || !pool.brand_config || typeof pool.brand_config !== 'object') return null;
    const bc = pool.brand_config as Record<string, unknown>;
    return typeof bc.partner_name === 'string' && bc.partner_name.length > 0
      ? bc.partner_name
      : null;
  }, [isPartnerAligned, pool.brand_config]);

  // Pulsing accent: any unread message within the last hour
  const isRecent = useMemo(() => {
    if (!poolInd?.mostRecentAt) return false;
    return Date.now() - new Date(poolInd.mostRecentAt).getTime() < RECENT_WINDOW_MS;
  }, [poolInd?.mostRecentAt]);

  const goToLeaderboard = () => {
    setActivePoolId(pool.id);
    navigation.navigate('Leaders');
  };

  const goToSmackTalk = () => {
    setActivePoolId(pool.id);
    navigation.navigate('SmackTalk');
  };

  return (
    <Pressable
      onPress={goToLeaderboard}
      style={({pressed}) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${pool.name} leaderboard`}>
      <View style={[styles.stripe, {backgroundColor: stripeColor}]} />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text
            style={[bodyType.bold, styles.poolName, {color: colors.ink}]}
            numberOfLines={1}>
            {pool.name_display || pool.name}
          </Text>

          {/* Rank chip — private pools only */}
          {!isPartnerAligned && rankData && (
            <View style={[styles.rankChip, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <Text style={[monoType.regular, styles.rankText, {color: colors.textPrimary}]}>
                {rankData.rank}{ORDINAL_SUFFIX(rankData.rank)} of {rankData.memberCount}
              </Text>
            </View>
          )}
        </View>

        {/* Alignment footer — partner pools only */}
        {isPartnerAligned && partnerName && (
          <View style={styles.alignFooter}>
            <View style={[styles.partnerDot, {backgroundColor: stripeColor}]} />
            <Text style={[bodyType.regular, styles.alignText, {color: colors.textSecondary}]}>
              Aligned with {partnerName}
            </Text>
          </View>
        )}
      </View>

      {/* Activity indicator — tap-through to SmackTalk */}
      {totalUnread > 0 && (
        <Pressable
          onPress={goToSmackTalk}
          style={({pressed}) => [
            styles.indicatorWrap,
            {opacity: pressed ? 0.7 : 1},
          ]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${totalUnread} unread ${totalUnread === 1 ? 'message' : 'messages'} in ${pool.name}, open SmackTalk`}>
          {isRecent && (
            <View
              style={[
                styles.pulseRing,
                {borderColor: colors.primary},
              ]}
            />
          )}
          <View style={[styles.indicator, {backgroundColor: colors.primary}]}>
            <Text style={[styles.indicatorText]} numberOfLines={1}>
              {totalUnread > 9 ? '9+' : totalUnread}
            </Text>
          </View>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minHeight: 64,
  },
  stripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  poolName: {
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
    fontSize: 16,
    paddingRight: spacing.sm,
  },
  rankChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rankText: {fontSize: 11, fontFamily: 'Manrope-Bold'},
  alignFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  partnerDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  alignText: {fontSize: 12},
  indicatorWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    top: spacing.sm,
    bottom: spacing.sm,
    left: spacing.sm + 4,
    right: spacing.sm + 4,
    borderRadius: 999,
    borderWidth: 2,
    opacity: 0.3,
  },
  indicator: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Manrope-Bold',
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
});
