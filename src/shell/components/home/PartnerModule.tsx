// src/shell/components/home/PartnerModule.tsx
// Spec: 260513_HotPick_HomeRedesign_Spec.docx §6.4.7
//
// Compact card per aligned partner (one per DISTINCT partner_id across
// the user's active aligned pools). Shorter than PoolModule. Tapping
// anywhere — body or indicator — routes to PartnerRosterScreen.
//
// Multi-alignment dedupe: if the user belongs to multiple aligned pools
// for the same partner, ONE module renders. The "via [Pool]" subtitle
// picks the first aligned pool by visiblePools order.
//
// Visibility rules (parent decides which partner_ids to pass — we just
// render). Generally: only partners with is_active = true AND
// perk_text IS NOT NULL get loaded into partnersById, so missing
// perks → no module. See globalStore.loadAlignedPartners.

import React, {useMemo} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import type {DbPool} from '@shared/types/database';

const RECENT_WINDOW_MS = 60 * 60 * 1000;

export interface PartnerModuleProps {
  /** The partner UUID to render. Must already exist in globalStore.partnersById. */
  partnerId: string;
  /** All aligned pools the user belongs to with this partner. Used to pick
   *  the "via [Pool Name]" subtitle (first by visiblePools order). */
  alignedPools: DbPool[];
}

export function PartnerModule({partnerId, alignedPools}: PartnerModuleProps) {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const partner   = useGlobalStore(s => s.partnersById[partnerId]);
  const indicator = useGlobalStore(s => s.partnerIndicators[partnerId]);

  const unread = indicator?.unread ?? 0;
  const isRecent = useMemo(() => {
    if (!indicator?.mostRecentAt) return false;
    return Date.now() - new Date(indicator.mostRecentAt).getTime() < RECENT_WINDOW_MS;
  }, [indicator?.mostRecentAt]);

  // Fallbacks: if partner isn't loaded yet (race condition), render nothing.
  if (!partner) return null;

  const firstAlignedPool = alignedPools[0];
  const stripeColor      = partner.primary_color ?? colors.primary;

  const openRoster = () => {
    navigation.navigate('PartnerRoster', {slug: partner.slug});
  };

  return (
    <Pressable
      onPress={openRoster}
      style={({pressed}) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${partner.name} roster`}>
      <View style={[styles.stripe, {backgroundColor: stripeColor}]} />

      <View style={styles.body}>
        <View style={styles.topRow}>
          {partner.logo_url ? (
            <Image
              source={{uri: partner.logo_url}}
              style={styles.logo}
              accessible={false}
            />
          ) : (
            <View style={[styles.logoFallback, {backgroundColor: stripeColor}]}>
              <Text style={styles.logoFallbackText}>
                {partner.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.titleBlock}>
            <Text
              style={[bodyType.bold, styles.partnerName, {color: colors.ink}]}
              numberOfLines={1}>
              {partner.name}
            </Text>
            {firstAlignedPool && (
              <Text
                style={[bodyType.regular, styles.viaText, {color: colors.textSecondary}]}
                numberOfLines={1}>
                via {firstAlignedPool.name_display || firstAlignedPool.name}
              </Text>
            )}
          </View>

          {unread > 0 && (
            <View style={styles.indicatorWrap}>
              {isRecent && (
                <View
                  style={[
                    styles.pulseRing,
                    {borderColor: colors.primary},
                  ]}
                />
              )}
              <View style={[styles.indicator, {backgroundColor: colors.primary}]}>
                <Text style={styles.indicatorText} numberOfLines={1}>
                  {unread > 9 ? '9+' : unread}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={[styles.perkRow, {borderTopColor: colors.border}]}>
          <Text style={styles.perkIcon} numberOfLines={1}>
            {partner.perk_icon ?? '🎁'}
          </Text>
          <Text
            style={[bodyType.regular, styles.perkText, {color: colors.ink}]}
            numberOfLines={1}>
            {partner.perk_text}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  stripe: {width: 4, alignSelf: 'stretch'},
  body: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.md - 2,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 999,
  },
  logoFallback: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  partnerName: {fontSize: 15},
  viaText:     {fontSize: 11, marginTop: 1},
  indicatorWrap: {
    paddingLeft: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    left: spacing.sm - 2,
    right: -2,
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
    fontWeight: '900',
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  perkIcon: {fontSize: 16, width: 22, textAlign: 'center'},
  perkText: {fontSize: 13, flex: 1, lineHeight: 18},
});
