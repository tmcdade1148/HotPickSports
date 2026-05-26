// Full-width Contest card. Renders one of three visual states so the user
// can identify the Contest's affiliation at a glance:
//
//   • Official Club Contest — pool.owning_club_id IS NOT NULL.
//     A full-bleed branded header band with the Club logo + the tagline
//     "AN OFFICIAL [CLUB] CONTEST". The Club's brand defines the silhouette
//     of the card, not just its accent color.
//
//   • Affiliated Contest — pool has ≥1 row in pool_partner_affiliations.
//     Brand stripe on the left edge (single affiliation) or a stacked
//     multi-color stripe (≥2 affiliations). Footer carries an overlapping
//     logo cluster + the affiliatedWith() phrase. Popover opens with the
//     full list of affiliated Clubs.
//
//   • Independent Contest — no owning Club, no affiliations.
//     Neutral surface. Footer chip reads "Independent · run by [Gaffer]"
//     so the absence of Club branding becomes a positive identifier.
//
// Hard Rule #23: every Club logo/color rendered here comes from a brand
// snapshot stored ON the pool (legacy single-affiliation path) or on the
// per-affiliation row in pool_partner_affiliations — never from a live
// join to `partners`.
//
// Data source: reads `globalStore.poolAffiliations[poolId]` when populated.
// Falls back to the legacy singular `pool.partner_id` + `pool.brand_config`
// when the slice is empty (initial load, pre-affiliation pools). The DB
// trigger keeps the singular column in sync with the primary affiliation,
// so the fallback path stays correct for single-Club pools.

