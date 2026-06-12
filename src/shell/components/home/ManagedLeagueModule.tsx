// Board Discovery Tile — 260612_HotPick_BoardDiscoveryTile_Spec.
//
// Surfaces partner board membership on the Home screen and routes the user into
// League Tools (the ClubAdmin route). Renders only when the user is on a partner
// board — i.e. the managedClub slice is populated (by loadManagedClub on profile
// load). This is the in-app discovery path for Chairmen AND Directors, who today
// get no notification on grant; the only other route is buried under Settings.
//
// Pure consumer of the existing managedClub slice — no fetch here (Red Flag: do
// NOT query partner_members from the component). HotPick-themed only (Hard Rule
// #25): the League name + logo carry identity; the League's brand colors appear
// nowhere on this tile. User-facing nouns come from @shared/lexicon (Rule #9).

import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Shield, ChevronRight} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {LogoMark} from './LogoMark';
import {partnerInitials} from './teamColors';
import {LEXICON} from '@shared/lexicon';

export function ManagedLeagueModule() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  // v1: at most one board per user (managedClub is a single object). Multi-board
  // tiles are deferred — see spec checklist. ClubAdmin reads managedClub itself,
  // so the route takes no params.
  const managedClub = useGlobalStore(s => s.managedClub);
  if (!managedClub) return null;

  const {name, logo} = managedClub;

  return (
    <Pressable
      onPress={() => navigation.navigate('ClubAdmin')}
      style={({pressed}) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${LEXICON.leagueTools} for ${name}`}>
      <View style={styles.row}>
        {logo ? (
          <Image
            source={{uri: logo}}
            style={[styles.logo, {borderColor: colors.border}]}
            accessible={false}
          />
        ) : (
          <LogoMark initials={partnerInitials(name)} tint={colors.textTertiary} size={40} />
        )}

        <View style={styles.body}>
          <Text
            style={[bodyType.regular, styles.eyebrow, {color: colors.textSecondary}]}
            numberOfLines={1}>
            You manage {name}
          </Text>
          <View style={styles.ctaRow}>
            <Shield size={14} color={colors.primary} strokeWidth={2.25} />
            <Text style={[bodyType.bold, styles.cta, {color: colors.primary}]}>
              Open {LEXICON.leagueTools}
            </Text>
          </View>
        </View>

        <ChevronRight size={20} color={colors.textTertiary} strokeWidth={2} />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '500',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  cta: {
    fontSize: 14,
  },
});
