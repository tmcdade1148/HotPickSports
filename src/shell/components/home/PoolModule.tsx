// Full-width pool card: name, Season/Week rank, org + SmackTalk
// indicators, settings gear, partner-alignment footer when applicable.
// Reads from globalStore — HomeScreen owns the loaders.

import React, {useMemo, useState} from 'react';
import {Image, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Info, MessageCircle, Megaphone, Settings, X} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import {hexToRgba} from '@shared/utils/color';
import {ordinalSuffix} from '@shared/utils/format';
import type {DbPool} from '@shared/types/database';
import {LogoMark} from './LogoMark';
import {partnerInitials} from './teamColors';
import {PerkIcon} from './PerkIcon';

export interface PoolModuleProps {
  pool: DbPool;
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

  const isPartnerAligned = pool.partner_id != null;
  const rankData = useGlobalStore(s => s.userRankByPool[pool.id]);
  const weekRank = useGlobalStore(s => s.weekRankByPool[pool.id]);
  const partner = useGlobalStore(s =>
    pool.partner_id ? s.partnersById?.[pool.partner_id] : undefined,
  );
  const partnerIndicator = useGlobalStore(s =>
    pool.partner_id ? s.partnerIndicators?.[pool.partner_id] : undefined,
  );
  const partnerUnread = partnerIndicator?.unread ?? 0;

  // Hard Rule #23: read partner brand from the pool's brand_config snapshot,
  // never from a live join to partners. If the snapshot is missing the
  // primary_color, render no stripe — we don't fabricate one.
  // Partner logo URL also from the snapshot — Hard Rule #23.
  // Tolerates two in-the-wild shapes: nested `logo.full` (what
  // PartnerAdminScreen writes) and flat `logo_url` (per REFERENCE.md §15).
  const partnerLogoUrl = useMemo(() => {
    if (!isPartnerAligned || !pool.brand_config || typeof pool.brand_config !== 'object') {
      return null;
    }
    const bc = pool.brand_config as Record<string, unknown>;
    const nested = (bc.logo ?? {}) as Record<string, unknown>;
    if (typeof nested.full === 'string' && nested.full.length > 0) return nested.full;
    if (typeof bc.logo_url === 'string' && bc.logo_url.length > 0) return bc.logo_url;
    return null;
  }, [isPartnerAligned, pool.brand_config]);

  const {stripeColor, partnerName} = useMemo(() => {
    if (
      isPartnerAligned &&
      pool.brand_config &&
      typeof pool.brand_config === 'object'
    ) {
      const bc = pool.brand_config as Record<string, unknown>;
      const primary = typeof bc.primary_color === 'string' ? bc.primary_color : null;
      const name = typeof bc.partner_name === 'string' ? bc.partner_name : null;
      return {
        stripeColor: primary && primary.length > 0 ? primary : null,
        partnerName: name && name.length > 0 ? name : null,
      };
    }
    return {stripeColor: null as string | null, partnerName: null as string | null};
  }, [isPartnerAligned, pool.brand_config]);

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

  const goToPartnerRoster = () => {
    if (!partner) return;
    navigation.navigate('PartnerRoster', {slug: partner.slug});
  };

  const goToPartnerRosterFromPopover = () => {
    setPopoverOpen(false);
    if (partner) {
      navigation.navigate('PartnerRoster', {slug: partner.slug});
    }
  };

