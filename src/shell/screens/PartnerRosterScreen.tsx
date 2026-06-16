// src/shell/screens/PartnerRosterScreen.tsx
// Spec: 260513_HotPick_HomeRedesign_Spec.docx §6.5
//
// "[Partner Name]'s Roster" — never "Leaderboard," never "Standings"
// (spec §2 Locked Decisions, May 13 2026). Destination of every
// PartnerModule tap. Flat list of aligned pools; no ranking.
//
// Side effect on mount: writes partner_notification_read_state for the
// (user, partner) pair, which clears the Home indicator for this partner.
//
// Edge cases (spec §6.5):
//   • partner is_active = false  → tombstone state, pools list still renders
//   • partner perk_text is NULL → "being set up" denial (unlikely reachable
//                                  because PartnerModules don't render for
//                                  partners without perks)
//   • user no longer in any aligned pool → denial + Home button

import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import {ChevronLeft, Copy, MapPin, Share2, Ticket} from 'lucide-react-native';
import {PerkIcon} from '@shell/components/home/PerkIcon';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {supabase} from '@shared/config/supabase';
import {PoweredByHotPick} from '@shell/components/PoweredByHotPick';
import {formatRosterPass} from '@shared/utils/format';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import type {DbPool} from '@shared/types/database';

const BROADCAST_LOOKBACK_DAYS = 30;

interface PartnerRow {
  id: string;
  name: string;
  slug: string;
  perk_text: string | null;
  perk_icon: string | null;
  brand_config: Record<string, unknown> | null;
  is_active: boolean;
  roster_pass: string;
  public_info: {
    hours?: string;
    address?: string;
    perk_redeem_text?: string;
    [key: string]: unknown;
  } | null;
}

interface BroadcastRow {
  id: string;
  message: string;
  sent_at: string;
}

type Params = {PartnerRoster: {slug: string; preview?: boolean}};

