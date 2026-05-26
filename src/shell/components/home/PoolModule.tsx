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

import React, {useMemo} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  BadgeCheck,
  MessageCircle,
  Megaphone,
  ShieldCheck,
  Trophy,
} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import {hexToRgba, pickReadableBrandColor, readableTextOn} from '@shared/utils/color';
import {
  LEXICON,
  affiliatedWith,
  clubContestTagline,
} from '@shared/lexicon';
import {ordinalSuffix} from '@shared/utils/format';
import type {DbPool} from '@shared/types/database';
import {LogoMark} from './LogoMark';
import {partnerInitials} from './teamColors';

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
  // `primaryColor` kept as a convenience pointer; `displayColor` is the
  // contrast-adjusted color resolved against the current surface and
  // is what every render site should actually paint with.
  primaryColor: string | null;
  displayColor: string | null;
  logoUrl: string | null;
  isPrimary: boolean;
}

// Render the rank number — wrapped in a medal pill when top-3,
// plain text otherwise. Inlined helper (not a Component) so it can
// sit unwrapped next to a sibling Text element in the row's
// flexbox without introducing an extra View boundary.
function renderRankValue(args: {
  rank: number;
  sizeStyle: object;
  suffixStyle: object;
  iconSize: number;
  textColor: string;
}) {
  const {rank, sizeStyle, suffixStyle, iconSize, textColor} = args;
  const medal = medalColor(rank);

  if (!medal) {
    return (
      <Text style={[displayType.display, sizeStyle, {color: textColor}]}>
        {rank}
        <Text style={suffixStyle}>{ordinalSuffix(rank)}</Text>
      </Text>
    );
  }

  // Solid medal fill — the pill IS the celebration. Foreground
  // (icon + number) flips to black or white whichever has more
  // contrast against the saturated background.
  const fg = readableTextOn(medal);
  return (
    <View
      style={[
        rankPillStyles.pill,
        {backgroundColor: medal, borderColor: medal},
      ]}>
      <Trophy size={iconSize} color={fg} strokeWidth={2.5} fill={fg} />
      <Text style={[displayType.display, sizeStyle, {color: fg}]}>
        {rank}
        <Text style={suffixStyle}>{ordinalSuffix(rank)}</Text>
      </Text>
    </View>
  );
}

const rankPillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
});

// Medal accent for top-3 finishes. Returns null for any rank
// outside 1–3 — the caller renders the plain number in that case.
// Saturated so they read as a celebration on the Home stack; foreground
// text/icon switches to black or white via readableTextOn at render.
function medalColor(rank: number): string | null {
  if (rank === 1) return '#F5B400'; // gold
  if (rank === 2) return '#B8C4D0'; // silver (slight blue cast so it pops on neutral backgrounds)
  if (rank === 3) return '#D9742B'; // bronze
  return null;
}

