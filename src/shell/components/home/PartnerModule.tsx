// Compact partner card: logo, name, perk row.
// Tap → PartnerRosterScreen.
//
// Brand identity (name, logo, color) is read live from the partner
// record itself — NOT from any aligned pool's brand_config snapshot.
//
// Why not the snapshot? Pool snapshots carry the *lead/primary*
// partner's brand, not necessarily this tile's. When a pool has
// multiple affiliations (e.g. Sonny's NFL affiliated with both Big
// Tree Inn and Mes Que), `pool.brand_config.partner_name` resolves to
// the primary partner's name regardless of which tile is rendering
// — producing a wrong-tile-with-right-perk bug.
//
// Rule #23 governs the *pool* card (Contest card) staying
// self-contained. The partner tile in YOUR CLUBS is partner-centric,
// not pool-centric — so live partner data is the correct source here.
// Perk text/icon were already read live for the same reason.

import React, {useMemo} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Megaphone} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import {hexToRgba} from '@shared/utils/color';
import {LogoMark} from './LogoMark';
import {partnerInitials} from './teamColors';
import {PerkIcon} from './PerkIcon';
import {BroadcastPreview} from './BroadcastPreview';
import {LEXICON} from '@shared/lexicon';

const RECENT_WINDOW_MS = 60 * 60 * 1000;

export interface PartnerModuleProps {
  partnerId: string;
}

export function PartnerModule({partnerId}: PartnerModuleProps) {
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

  // Live partner identity. See top-of-file comment for why this is NOT
  // read from a pool snapshot.
  const brandName    = partner?.name          ?? '';
  const tint         = partner?.primary_color ?? colors.primary;
  const brandLogoUrl = partner?.logo_url      ?? null;

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
            style={[styles.logoImg, {borderColor: colors.border}]}
            accessible={false}
          />
        ) : (
          <LogoMark initials={partnerInitials(brandName)} tint={colors.textTertiary} size={40} />
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

      {/* Perk row only renders when the Club actually has a perk
          configured. Use a strict truthy-string check (not just
          `&&`) so an empty-string perk_text doesn't leak the empty
          string into JSX — RN throws "Text strings must be rendered
          within a <Text>" for stray strings outside a <Text>. */}
      {!!partner.perk_text && (
      <View style={[styles.perkRow, {borderTopColor: colors.border}]}>
        <PerkIcon
          name={partner.perk_icon}
          size={14}
          color={colors.textSecondary}
          containerStyle={styles.perkIconBox}
        />
        <Text
          style={[bodyType.regular, styles.perkText, {color: colors.textSecondary}]}
          numberOfLines={1}>
          {partner.perk_text}
        </Text>
        <Text style={[bodyType.bold, styles.perkEyebrow, {color: colors.textTertiary}]}>
          {LEXICON.league.short.toUpperCase()} {LEXICON.perks.toUpperCase()}
        </Text>
      </View>
      )}

      {/* Latest Club broadcast preview — full text lives on the roster (which
          this whole card opens). Display-only here so the card stays a single
          tap target. */}
      {unread > 0 && indicator?.latestMessage && (
        <BroadcastPreview label={brandName} message={indicator.latestMessage} unread />
      )}
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