export function PartnerRosterScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Params, 'PartnerRoster'>>();
  const slug = route.params.slug;
  // Preview mode: a Chairman/Director opening their own roster page from League
  // Tools. They may not be a Player in any roster Contest, so skip the
  // membership-scoped denial and render the public page as members see it.
  const preview = route.params.preview ?? false;

  const userId           = useGlobalStore(s => s.user?.id);
  const visiblePools     = useGlobalStore(s => s.visiblePools);
  const poolAffiliations = useGlobalStore(s => s.poolAffiliations);
  const markRead         = useGlobalStore(s => s.markPartnerNotificationsRead);

  const [partner, setPartner]      = useState<PartnerRow | null>(null);
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [loading, setLoading]      = useState(true);

  // Aligned pools the user actually belongs to with this partner.
  // A pool connects to a Club via ANY of three paths (must match the
  // HomeScreen YOUR CLUBS partition exactly, or a Club tile can open to
  // an empty roster):
  //   1. pool.owning_club_id === partner.id  (Official Club Contest)
  //   2. pool has a row in pool_partner_affiliations for this partner
  //   3. pool.partner_id === partner.id      (legacy single-Club)
  const alignedPools: DbPool[] = useMemo(() => {
    if (!partner) return [];
    return visiblePools.filter(p => {
      if (p.owning_club_id === partner.id) return true;
      if (p.partner_id === partner.id) return true;
      const affiliates = poolAffiliations[p.id] ?? [];
      return affiliates.some(a => a.partnerId === partner.id);
    });
  }, [partner, visiblePools, poolAffiliations]);

  // ---------------------------------------------------------------------------
  // Fetch partner + broadcasts.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const {data: partnerData} = await supabase
        .from('partners')
        .select('id, name, slug, perk_text, perk_icon, brand_config, is_active, roster_pass, public_info')
        .eq('slug', slug)
        .maybeSingle();
      if (cancelled) return;

      if (!partnerData) {
        setPartner(null);
        setLoading(false);
        return;
      }

      const sinceIso = new Date(Date.now() - BROADCAST_LOOKBACK_DAYS * 86_400_000)
        .toISOString();
      const {data: broadcastData} = await supabase
        .from('partner_notifications')
        .select('id, message, sent_at')
        .eq('partner_id', partnerData.id)
        .gte('sent_at', sinceIso)
        .order('sent_at', {ascending: false});
      if (cancelled) return;

      setPartner(partnerData as PartnerRow);
      setBroadcasts((broadcastData ?? []) as BroadcastRow[]);
      setLoading(false);

      // Side effect — mark read on entry. Clears the Home indicator.
      if (userId && partnerData.is_active) {
        markRead(userId, partnerData.id).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, userId, markRead]);

  // ---------------------------------------------------------------------------
  // Render branches
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <SafeAreaView style={[styles.centerWrap, {backgroundColor: colors.background}]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!partner) {
    return (
      <DenialState
        title="League not found"
        body="This roster doesn't exist or has been removed."
        onHome={() => navigation.navigate('Home')}
      />
    );
  }

  // Denial: user is not in any aligned pool (e.g. stale deep link). Skipped in
  // preview mode — a Chairman previewing their own page need not be a member.
  if (!preview && alignedPools.length === 0) {
    return (
      <DenialState
        title="You're not on this League's roster"
        body="Join a Contest on their roster to see it again."
        onHome={() => navigation.navigate('Home')}
      />
    );
  }

  // Tombstone: partner has been deactivated. Pools still render.
  const showTombstone = !partner.is_active;
  // Denial-lite: partner not yet set up (perk missing).
  const showSetupNotice = partner.is_active && !partner.perk_text;

  const bc = (partner.brand_config ?? {}) as Record<string, unknown>;
  const logoMap = (bc.logo ?? {}) as Record<string, unknown>;
  const logoUrl = typeof logoMap.full === 'string' ? logoMap.full : null;
  const partnerPrimary = typeof bc.primary_color === 'string'
    ? bc.primary_color
    : colors.primary;

  const hours = partner.public_info?.hours?.trim() || null;
  const address = partner.public_info?.address?.trim() || null;
  // Tapping the address opens the platform maps app (Apple Maps on iOS,
  // the geo: handler — usually Google Maps — on Android).
  const openMaps = () => {
    if (!address) return;
    const q = encodeURIComponent(address);
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${q}`,
      android: `geo:0,0?q=${q}`,
      default: `https://www.google.com/maps/search/?api=1&query=${q}`,
    })!;
    Linking.openURL(url).catch(() => {});
  };
  // Editable in League Tools; falls back to the platform default.
  const redeemText =
    partner.public_info?.perk_redeem_text?.trim() ||
    `Show this screen to a ${partner.name} staff member to redeem.`;

  return (
    <SafeAreaView style={[styles.wrap, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <ChevronLeft color={colors.textPrimary} size={24} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {preview && (
          <View style={[styles.notice, styles.noticeTop, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.bold, {color: colors.textPrimary}]}>Preview</Text>
            <Text style={[bodyType.regular, styles.noticeBody, {color: colors.textSecondary}]}>
              This is how your roster page looks to Players.
            </Text>
          </View>
        )}

        {/* Branded header */}
        <View
          style={[
            styles.brandHeader,
            {backgroundColor: partnerPrimary + '33', borderColor: colors.border},
          ]}>
          {logoUrl ? (
            <Image source={{uri: logoUrl}} style={styles.brandLogo} />
          ) : (
            <View style={[styles.brandLogo, styles.logoFallback, {backgroundColor: partnerPrimary}]}>
              <Text style={[styles.logoFallbackText, {color: colors.onPrimary}]}>
                {partner.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text
            style={[
              displayType.display,
              styles.brandName,
              {color: colors.textPrimary},
            ]}>
            {partner.name.toUpperCase()}'S LEAGUE ROSTER
          </Text>
          {(address || hours) && (
            <View style={styles.brandMeta}>
              {address && (
                <Pressable
                  onPress={openMaps}
                  hitSlop={6}
                  style={({pressed}) => [styles.brandInfoRow, {opacity: pressed ? 0.6 : 1}]}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${address} in Maps`}>
                  <MapPin size={13} color={partnerPrimary} />
                  <Text
                    style={[
                      bodyType.regular,
                      styles.brandInfoText,
                      styles.brandAddressLink,
                      {color: partnerPrimary},
                    ]}>
                    {address}
                  </Text>
                </Pressable>
              )}
              {hours && (
                <Text style={[bodyType.regular, styles.brandInfoText, {color: colors.textSecondary}]}>
                  {hours}
                </Text>
              )}
            </View>
          )}
        </View>

        {showTombstone && (
          <View style={[styles.notice, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.bold, {color: colors.textPrimary}]}>
              This League is no longer active.
            </Text>
            <Text style={[bodyType.regular, styles.noticeBody, {color: colors.textSecondary}]}>
              Your Contest remains. Broadcasts and perks are paused.
            </Text>
          </View>
        )}

        {showSetupNotice && (
          <View style={[styles.notice, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.bold, {color: colors.textPrimary}]}>
              This League is being set up.
            </Text>
            <Text style={[bodyType.regular, styles.noticeBody, {color: colors.textSecondary}]}>
              Check back soon.
            </Text>
          </View>
        )}

        {/* Perk hero — only when partner is active AND has a perk.
            Tinted with partner color so the perk feels owned by the
            partner, not generic HotPick chrome. */}
        {partner.is_active && partner.perk_text && (
          <View
            style={[
              styles.perkHero,
              {
                backgroundColor: partnerPrimary + '14',
                borderColor: partnerPrimary,
              },
            ]}>
            <Text style={[bodyType.bold, styles.perkEyebrow, {color: partnerPrimary}]}>
              CLUB PERK
            </Text>
            <PerkIcon
              name={partner.perk_icon}
              size={48}
              color={partnerPrimary}
              emojiStyle={styles.perkIcon}
            />

            <Text
              style={[
                displayType.display,
                styles.perkText,
                {color: colors.textPrimary},
              ]}>
              {partner.perk_text}
            </Text>
            <Text style={[bodyType.regular, styles.redeemHint, {color: colors.textSecondary}]}>
              {redeemText}
            </Text>
          </View>
        )}

        {/* Broadcast feed — rows use a left accent stripe in partner color
            so the messages read as coming from the partner, not HotPick. */}
        <View style={styles.section}>
          <Text style={[bodyType.bold, styles.sectionLabel, {color: partnerPrimary}]}>
            FROM {partner.name.toUpperCase()}
          </Text>
          {broadcasts.length > 0 ? (
            broadcasts.map(b => (
              <View
                key={b.id}
                style={[
                  styles.broadcastRow,
                  {backgroundColor: colors.surface, borderColor: colors.border},
                ]}>
                <View style={[styles.broadcastStripe, {backgroundColor: partnerPrimary}]} />
                <View style={styles.broadcastBody}>
                  <Text style={[bodyType.regular, styles.broadcastText, {color: colors.textPrimary}]}>
                    {b.message}
                  </Text>
                  <Text style={[bodyType.regular, styles.broadcastTime, {color: colors.textTertiary}]}>
                    {formatRelative(b.sent_at)}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[bodyType.regular, styles.emptyLine, {color: colors.textTertiary}]}>
              No recent messages from {partner.name}.
            </Text>
          )}
        </View>

        {/* Aligned pools — flat list, never ranked. Left accent stripe
            in partner color ties pool rows to the partner brand. */}
        <View style={styles.section}>
          <Text style={[bodyType.bold, styles.sectionLabel, {color: partnerPrimary}]}>
            {partner.name.toUpperCase()}'S CONTESTS
          </Text>
          {alignedPools.map(pool => (
            <Pressable
              key={pool.id}
              onPress={() => {
                navigation.navigate('PoolMembers', {poolId: pool.id});
              }}
              style={({pressed}) => [
                styles.poolRow,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`View ${pool.name} Contest`}>
              <View style={[styles.broadcastStripe, {backgroundColor: partnerPrimary}]} />
              <Text
                style={[bodyType.bold, styles.poolName, {color: colors.textPrimary}]}
                numberOfLines={1}>
                {pool.name}
              </Text>
              <Text style={[bodyType.regular, styles.poolCta, {color: partnerPrimary}]}>
                View Contest ›
              </Text>
            </Pressable>
          ))}
          {preview && alignedPools.length === 0 && (
            <Text style={[bodyType.regular, styles.emptyLine, {color: colors.textTertiary}]}>
              Contests that join your roster show up here for their Players.
            </Text>
          )}
          <Text
            style={[bodyType.regular, styles.smackPlaceholder, {color: colors.textTertiary}]}>
            💬 Cross-Contest chat coming to your roster — stay tuned.
          </Text>
        </View>

        {/* Invite a Contest — surfaces the Roster Pass so any Player on this
            page can recruit an organizer to start a Contest under this League.
            Shown only while the League is active. */}
        {partner.is_active && (
          <View style={styles.section}>
            <Text style={[bodyType.bold, styles.sectionLabel, {color: partnerPrimary}]}>
              RUN A CONTEST ON THIS ROSTER?
            </Text>
            <View
              style={[
                styles.inviteCard,
                {backgroundColor: partnerPrimary + '14', borderColor: partnerPrimary},
              ]}>
              <View style={styles.passRow}>
                <Ticket size={18} color={partnerPrimary} strokeWidth={2.25} />
                <Text style={[displayType.display, styles.passText, {color: colors.textPrimary}]}>
                  {formatRosterPass(partner.roster_pass)}
                </Text>
              </View>
              <Text style={[bodyType.regular, styles.passHint, {color: colors.textSecondary}]}>
                Know an organizer? Send them this Roster Pass. They paste it in
                their Contest's Settings → Add/Edit Leagues to join {partner.name}'s roster.
              </Text>
              <View style={styles.passActions}>
                <Pressable
                  onPress={() => {
                    Clipboard.setString(formatRosterPass(partner.roster_pass));
                    Alert.alert('Copied', 'Roster Pass copied to clipboard.');
                  }}
                  style={[styles.inviteBtn, {borderColor: partnerPrimary}]}
                  accessibilityRole="button"
                  accessibilityLabel="Copy Roster Pass">
                  <Copy size={14} color={partnerPrimary} />
                  <Text style={[bodyType.bold, styles.inviteBtnText, {color: partnerPrimary}]}>Copy</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Share.share({
                      message:
                        `Add your HotPick Contest to ${partner.name}'s roster. ` +
                        `Open Contest Settings → Add/Edit Leagues and enter pass: ` +
                        `${formatRosterPass(partner.roster_pass)}`,
                    }).catch(() => {});
                  }}
                  style={[styles.inviteBtn, {borderColor: partnerPrimary}]}
                  accessibilityRole="button"
                  accessibilityLabel="Share Roster Pass">
                  <Share2 size={14} color={partnerPrimary} />
                  <Text style={[bodyType.bold, styles.inviteBtnText, {color: partnerPrimary}]}>Share</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <PoweredByHotPick />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function DenialState({
  title,
  body,
  onHome,
}: {
  title: string;
  body: string;
  onHome: () => void;
}) {
  const {colors} = useTheme();
  return (
    <SafeAreaView style={[styles.centerWrap, {backgroundColor: colors.background}]}>
      <Text style={[displayType.display, {fontSize: displayType.size.h2, color: colors.textPrimary, textAlign: 'center'}]}>
        {title.toUpperCase()}
      </Text>
      <Text style={[bodyType.regular, styles.denialBody, {color: colors.textSecondary}]}>
        {body}
      </Text>
      <Pressable
        onPress={onHome}
        style={({pressed}) => [
          styles.denialCta,
          {backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1},
        ]}>
        <Text style={[bodyType.bold, styles.denialCtaText, {color: colors.onPrimary}]}>Return to HotPick Home</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins   = Math.floor(diffMs / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ===========================================================================
// Styles
// ===========================================================================

const styles = StyleSheet.create({
  wrap:       {flex: 1},
  centerWrap: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg},
  header:     {paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm},
  scroll:     {paddingBottom: spacing.xxl},

  brandHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.xl,
    borderRadius:      borderRadius.lg + 4,
    borderWidth:       StyleSheet.hairlineWidth,
    marginHorizontal:  spacing.lg,
    alignItems:        'center',
    gap:               spacing.md,
  },
  brandLogo: {
    width:         72,
    height:        72,
    borderRadius:  999,
  },
  logoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    fontSize: 32,
    fontFamily: 'Manrope-Bold',
  },
  brandName: {
    fontSize:   displayType.size.h2,
    textAlign:  'center',
    lineHeight: displayType.size.h2 * 1.05,
  },
  brandMeta: {
    alignItems: 'center',
    gap:        2,
  },
  brandInfoRow: {
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent: 'center',
    gap:           4,
    paddingHorizontal: spacing.sm,
  },
  brandInfoText: {fontSize: 13, textAlign: 'center', flexShrink: 1},
  brandAddressLink: {textDecorationLine: 'underline'},

  notice: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noticeTop: {marginTop: spacing.xs, marginBottom: spacing.xs},
  noticeBody: {fontSize: 13, marginTop: 4},

  perkHero: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.xl,
    borderRadius: borderRadius.lg + 4,
    borderWidth: 1,
    alignItems: 'center',
    gap: spacing.md,
  },
  perkEyebrow: {fontSize: 10, letterSpacing: 1.6},
  perkIcon:   {fontSize: 48},
  perkText: {
    fontSize: displayType.size.h2,
    textAlign: 'center',
    lineHeight: displayType.size.h2 * 1.05,
  },
  redeemHint: {fontSize: 13, textAlign: 'center'},

  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  sectionLabel: {fontSize: 11, letterSpacing: 1.6, marginBottom: 2},
  emptyLine: {fontSize: 13, fontStyle: 'italic', paddingVertical: spacing.sm},

  broadcastRow: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  broadcastStripe: {
    width: 3,
  },
  broadcastBody: {
    flex: 1,
    padding: spacing.md,
    gap: 4,
  },
  broadcastText: {fontSize: 14, lineHeight: 20},
  broadcastTime: {fontSize: 11},

  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  poolName: {flex: 1, fontSize: 15, paddingLeft: spacing.md, paddingRight: spacing.sm},
  poolCta:  {fontSize: 13, fontFamily: 'Manrope-Bold'},
  smackPlaceholder: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },

  inviteCard: {
    borderRadius: borderRadius.lg + 4,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  passText: {
    fontSize: displayType.size.h3,
    letterSpacing: 2,
  },
  passHint: {fontSize: 13, lineHeight: 19},
  passActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  inviteBtnText: {fontSize: 13},

  footer: {marginTop: spacing.xl, alignItems: 'center'},

  denialBody:    {fontSize: 14, textAlign: 'center', lineHeight: 20},
  denialCta: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  denialCtaText: {fontSize: 14, letterSpacing: 0.5, textTransform: 'uppercase'},
});
