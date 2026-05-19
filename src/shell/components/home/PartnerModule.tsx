// Compact partner card: logo, name, "via Pool" subtitle, perk row.
// Tap → PartnerRosterScreen. Perk content is partner-authored (we
// don't verify it).

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

  if (!partner) return null;

  const tint = partner.primary_color ?? colors.primary;

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
      accessibilityLabel={`Open ${partner.name} roster`}>
      <View style={styles.topRow}>
        {partner.logo_url ? (
          <Image
            source={{uri: partner.logo_url}}
            style={[styles.logoImg, {borderColor: tint}]}
            accessible={false}
          />
        ) : (
          <LogoMark initials={partnerInitials(partner.name)} tint={tint} size={40} />
        )}

        <View style={styles.titleBlock}>
          <Text
            style={[displayType.display, styles.partnerName, {color: colors.textPrimary}]}
            numberOfLines={1}>
            {partner.name.toUpperCase()}
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