import React, {useMemo, useState} from 'react';
import {Image, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  BadgeCheck,
  Flag,
  Info,
  MessageCircle,
  Megaphone,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import {hexToRgba, readableTextOn} from '@shared/utils/color';
import {
  LEXICON,
  affiliatedWith,
  clubContestTagline,
  independentContestLabel,
} from '@shared/lexicon';
import {ordinalSuffix} from '@shared/utils/format';
import type {DbPool} from '@shared/types/database';
import {LogoMark} from './LogoMark';
import {partnerInitials} from './teamColors';
import {PerkIcon} from './PerkIcon';

export interface PoolModuleProps {
  pool: DbPool;
}

// Tolerates two BrandConfig shapes seen in the wild: nested `logo.full`
// (what PartnerAdminScreen writes) and flat `logo_url` (per REFERENCE.md §15).
function resolveSnapshotLogoUrl(brandConfig: unknown): string | null {
  if (!brandConfig || typeof brandConfig !== 'object') return null;
  const bc = brandConfig as Record<string, unknown>;
  const nested = (bc.logo ?? {}) as Record<string, unknown>;
  if (typeof nested.full === 'string' && nested.full.length > 0) return nested.full;
  if (typeof bc.logo_url === 'string' && bc.logo_url.length > 0) return bc.logo_url;
  return null;
}

function resolvePrimaryColor(brandConfig: unknown): string | null {
  if (!brandConfig || typeof brandConfig !== 'object') return null;
  const bc = brandConfig as Record<string, unknown>;
  return typeof bc.primary_color === 'string' && bc.primary_color.length > 0
    ? bc.primary_color
    : null;
}

function resolvePartnerName(brandConfig: unknown): string | null {
  if (!brandConfig || typeof brandConfig !== 'object') return null;
  const bc = brandConfig as Record<string, unknown>;
  return typeof bc.partner_name === 'string' && bc.partner_name.length > 0
    ? bc.partner_name
    : null;
}

interface Affiliate {
  partnerId: string;
  name: string;
  primaryColor: string | null;
  logoUrl: string | null;
  isPrimary: boolean;
}

export function PoolModule({pool}: PoolModuleProps) {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  // Two independent unread streams — kept separate so each badge has a
  // clear meaning and a single tap target.
  const smackUnread = useGlobalStore(s => s.smackUnreadCounts[pool.id] ?? 0);
  const poolInd     = useGlobalStore(s => s.poolIndicators[pool.id]);
  const orgUnread   = poolInd?.orgUnread ?? 0;

  const rankData = useGlobalStore(s => s.userRankByPool[pool.id]);
  const weekRank = useGlobalStore(s => s.weekRankByPool[pool.id]);

  // The owning Club, if any. Loaded into partnersById alongside aligned
  // partners. Falls back to null (no header band) if not yet cached.
  const owningClub = useGlobalStore(s =>
    pool.owning_club_id ? s.partnersById?.[pool.owning_club_id] : undefined,
  );

  // Legacy single-Club path — pool.partner_id + pool.brand_config. Used as
  // the fallback when the multi-Club affiliations slice hasn't loaded yet
  // (initial render, or a pool that pre-dates the affiliations migration).
  const legacyPartner = useGlobalStore(s =>
    pool.partner_id ? s.partnersById?.[pool.partner_id] : undefined,
  );
  const legacyPartnerIndicator = useGlobalStore(s =>
    pool.partner_id ? s.partnerIndicators?.[pool.partner_id] : undefined,
  );
  const legacyPartnerUnread = legacyPartnerIndicator?.unread ?? 0;

  // Authoritative multi-Club affiliations from globalStore. Loaded once
  // per HomeScreen mount in loadPoolAffiliations(allPoolIds).
  const affiliationsFromStore = useGlobalStore(s => s.poolAffiliations[pool.id]);

  const isOfficial = pool.owning_club_id != null;

  // Prefer the store's affiliations list; fall back to the legacy single
  // partner_id mirror when the slice is empty (still loading, or a pool
  // with no affiliations yet but legacy partner_id set).
  const affiliates = useMemo<Affiliate[]>(() => {
    if (isOfficial) return [];

    if (affiliationsFromStore && affiliationsFromStore.length > 0) {
      return affiliationsFromStore.map(a => ({
        partnerId:    a.partnerId,
        name:         a.partnerName,
        primaryColor: a.primaryColor,
        logoUrl:      a.logoUrl,
        isPrimary:    a.isPrimary,
      }));
    }

    if (!pool.partner_id) return [];
    return [
      {
        partnerId: pool.partner_id,
        name:
          resolvePartnerName(pool.brand_config) ??
          legacyPartner?.name ??
          'Club',
        primaryColor:
          resolvePrimaryColor(pool.brand_config) ??
          legacyPartner?.primary_color ??
          null,
        logoUrl:
          resolveSnapshotLogoUrl(pool.brand_config) ??
          legacyPartner?.logo_url ??
          null,
        isPrimary: true,
      },
    ];
  }, [
    isOfficial,
    affiliationsFromStore,
    pool.partner_id,
    pool.brand_config,
    legacyPartner,
  ]);

  const primaryAffiliate =
    affiliates.find(a => a.isPrimary) ?? affiliates[0] ?? null;
  const isAffiliated   = !isOfficial && affiliates.length > 0;
  const isIndependent  = !isOfficial && affiliates.length === 0;

  // Branded header band data for Official Contests. Read snapshot fields off
  // the pool first (Hard Rule #23 — no live join). Fall back to the cached
  // partner record if the pool's brand_config snapshot is missing.
  const officialBrand = useMemo(() => {
    if (!isOfficial) return null;
    const name =
      resolvePartnerName(pool.brand_config) ?? owningClub?.name ?? null;
    const primaryColor =
      resolvePrimaryColor(pool.brand_config) ??
      owningClub?.primary_color ??
      colors.primary;
    const logoUrl =
      resolveSnapshotLogoUrl(pool.brand_config) ?? owningClub?.logo_url ?? null;
    return {name, primaryColor, logoUrl};
  }, [isOfficial, pool.brand_config, owningClub, colors.primary]);

  const goToLeaderboard = () => {
    setActivePoolId(pool.id);
    navigation.navigate('LeaderboardTab');
  };

  const goToSmackTalk = () => {
    setActivePoolId(pool.id);
    navigation.navigate('SmackTalkTab');
  };

  const goToPoolSettings = () => {
    setActivePoolId(pool.id);
    navigation.navigate('PoolSettings', {poolId: pool.id});
  };

  const goToPartnerRoster = (slug?: string | null) => {
    if (!slug) return;
    navigation.navigate('PartnerRoster', {slug});
  };

  return (
    <Pressable
      onPress={goToLeaderboard}
      style={({pressed}) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: isOfficial
            ? (officialBrand?.primaryColor ?? colors.border)
            : colors.border,
          borderWidth: isOfficial ? 1.5 : 1,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${pool.name} ${LEXICON.ladder.short}`}>
      {/* OFFICIAL CLUB CONTEST — full-bleed branded header band. */}
      {isOfficial && officialBrand && (
        <View
          style={[
            styles.officialBand,
            {backgroundColor: officialBrand.primaryColor},
          ]}
          accessible
          accessibilityLabel={
            officialBrand.name
              ? clubContestTagline(officialBrand.name)
              : `An Official ${LEXICON.club.short} ${LEXICON.contest.singular}`
          }>
          {officialBrand.logoUrl ? (
            <Image
              source={{uri: officialBrand.logoUrl}}
              style={styles.officialBandLogo}
              resizeMode="contain"
            />
          ) : (
            <LogoMark
              initials={partnerInitials(officialBrand.name ?? 'C')}
              tint={officialBrand.primaryColor}
              size={28}
            />
          )}
          <View style={styles.officialBandTextBlock}>
            <ShieldCheck
              size={13}
              color={readableTextOn(officialBrand.primaryColor)}
              strokeWidth={2.5}
            />
            <Text
              style={[
                bodyType.bold,
                styles.officialBandText,
                {color: readableTextOn(officialBrand.primaryColor)},
              ]}
              numberOfLines={1}>
              {officialBrand.name
                ? clubContestTagline(officialBrand.name).toUpperCase()
                : `AN OFFICIAL ${LEXICON.club.short.toUpperCase()} ${LEXICON.contest.singular.toUpperCase()}`}
            </Text>
          </View>
        </View>
      )}

      {/* AFFILIATED cards do NOT paint Club colors anywhere on the card
          itself. Per product call 2026-05-26, Club colors are reserved
          for Official Club Contests only. Affiliated Contests identify
          their Clubs via the logo cluster + "Affiliated with …" text in
          the footer below; the card body stays HotPick-neutral. */}

      {/* Pool settings gear — sits in the lower-right. Bumped above the
          footer divider when a partner zone or independent chip is below. */}
      <Pressable
        onPress={goToPoolSettings}
        hitSlop={10}
        style={({pressed}) => [
          styles.gearBtn,
          (isAffiliated || isIndependent) ? styles.gearBtnAboveFooter : null,
          {opacity: pressed ? 0.5 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${pool.name} settings`}>
        <Settings size={16} color={colors.textTertiary} strokeWidth={2} />
      </Pressable>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text
              style={[displayType.display, styles.poolName, {color: colors.textPrimary}]}
              numberOfLines={1}>
              {(pool.name || '').toUpperCase()}
            </Text>
            {rankData && (
              <>
                <View style={styles.rankRow}>
                  <Text style={[bodyType.regular, styles.rankLabel, {color: colors.textSecondary}]}>
                    Season:{' '}
                  </Text>
                  <Text style={[displayType.display, styles.rankNumber, {color: colors.textPrimary}]}>
                    {rankData.rank}
                    <Text style={styles.rankSuffix}>{ordinalSuffix(rankData.rank)}</Text>
                  </Text>
                  <Text style={[bodyType.regular, styles.rankLabel, {color: colors.textTertiary}]}>
                    {' '}(of {rankData.memberCount})
                  </Text>
                </View>
                {weekRank && (
                  <View style={styles.weekRankRow}>
                    <Text style={[bodyType.regular, styles.rankLabel, {color: colors.textSecondary}]}>
                      Week:{' '}
                    </Text>
                    <Text style={[displayType.display, styles.weekRankNumber, {color: colors.textPrimary}]}>
                      {weekRank.rank}
                      <Text style={styles.rankSuffix}>{ordinalSuffix(weekRank.rank)}</Text>
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          <View style={styles.badgeColumn}>
            <View
              style={[
                styles.newBadge,
                orgUnread > 0
                  ? {
                      backgroundColor: hexToRgba(colors.primary, 0.14),
                      borderColor: hexToRgba(colors.primary, 0.4),
                    }
                  : {
                      backgroundColor: 'transparent',
                      borderColor: colors.border,
                    },
              ]}
              accessible
              accessibilityLabel={
                orgUnread > 0
                  ? `${orgUnread} new ${LEXICON.gaffer.short} ${orgUnread === 1 ? 'message' : 'messages'}`
                  : `No new ${LEXICON.gaffer.short} messages`
              }>
              <Megaphone
                size={12}
                color={orgUnread > 0 ? colors.primary : colors.textTertiary}
                strokeWidth={2}
              />
              {orgUnread > 0 && (
                <Text style={[bodyType.bold, styles.newText, {color: colors.primary}]}>
                  {orgUnread > 9 ? '9+' : orgUnread}
                </Text>
              )}
            </View>
            <Pressable
              onPress={goToSmackTalk}
              hitSlop={8}
              style={({pressed}) => [
                styles.unreadBadge,
                smackUnread > 0
                  ? {
                      backgroundColor: hexToRgba(colors.error, 0.18),
                      borderColor: hexToRgba(colors.error, 0.45),
                    }
                  : {
                      backgroundColor: 'transparent',
                      borderColor: colors.border,
                    },
                {opacity: pressed ? 0.7 : 1},
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                smackUnread > 0
                  ? `${smackUnread} unread ${smackUnread === 1 ? LEXICON.chirps.singular : LEXICON.chirps.plural}, open chat`
                  : `Open ${LEXICON.chirps.plural}`
              }>
              <MessageCircle
                size={12}
                color={smackUnread > 0 ? colors.error : colors.textTertiary}
                strokeWidth={2}
              />
              {smackUnread > 0 && (
                <Text style={[bodyType.bold, styles.unreadText, {color: colors.error}]}>
                  {smackUnread > 9 ? '9+' : smackUnread}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* AFFILIATED — affiliation zone. Logo cluster + text scales with N. */}
        {isAffiliated && primaryAffiliate && (
          <View style={[styles.partnerZone, {borderTopColor: colors.border}]}>
            <Pressable
              onPress={() => goToPartnerRoster(legacyPartner?.slug)}
              hitSlop={6}
              style={({pressed}) => [
                styles.alignRow,
                {opacity: pressed ? 0.6 : 1},
              ]}
              accessibilityRole="button"
              accessibilityLabel={affiliatedWith(affiliates.map(e => e.name))}>
              {/* Overlapping logo cluster. Each logo's ring is colored in
                  the Club's primary — the only Club-color accent on an
                  Affiliated card's body, used here because the logo IS
                  the Club's identity (the ring just reinforces it). */}
              <View style={styles.logoCluster}>
                {affiliates.slice(0, 3).map((e, i) => (
                  <View
                    key={e.partnerId}
                    style={[
                      styles.logoClusterItem,
                      {
                        marginLeft: i === 0 ? 0 : -8,
                        zIndex: affiliates.length - i,
                        borderColor: e.primaryColor ?? colors.surfaceElevated,
                      },
                    ]}>
                    {e.logoUrl ? (
                      <Image
                        source={{uri: e.logoUrl}}
                        style={styles.logoClusterImg}
                        resizeMode="contain"
                      />
                    ) : (
                      <LogoMark
                        initials={partnerInitials(e.name)}
                        tint={e.primaryColor ?? colors.textTertiary}
                        size={22}
                      />
                    )}
                  </View>
                ))}
                {affiliates.length > 3 && (
                  <View
                    style={[
                      styles.logoClusterMore,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.surfaceElevated,
                      },
                    ]}>
                    <Text
                      style={[
                        bodyType.bold,
                        styles.logoClusterMoreText,
                        {color: colors.textSecondary},
                      ]}>
                      +{affiliates.length - 3}
                    </Text>
                  </View>
                )}
              </View>
              {affiliates.length === 1 && (
                <BadgeCheck
                  size={14}
                  color={primaryAffiliate.primaryColor ?? colors.textTertiary}
                  strokeWidth={2.25}
                />
              )}
              <Text
                style={[bodyType.regular, styles.alignText, {color: colors.textSecondary}]}
                numberOfLines={1}>
                {'Affiliated with '}
                {affiliates.slice(0, 3).map((e, i) => {
                  // Separator before this name: nothing before first,
                  // " & " before the last when total <= 3, otherwise ", ".
                  const total = Math.min(affiliates.length, 3);
                  const isLast = i === total - 1;
                  const sep = i === 0 ? '' : isLast && affiliates.length <= 3 ? ' & ' : ', ';
                  return (
                    <React.Fragment key={e.partnerId}>
                      {sep}
                      <Text
                        style={[
                          bodyType.bold,
                          {
                            color: e.primaryColor ?? colors.textPrimary,
                            // Bumped up from 12.5 → 14 + heavier weight
                            // so the Club's name reads as the focal
                            // point of the affiliation row.
                            fontSize: 14,
                            fontWeight: '800',
                          },
                        ]}>
                        {e.name}
                      </Text>
                    </React.Fragment>
                  );
                })}
                {affiliates.length > 3 && ` & ${affiliates.length - 3} more`}
              </Text>
              {legacyPartnerUnread > 0 && affiliates.length === 1 && (
                <View
                  style={[
                    styles.partnerNewBadge,
                    {
                      backgroundColor: hexToRgba(colors.primary, 0.14),
                      borderColor: hexToRgba(colors.primary, 0.4),
                    },
                  ]}
                  accessible
                  accessibilityLabel={`${legacyPartnerUnread} new ${LEXICON.club.short} ${
                    legacyPartnerUnread === 1 ? 'message' : 'messages'
                  }`}>
                  <Megaphone size={11} color={colors.primary} strokeWidth={2} />
                  <Text style={[bodyType.bold, styles.partnerNewText, {color: colors.primary}]}>
                    {legacyPartnerUnread > 9 ? '9+' : legacyPartnerUnread}
                  </Text>
                </View>
              )}
            </Pressable>
            {/* Non-color path to the same info — required for the ~8% of
                male users with color-vision deficiency who can't rely on
                the stripe alone. */}
            <Pressable
              onPress={() => setPopoverOpen(true)}
              hitSlop={8}
              style={({pressed}) => [
                styles.connectionPill,
                {borderColor: colors.border, opacity: pressed ? 0.6 : 1},
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                affiliates.length === 1
                  ? `Show ${LEXICON.club.short} affiliation details`
                  : `Show ${affiliates.length} ${LEXICON.club.short} affiliations`
              }>
              <Info size={11} color={colors.textTertiary} strokeWidth={2} />
              <Text
                style={[bodyType.regular, styles.connectionText, {color: colors.textTertiary}]}>
                {affiliates.length === 1
                  ? `${LEXICON.club.short} affiliation`
                  : `${affiliates.length} affiliations`}
              </Text>
            </Pressable>
            {legacyPartner?.perk_text && affiliates.length === 1 && (
              <View style={styles.perkRow}>
                <PerkIcon
                  name={legacyPartner.perk_icon}
                  size={13}
                  color={colors.textSecondary}
                  containerStyle={styles.perkIconBox}
                />
                <Text
                  style={[bodyType.regular, styles.perkText, {color: colors.textSecondary}]}
                  numberOfLines={2}>
                  {legacyPartner.perk_text}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* INDEPENDENT — small footer chip turns absence into a positive
            identifier. Gaffer name will populate once a loader feeds it
            (today: organizer_id → profile poolie_name; not yet in store). */}
        {isIndependent && (
          <View style={[styles.partnerZone, {borderTopColor: colors.border}]}>
            <View
              style={[styles.independentChip, {borderColor: colors.border}]}
              accessible
              accessibilityLabel={independentContestLabel(null)}>
              <Flag size={11} color={colors.textTertiary} strokeWidth={2} />
              <Text
                style={[
                  bodyType.regular,
                  styles.independentText,
                  {color: colors.textTertiary},
                ]}
                numberOfLines={1}>
                {independentContestLabel(null)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {isAffiliated && popoverOpen && primaryAffiliate && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setPopoverOpen(false)}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setPopoverOpen(false)}
            accessibilityLabel="Close affiliation details">
            <Pressable
              style={[
                styles.modalCard,
                {backgroundColor: colors.surfaceElevated, borderColor: colors.border},
              ]}
              onPress={() => { /* swallow tap so backdrop doesn't close */ }}>
              <Pressable
                onPress={() => setPopoverOpen(false)}
                hitSlop={10}
                style={styles.modalClose}
                accessibilityRole="button"
                accessibilityLabel="Close">
                <X size={18} color={colors.textTertiary} strokeWidth={2} />
              </Pressable>

              <Text
                style={[displayType.display, styles.modalTitle, {color: colors.textPrimary}]}>
                {affiliates.length === 1
                  ? `${LEXICON.club.short.toUpperCase()} ENDORSEMENT`
                  : `${affiliates.length} ${LEXICON.club.short.toUpperCase()} ENDORSEMENTS`}
              </Text>

              {affiliates.map(e => (
                <Pressable
                  key={e.partnerId}
                  onPress={() => {
                    setPopoverOpen(false);
                    // Slug only available for the legacy primary affiliate
                    // today; multi-affiliation nav lands when the loader does.
                    if (e.partnerId === pool.partner_id) {
                      goToPartnerRoster(legacyPartner?.slug);
                    }
                  }}
                  style={({pressed}) => [
                    styles.modalRow,
                    {borderTopColor: colors.border, opacity: pressed ? 0.6 : 1},
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${e.name} ${LEXICON.roster}`}>
                  {e.logoUrl ? (
                    <Image
                      source={{uri: e.logoUrl}}
                      style={[
                        styles.modalRowLogo,
                        {borderColor: e.primaryColor ?? colors.border},
                      ]}
                      resizeMode="contain"
                    />
                  ) : (
                    <LogoMark
                      initials={partnerInitials(e.name)}
                      tint={e.primaryColor ?? colors.textTertiary}
                      size={32}
                    />
                  )}
                  <Text
                    style={[bodyType.bold, styles.modalRowName, {color: e.primaryColor ?? colors.textPrimary}]}
                    numberOfLines={1}>
                    {e.name}
                  </Text>
                  {e.isPrimary && affiliates.length > 1 && (
                    <Text
                      style={[
                        bodyType.regular,
                        styles.modalRowPrimary,
                        {color: e.primaryColor ?? colors.textSecondary},
                      ]}>
                      Lead
                    </Text>
                  )}
                </Pressable>
              ))}

              {legacyPartner?.perk_text && affiliates.length === 1 && (
                <View
                  style={[
                    styles.modalPerkRow,
                    {borderTopColor: colors.border, borderBottomColor: colors.border},
                  ]}>
                  <PerkIcon
                    name={legacyPartner.perk_icon}
                    size={20}
                    color={colors.textSecondary}
                    containerStyle={styles.modalPerkIcon}
                  />
                  <Text
                    style={[bodyType.regular, styles.modalPerkText, {color: colors.textSecondary}]}>
                    {legacyPartner.perk_text}
                  </Text>
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    marginHorizontal: spacing.lg,
    marginBottom: 10,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // Official Club Contest — full-bleed branded header band.
  officialBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  officialBandLogo: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  officialBandTextBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  officialBandText: {
    fontSize: 11,
    letterSpacing: 0.8,
    flexShrink: 1,
  },

  // Roster stripes — single (3px solid) or stacked (multi-color).
  stripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  stripeStack: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  stripeStackSegment: {
    position: 'absolute',
    left: 0,
    right: 0,
  },

  gearBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    padding: 4,
    zIndex: 2,
  },
  gearBtnAboveFooter: {
    bottom: 88,
  },
  body: {
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  poolName: {
    fontSize: 16.5,
    lineHeight: 16.5,
    marginBottom: 6,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  rankLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  rankNumber: {
    fontSize: 16,
    lineHeight: 16,
  },
  rankSuffix: {
    fontSize: 11,
  },
  weekRankRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  weekRankNumber: {
    fontSize: 14,
    lineHeight: 14,
  },
  badgeColumn: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  unreadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingLeft: 8,
    paddingRight: 9,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  unreadText: {
    fontSize: 11,
  },
  newBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  newText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },

  // Roster / affiliation footer zone.
  partnerZone: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  alignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  logoClusterItem: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoClusterImg: {
    width: 20,
    height: 20,
  },
  logoClusterMore: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    marginLeft: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoClusterMoreText: {
    fontSize: 10,
  },
  partnerNewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    flexShrink: 0,
  },
  partnerNewText: {
    fontSize: 10,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingLeft: 34,
  },
  perkIconBox: {
    width: 16,
  },
  perkText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  alignText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '500',
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    marginTop: 6,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  connectionText: {
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // Independent Contest footer chip.
  independentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  independentText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },

  // Affiliation detail modal.
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  modalClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
    zIndex: 1,
  },
  modalTitle: {
    fontSize: 13,
    letterSpacing: 0.8,
    marginBottom: spacing.md,
    paddingTop: 4,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  modalRowLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  modalRowName: {
    flex: 1,
    fontSize: 14,
  },
  modalRowPrimary: {
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  modalPerkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalPerkIcon: {
    width: 24,
  },
  modalPerkText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
