// Compact partner card: logo, name, perk row.
// Tap → PartnerRosterScreen.
//
// Rule #23: brand visuals (name, primary_color, logo) render from the
// aligned pool's brand_config snapshot, NOT live partner data. Keeps
// PartnerModule and PoolModule in lockstep — a partner re-skin doesn't
// repaint old aligned pools' cards differently across surfaces.
// Perk text/icon are NOT snapshotted (partner-managed, should stay
// fresh) so they still read from the live partner row.

import React, {useMemo} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Megaphone} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import type {DbPool} from '@shared/types/database';
import {hexToRgba} from '@shared/utils/color';
import {LogoMark} from './LogoMark';
import {partnerInitials} from './teamColors';
import {PerkIcon} from './PerkIcon';

const RECENT_WINDOW_MS = 60 * 60 * 1000;

export interface PartnerModuleProps {
  partnerId: string;
  alignedPools: DbPool[];
}

// Tolerates two BrandConfig logo shapes (see REFERENCE.md §15).
function resolveSnapshotLogoUrl(bc: unknown): string | null {
  if (!bc || typeof bc !== 'object') return null;
  const rec = bc as Record<string, unknown>;
  const nested = (rec.logo ?? {}) as Record<string, unknown>;
  if (typeof nested.full === 'string' && nested.full.length > 0) return nested.full;
  if (typeof rec.logo_url === 'string' && rec.logo_url.length > 0) return rec.logo_url;
  return null;
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
  const showNewBadge = unread > 0 && isRecent;

  // Read brand snapshot from the first aligned pool (Rule #23). All
  // aligned pools share the snapshot at alignment time; pick [0] for
  // a stable choice. Falls back to live partner data only when there's
  // no pool snapshot available (defensive — shouldn't happen at render).
  const {brandName, tint, brandLogoUrl} = useMemo(() => {
    const bc = (alignedPools[0]?.brand_config ?? null) as Record<string, unknown> | null;
    const snapName    = typeof bc?.partner_name === 'string' ? bc.partner_name : null;
    const snapPrimary = typeof bc?.primary_color === 'string' ? bc.primary_color : null;
    return {
      brandName:    snapName    || partner?.name              || '',
      tint:         snapPrimary || partner?.primary_color     || colors.primary,
      brandLogoUrl: resolveSnapshotLogoUrl(bc) || partner?.logo_url || null,
    };
  }, [alignedPools, partner?.name, partner?.primary_color, partner?.logo_url, colors.primary]);

  if (!partner) return null;

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
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${brandName} roster`}>
      <View style={styles.topRow}>
        {brandLogoUrl ? (
          <Image
            source={{uri: brandLogoUrl}}
            style={[styles.logoImg, {borderColor: tint}]}
            accessible={false}
          />
        ) : (
          <LogoMark initials={partnerInitials(brandName)} tint={tint} size={40} />
        )}

        <View style={styles.titleBlock}>
          <Text
            style={[displayType.display, styles.partnerName, {color: colors.textPrimary}]}
            numberOfLines={1}>
            {brandName.toUpperCase()}
          </Text>
        </View>

        {showNewBadge && (
          <View
            style={[
              styles.newBadge,
              {
                backgroundColor: hexToRgba(colors.primary, 0.14),
                borderColor: hexToRgba(colors.primary, 0.4),
              },
            ]}>
            <Megaphone size={12} color={colors.primary} strokeWidth={2} />
            <Text style={[bodyType.bold, styles.newText, {color: colors.primary}]}>
              {unread > 9 ? '9+ new' : `${unread} new`}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.perkRow, {borderTopColor: colors.border}]}>
        <PerkIcon
          name={partner.perk_icon}
          size={14}
          color={tint}
          containerStyle={styles.perkIconBox}
        />
        <Text
          style={[bodyType.regular, styles.perkText, {color: colors.textSecondary}]}
          numberOfLines={1}>
          {partner.perk_text}
        </Text>
        <Text style={[bodyType.bold, styles.perkEyebrow, {color: colors.textTertiary}]}>
          PARTNER PERK
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  partnerName: {
    fontSize: 20,
    lineHeight: 20,
  },
  viaText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 5,
  },
  newBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    flexShrink: 0,
  },
  newText: {
    fontSize: 11,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 12,
    paddingTop: 11,
    // RN doesn't render dashed top borders consistently across platforms;
    // a solid hairline reads as the same separator visually in dark mode.
    borderTopWidth: 1,
  },
  perkIconBox: {
    width: 18,
  },
  perkText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  perkEyebrow: {
    fontSize: 10,
    letterSpacing: 1.2,
    marginLeft: 8,
  },
});