  return (
    <Pressable
      onPress={goToLeaderboard}
      style={({pressed}) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${pool.name} leaderboard`}>
      {stripeColor && (
        <View style={[styles.stripe, {backgroundColor: stripeColor}]} />
      )}

      {/* Pool settings gear — absolutely positioned in the lower-right
          corner of the card. When the card has an aligned-partner footer,
          the gear is bumped up so it always sits ABOVE the divider line. */}
      <Pressable
        onPress={goToPoolSettings}
        hitSlop={10}
        style={({pressed}) => [
          styles.gearBtn,
          isPartnerAligned && partnerName ? styles.gearBtnAboveFooter : null,
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
                {/* Season-rank summary — "Season: 11th (of 11)". */}
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
                {/* Week-rank summary — appears once the first game has
                    kicked off. "Week: 11th". */}
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

          {/* Both badges are always visible so the user can see the two
              comms channels and how each one stands. When there's nothing
              unread, the badge renders in a muted "empty" state (faded
              icon, no count); a real unread count flips it to the live
              tinted state. */}
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
                  ? `${orgUnread} new organizer ${orgUnread === 1 ? 'message' : 'messages'}`
                  : 'No new organizer messages'
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
                  ? `${smackUnread} unread SmackTalk ${smackUnread === 1 ? 'message' : 'messages'}, open chat`
                  : 'Open SmackTalk'
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

        {isPartnerAligned && partnerName && (
          <View style={[styles.partnerZone, {borderTopColor: colors.border}]}>
            <Pressable
              onPress={goToPartnerRoster}
              disabled={!partner}
              hitSlop={6}
              style={({pressed}) => [
                styles.alignRow,
                {opacity: pressed ? 0.6 : 1},
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${partnerName} roster`}>
              <LogoMark
                initials={partnerInitials(partnerName)}
                tint={stripeColor ?? colors.primary}
                size={24}
              />
              <Text
                style={[bodyType.regular, styles.alignText, {color: colors.textSecondary}]}
                numberOfLines={1}>
                Aligned with{' '}
                <Text style={[bodyType.bold, {color: colors.textPrimary}]}>
                  {partnerName}
                </Text>
              </Text>
              {partnerUnread > 0 && (
                <View
                  style={[
                    styles.partnerNewBadge,
                    {
                      backgroundColor: hexToRgba(colors.primary, 0.14),
                      borderColor: hexToRgba(colors.primary, 0.4),
                    },
                  ]}
                  accessible
                  accessibilityLabel={`${partnerUnread} new partner ${
                    partnerUnread === 1 ? 'message' : 'messages'
                  }`}>
                  <Megaphone size={11} color={colors.primary} strokeWidth={2} />
                  <Text style={[bodyType.bold, styles.partnerNewText, {color: colors.primary}]}>
                    {partnerUnread > 9 ? '9+' : partnerUnread}
                  </Text>
                </View>
              )}
            </Pressable>
            {/* Accessibility affordance — non-color path to partner info.
                Color-only signaling (the brand stripe) fails for ~8% of male
                users; this provides a tap target that reveals the same info. */}
            <Pressable
              onPress={() => setPopoverOpen(true)}
              hitSlop={8}
              style={({pressed}) => [
                styles.connectionPill,
                {borderColor: colors.border, opacity: pressed ? 0.6 : 1},
              ]}
              accessibilityRole="button"
              accessibilityLabel="Show partner connection details">
              <Info size={11} color={colors.textTertiary} strokeWidth={2} />
              <Text
                style={[bodyType.regular, styles.connectionText, {color: colors.textTertiary}]}>
                Partner connection
              </Text>
            </Pressable>
            {partner?.perk_text && (
              <View style={styles.perkRow}>
                <View style={styles.perkIconBox}>
                  <PerkIcon
                    name={partner.perk_icon}
                    size={13}
                    color={stripeColor ?? colors.primary}
                  />
                </View>
                <Text
                  style={[bodyType.regular, styles.perkText, {color: colors.textSecondary}]}
                  numberOfLines={2}>
                  {partner.perk_text}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {isPartnerAligned && (
        <Modal
          visible={popoverOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPopoverOpen(false)}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setPopoverOpen(false)}
            accessibilityLabel="Close partner connection details">
            <Pressable
              style={[
                styles.modalCard,
                {backgroundColor: colors.surfaceElevated, borderColor: colors.border},
              ]}
              onPress={() => {
                /* swallow tap so backdrop press doesn't close when tapping inside */
              }}>
              <Pressable
                onPress={() => setPopoverOpen(false)}
                hitSlop={10}
                style={styles.modalClose}
                accessibilityRole="button"
                accessibilityLabel="Close">
                <X size={18} color={colors.textTertiary} strokeWidth={2} />
              </Pressable>

              <View style={styles.modalHeader}>
                {partnerLogoUrl ? (
                  <Image
                    source={{uri: partnerLogoUrl}}
                    style={[
                      styles.modalLogo,
                      {borderColor: stripeColor ?? colors.border},
                    ]}
                  />
                ) : (
                  <LogoMark
                    initials={partnerInitials(partnerName ?? 'P')}
                    tint={stripeColor ?? colors.primary}
                    size={48}
                  />
                )}
                <Text
                  style={[displayType.display, styles.modalName, {color: colors.textPrimary}]}
                  numberOfLines={2}>
                  {(partnerName ?? partner?.name ?? '').toUpperCase()}
                </Text>
              </View>

              {partner?.perk_text && (
                <View
                  style={[
                    styles.modalPerkRow,
                    {borderTopColor: colors.border, borderBottomColor: colors.border},
                  ]}>
                  <View style={styles.modalPerkIcon}>
                    <PerkIcon
                      name={partner.perk_icon}
                      size={20}
                      color={stripeColor ?? colors.primary}
                    />
                  </View>
                  <Text
                    style={[bodyType.regular, styles.modalPerkText, {color: colors.textSecondary}]}>
                    {partner.perk_text}
                  </Text>
                </View>
              )}

              <Pressable
                onPress={goToPartnerRosterFromPopover}
                disabled={!partner}
                style={({pressed}) => [
                  styles.modalCta,
                  {backgroundColor: stripeColor ?? colors.primary, opacity: pressed ? 0.85 : 1},
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${partnerName ?? 'partner'} roster`}>
                <Text style={[bodyType.bold, styles.modalCtaText, {color: colors.onPrimary}]}>
                  View partner roster
                </Text>
              </Pressable>
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
  stripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  gearBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    padding: 4,
    zIndex: 2,
  },
  // When the card has a partner zone (alignment row + perk row), the zone
  // occupies more space at the bottom. Bump the gear above the divider
  // line so it stays in the rank-row strip.
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
  // Smaller superscript-ish suffix so "4th" reads cleanly next to the
  // emphasized rank numeral without dominating it.
  rankSuffix: {
    fontSize: 11,
  },
  rankSpacer: {
    width: 6,
  },
  movementText: {
    fontSize: 12,
    fontWeight: '700',
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
  weekRankPts: {
    fontSize: 12,
    fontWeight: '700',
  },
  weekRankPtsUnit: {
    fontSize: 10,
    fontWeight: '500',
  },
  lastWeekLine: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  rankDot: {
    fontSize: 13,
  },
  deltaText: {
    fontSize: 13,
    fontWeight: '600',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  alignText: {
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
  modalHeader: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingTop: 8,
  },
  modalLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
  },
  modalName: {
    fontSize: 17,
    lineHeight: 19,
    textAlign: 'center',
  },
  modalPerkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
  },
  modalPerkIcon: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPerkText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  modalCta: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  modalCtaText: {
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