// Pull a hex string off a brand_config snapshot if present.
function resolveColorField(bc: unknown, key: string): string | null {
  if (!bc || typeof bc !== 'object') return null;
  const v = (bc as Record<string, unknown>)[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function PoolModule({pool}: PoolModuleProps) {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
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

    // Card body sits on `surfaceElevated`; pick whichever Club color
    // (primary → highlight → secondary → background) clears WCAG 3:1
    // against it. Surface flips with light/dark mode automatically.
    const surfaceBg = colors.surfaceElevated;

    if (affiliationsFromStore && affiliationsFromStore.length > 0) {
      return affiliationsFromStore.map(a => ({
        partnerId:    a.partnerId,
        name:         a.partnerName,
        primaryColor: a.primaryColor,
        displayColor: pickReadableBrandColor(
          [
            a.brandColors.primary,
            a.brandColors.highlight,
            a.brandColors.secondary,
            a.brandColors.background,
          ],
          surfaceBg,
        ),
        logoUrl:      a.logoUrl,
        isPrimary:    a.isPrimary,
      }));
    }

    if (!pool.partner_id) return [];
    const bc = pool.brand_config;
    const legacyPrimary    = resolveColorField(bc, 'primary_color')    ?? legacyPartner?.primary_color    ?? null;
    const legacySecondary  = resolveColorField(bc, 'secondary_color')  ?? null;
    const legacyBackground = resolveColorField(bc, 'background_color') ?? null;
    const legacyHighlight  = resolveColorField(bc, 'highlight_color')  ?? null;
    return [
      {
        partnerId: pool.partner_id,
        name:
          resolvePartnerName(bc) ??
          legacyPartner?.name ??
          'Club',
        primaryColor: legacyPrimary,
        displayColor: pickReadableBrandColor(
          [legacyPrimary, legacyHighlight, legacySecondary, legacyBackground],
          surfaceBg,
        ),
        logoUrl:
          resolveSnapshotLogoUrl(bc) ??
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
    colors.surfaceElevated,
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

      {/* Per-Contest settings gear was removed from the Home card.
          Pool settings (invite / leave / archive / rename) are
          rarely-used actions; surfacing them on every Contest tile
          created visual noise + a misclickable target next to the
          rank chip. Settings now reaches PoolSettings via the
          Settings tab → My Contests row. */}

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
                  {renderRankValue({
                    rank: rankData.rank,
                    sizeStyle: styles.rankNumber,
                    suffixStyle: styles.rankSuffix,
                    iconSize: 12,
                    textColor: colors.textPrimary,
                  })}
                  <Text style={[bodyType.regular, styles.rankLabel, {color: colors.textTertiary}]}>
                    {' '}(of {rankData.memberCount})
                  </Text>
                </View>
                {weekRank && (
                  <View style={styles.weekRankRow}>
                    <Text style={[bodyType.regular, styles.rankLabel, {color: colors.textSecondary}]}>
                      Week:{' '}
                    </Text>
                    {renderRankValue({
                      rank: weekRank.rank,
                      sizeStyle: styles.weekRankNumber,
                      suffixStyle: styles.rankSuffix,
                      iconSize: 11,
                      textColor: colors.textPrimary,
                    })}
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
                        borderColor: e.displayColor ?? colors.surfaceElevated,
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
                        tint={e.displayColor ?? colors.textTertiary}
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
                  color={primaryAffiliate.displayColor ?? colors.textTertiary}
                  strokeWidth={2.25}
                />
              )}
              <View style={styles.alignTextCol}>
                {/* Single-affiliate: keep it on one line. Multi: print
                    "Affiliated with" once, then each Club on its own
                    row underneath. Each Club name is a SEPARATE <Text>
                    node — not nested in a parent Text via Fragments —
                    because the previous Fragment-based approach was
                    duplicating Clubs on Android. */}
                {affiliates.length === 1 ? (
                  <View style={styles.singleAffiliateRow}>
                    <Text
                      style={[bodyType.regular, styles.affiliateLabel, {color: colors.textSecondary}]}>
                      {'Affiliated with '}
                    </Text>
                    <Text
                      style={[
                        bodyType.bold,
                        styles.affiliateName,
                        {color: primaryAffiliate.displayColor ?? colors.textPrimary},
                      ]}
                      numberOfLines={1}>
                      {primaryAffiliate.name}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text
                      style={[bodyType.regular, styles.affiliateLabel, {color: colors.textSecondary}]}>
                      Affiliated with
                    </Text>
                    {affiliates.slice(0, 3).map(e => (
                      <Text
                        key={e.partnerId}
                        style={[
                          bodyType.bold,
                          styles.affiliateName,
                          {color: e.displayColor ?? colors.textPrimary},
                        ]}
                        numberOfLines={1}>
                        {e.name}
                      </Text>
                    ))}
                    {affiliates.length > 3 && (
                      <Text
                        style={[bodyType.regular, styles.affiliateLabel, {color: colors.textTertiary}]}>
                        +{affiliates.length - 3} more
                      </Text>
                    )}
                  </>
                )}
              </View>
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
          </View>
        )}

        {/* INDEPENDENT Contests: no footer. Independence is the default
            state — the absence of a Club row IS the signal. */}
      </View>

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
  // Right-hand column inside the affiliation row. Holds the
  // "Affiliated with" label and either a single Club name (inline)
  // or a stack of one-per-line Club names (multi affiliate).
  alignTextCol: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    gap: 2,
  },
  singleAffiliateRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  affiliateLabel: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  affiliateName: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 17,
  },
});
