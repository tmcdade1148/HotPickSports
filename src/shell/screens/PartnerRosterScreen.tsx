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

import React, {useEffect, useState} from 'react';
import {Text} from '@shared/components/AppText';
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
import {compositeOver, hexToRgba, readableOn} from '@shared/utils/color';
import {ModuleSection} from '@shell/components/home/ModuleSection';
import {LEXICON} from '@shared/lexicon';
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
  const {colors, isDark} = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Params, 'PartnerRoster'>>();
  const slug = route.params.slug;
  // Preview mode: a Director opening their own roster page from League
  // Tools. They may not be a Player in any roster Contest, so skip the
  // membership-scoped denial and render the public page as members see it.
  const preview = route.params.preview ?? false;

  const userId           = useGlobalStore(s => s.user?.id);
  // visiblePools and poolAffiliations are deliberately NOT read here any more.
  // Both are scoped to the active competition, which is what made this page
  // competition-scoped by accident — see the alignedPools note below.
  const markRead         = useGlobalStore(s => s.markPartnerNotificationsRead);
  const openPoolInCompetition = useGlobalStore(s => s.openPoolInCompetition);

  const [partner, setPartner]      = useState<PartnerRow | null>(null);
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [loading, setLoading]      = useState(true);
  // Declared HERE, with the other hooks, and not down beside the banner
  // derivations where it reads more naturally: this screen early-returns three
  // times (loading, denial, tombstone) before that point, so a hook below them
  // runs on some renders and not others. React tracks hooks by call order, so
  // that is a runtime throw, not a lint preference. The plain derivations
  // (bannerMap / bannerUrl / onBanner) stay put — they are not hooks.
  const [bannerFailed, setBannerFailed] = useState(false);

  // Aligned pools the user actually belongs to with this partner.
  // A pool connects to a Club via ANY of three paths (must match the
  // HomeScreen YOUR CLUBS partition exactly, or a Club tile can open to
  // an empty roster):
  //   1. pool.owning_club_id === partner.id  (Official Club Contest)
  //   2. pool has a row in pool_partner_affiliations for this partner
  //   3. pool.partner_id === partner.id      (legacy single-Club)
  //
  // FETCHED HERE, ACROSS EVERY COMPETITION — deliberately NOT from
  // visiblePools. fetchUserPools scopes that list to the one selected
  // competition, so the clubhouse silently inherited competition scoping
  // nobody chose: verified 2026-08-23, with the picker on nfl_2026_pre The
  // Natural NFL26 (nfl_2026) vanished from its own Club's page while Tom was
  // its Gaffer, and reappeared on switching the picker. A Club is not
  // competition-scoped; The Natural is The Natural in August and in December.
  //
  // Membership is the only filter (Decisions 2 and 3): a roster Contest full
  // of strangers is not the viewer's business, and showing it would surface
  // standings they have no relationship to.
  const [alignedPools, setAlignedPools] = useState<DbPool[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!partner || !userId) {
      setAlignedPools([]);
      return;
    }
    (async () => {
      // Archived/deleted predicates mirror fetchUserPools' membership leg
      // exactly (globalStore.ts) rather than inventing a second definition of
      // "a Contest you can still open". Only the competition filter is absent.
      const [memberRes, affRes] = await Promise.all([
        supabase
          .from('pool_members')
          .select('pools!inner(*)')
          .eq('user_id', userId)
          .eq('status', 'active')
          .eq('pools.is_archived', false)
          .is('pools.deleted_at', null),
        supabase
          .from('pool_partner_affiliations')
          .select('pool_id')
          .eq('partner_id', partner.id),
      ]);
      if (cancelled) return;

      const affiliatedPoolIds = new Set(
        ((affRes.data ?? []) as {pool_id: string}[]).map(r => r.pool_id),
      );
      const mine = ((memberRes.data ?? []) as unknown as {pools: DbPool}[])
        .map(r => r.pools)
        .filter(Boolean);

      setAlignedPools(
        mine.filter(
          p =>
            p.owning_club_id === partner.id ||
            p.partner_id === partner.id ||
            affiliatedPoolIds.has(p.id),
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [partner, userId]);

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
  // preview mode — a Director previewing their own page need not be a member.
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

  // Tint strengths first — the derived text colors below have to be computed
  // against the surfaces these produce.
  const partnerTintAlpha = isDark ? 0.22 : 0.08;
  const partnerTintStrong = isDark ? 0.3 : 0.2;

  // ONE lifted color per SURFACE. Lifting for one surface and rendering on
  // another is what made the address the least legible thing on this page in
  // both modes.
  //
  // Raw partnerPrimary still paints solid fills, stripes, borders and the
  // logo background. Those are decorative, sit against theme surfaces, and
  // shifting them would visibly alter the Club's identity.
  //
  //   partnerTextOnTint    perk card AND Roster Pass card. Both are
  //                        hexToRgba(brand, partnerTintAlpha) over the page, so
  //                        the contrast target is that COMPOSITE, not the page.
  //   partnerTextOnSurface the "View Contest ›" CTA, which sits on
  //                        colors.surface — a different surface again, and in
  //                        dark mode surface is lighter than background, so a
  //                        color lifted for the page is under-contrasted here.
  //
  // There is deliberately NO on-the-page variant any more. It existed for the
  // three section labels; those are now ModuleSection, which is grey, so it
  // had zero consumers left. Its 7:1 tuning went with it rather than sitting
  // here looking like it still governs something.
  //
  // The address is absent for a different reason: it renders white on the
  // header scrim, so no lifted brand color is involved at all.
  const partnerTextOnTint = readableOn(
    partnerPrimary,
    compositeOver(partnerPrimary, colors.background, partnerTintAlpha),
  );
  const partnerTextOnSurface = readableOn(partnerPrimary, colors.surface);

  // The uploaded banner (1200x630). Wired at creation since the start but never
  // rendered — the create form's own copy said "wired now, rendered later".
  const bannerMap = (bc.banner ?? {}) as Record<string, unknown>;
  const bannerUrl =
    typeof bannerMap.full === 'string' && bannerMap.full.length > 0
      ? bannerMap.full
      : null;
  // Drives every over-the-photo treatment. False whenever there is no banner
  // OR the load failed, which is also what makes the fallback path total.
  // (`bannerFailed` itself is declared with the hooks at the top — see there.)
  const onBanner = Boolean(bannerUrl) && !bannerFailed;

  // One definition of "text on the scrim", not the same four properties
  // repeated at the title, the address and the hours. Colours come from theme
  // tokens (Hard Rule #9) — the scrim set is mode-independent by design, but
  // it is still the theme's to define, not this screen's.
  const onScrimText = {
    color: colors.onScrim,
    textShadowColor: colors.onScrimShadow,
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  } as const;

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
  // Open a roster Contest's LADDER (Decision 4 — the reader is already a
  // member; the question they arrive with is standing, not who else is here).
  //
  // The Ladder is a TAB, not a stack screen: MainTabNavigator renders
  // SeasonBoardScreen, which reads the GLOBAL active pool. So this sets the
  // active pool and moves to the tab — there is no navigate('Ladder', {poolId}).
  //
  // The Contest may also be in a different competition than the one selected,
  // which is exactly The Natural's situation and the reason §3 exists. That
  // switch runs through globalStore.openPoolInCompetition — the app's existing
  // sequence, extracted from the invite-join flow rather than re-written here
  // (Red Flag #2). Per Hard Rule #20 the global switch is correct, not a side
  // effect: Home, Picks, Ladder and Chirps all follow the active pool.
  const openContest = async (pool: DbPool) => {
    const ok = await openPoolInCompetition(pool.id, pool.competition);
    if (!ok) {
      Alert.alert(
        'Contest unavailable',
        `${pool.name} is in a competition that isn't available on your account right now.`,
      );
      return;
    }
    // NOT navigate('LeaderboardTab'). That works from PoolModule,
    // RegularCompleteHero and SuperBowlIntroHero because all three render
    // INSIDE the tab navigator. This screen does not: RootNavigator mounts the
    // whole MainTabNavigator as one stack screen named "Home"
    // (RootNavigator.tsx:244) and pushes PartnerRoster on top of it as a
    // sibling (:255). From up here 'LeaderboardTab' is not a route on this
    // navigator, so the tab switched underneath while the clubhouse stayed on
    // screen — the "doesn't take me anywhere" symptom.
    //
    // navigate('Home', {screen}) is React Navigation's nested-navigator form:
    // it targets the tab navigator by its stack route name and passes the tab
    // through. Because "Home" sits BELOW this screen in the stack, navigating
    // to it also pops the clubhouse — one call does the dismiss and the tab.
    //
    // 'Home' is already proven to resolve from this exact screen: the two
    // DenialState buttons below call navigate('Home') today. Neither of the
    // spec's candidates would have worked — getParent() reaches the container
    // above the root stack, not the tab navigator (which is this stack's
    // CHILD), and goBack() leaves 'LeaderboardTab' just as unresolvable.
    navigation.navigate('Home', {screen: 'LeaderboardTab'});
  };

  // Editable in League Tools; falls back to the platform default.
  const redeemText =
    partner.public_info?.perk_redeem_text?.trim() ||
    // "to a The Natural staff member" — the article breaks for any Partner
    // whose name starts with one. "staff at X" carries no article at all.
    `Show this screen to staff at ${partner.name} to redeem.`;

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

        {/* Branded header. With a banner uploaded it becomes a photo header —
            which is the point: two stacked brand-tinted surfaces (this band and
            the perk card) read as one continuous field, and a photo separates
            them instantly.

            The scrim is a FIXED strength, never tuned to one Partner's image
            (Red Flag #4). It is built from plain stacked Views rather than
            react-native-linear-gradient: that package is in package.json but is
            used NOWHERE in src/, so it has never rendered in this app, and this
            ships as an OTA — leaning on a native module that has never executed
            in the shipped binary is the same shape as the require()'d-image
            trap in CLAUDE.md. Two bands approximate a bottom-weighted scrim
            well enough behind a photo, with zero native surface.

            No banner is the COMMON case, not the edge: the tinted band below is
            what most Partners will see on day one, and it is also the fallback
            when the image fails to load. */}
        <View
          style={[
            styles.brandHeader,
            onBanner
              ? {backgroundColor: colors.surface, borderColor: colors.border}
              : {backgroundColor: hexToRgba(partnerPrimary, partnerTintStrong), borderColor: colors.border},
          ]}>
          {bannerUrl && !bannerFailed && (
            <>
              <Image
                source={{uri: bannerUrl}}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                onError={() => setBannerFailed(true)}
                accessible={false}
              />
              <View style={[StyleSheet.absoluteFill, {backgroundColor: colors.scrim}]} />
              <View style={[styles.scrimBottom, {backgroundColor: colors.scrimStrong}]} />
            </>
          )}
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
              onBanner
                ? onScrimText
                : {color: colors.textPrimary},
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
                  {/* White on the scrim, never brand-coloured (Decision 7) —
                      legible over any uploaded image and any Partner colour, so
                      it cannot break for Partner #6. Off-banner it keeps the
                      theme's secondary text rather than a lifted brand red,
                      which was the least legible thing on the page in both
                      modes precisely because it was lifted for the wrong
                      surface. */}
                  <MapPin size={13} color={onBanner ? colors.onScrim : colors.textSecondary} />
                  <Text
                    style={[
                      bodyType.regular,
                      styles.brandInfoText,
                      styles.brandAddressLink,
                      onBanner ? onScrimText : {color: colors.textSecondary},
                    ]}>
                    {address}
                  </Text>
                </Pressable>
              )}
              {hours && (
                <Text
                  style={[
                    bodyType.regular,
                    styles.brandInfoText,
                    onBanner
                      ? onScrimText
                      : {color: colors.textSecondary},
                  ]}>
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
                backgroundColor: hexToRgba(partnerPrimary, partnerTintAlpha),
                borderColor: partnerPrimary,
              },
            ]}>
            <Text style={[bodyType.bold, styles.perkEyebrow, {color: partnerTextOnTint}]}>
              CLUB PERK
            </Text>
            <PerkIcon
              name={partner.perk_icon}
              size={48}
              color={partnerTextOnTint}
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
        {/* ModuleSection, the same component Home uses for CONTESTS and
            LEAGUES — not a lookalike. Its label is sectionHeaderType * 2 (22px)
            against the 11px this screen hand-rolled, which is the difference
            Tom actually noticed. Grey (its textTertiary), no colour prop: page
            STRUCTURE is HotPick's, and this component is shared across Home.
            The Club keeps its colour inside its own card — the CLUB PERK
            eyebrow below is untouched.

            Note it renders NOTHING without children, so each section's content
            has to sit INSIDE it rather than beside it, and its own horizontal
            padding replaces styles.section's. */}
        <ModuleSection label={`FROM ${partner.name.toUpperCase()}`}>
          <View style={styles.sectionBody}>
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
              Nothing new right now.
            </Text>
          )}
          </View>
        </ModuleSection>

        {/* Aligned pools — flat list, never ranked. Left accent stripe
            in partner color ties pool rows to the partner brand. */}
        <ModuleSection label="ON THIS ROSTER">
          <View style={styles.sectionBody}>
          {alignedPools.map(pool => (
            <Pressable
              key={pool.id}
              onPress={() => openContest(pool)}
              style={({pressed}) => [
                styles.poolRow,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Open the ${pool.name} ${LEXICON.ladder.short}`}>
              <View style={[styles.broadcastStripe, {backgroundColor: partnerPrimary}]} />
              {/* Name and badge slot share a row so an Official shield can be
                  added later without re-laying this out (§8). Deliberately NOT
                  rendered now: with one Contest on the roster, and it being the
                  Official one, a badge tells nobody anything. It earns its
                  place when a venue runs two. */}
              <View style={styles.poolNameRow}>
                <Text
                  style={[bodyType.bold, styles.poolName, {color: colors.textPrimary}]}
                  numberOfLines={1}>
                  {pool.name}
                </Text>
              </View>
              <Text style={[bodyType.regular, styles.poolCta, {color: partnerTextOnSurface}]}>
                View {LEXICON.contest.singular} ›
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
        </ModuleSection>

        {/* Invite a Contest — surfaces the Roster Pass so any Player on this
            page can recruit an organizer to start a Contest under this League.
            Shown only while the League is active. */}
        {partner.is_active && (
          <ModuleSection label="ADD YOUR CONTEST">
            <View style={styles.sectionBody}>
            <View
              style={[
                styles.inviteCard,
                {backgroundColor: hexToRgba(partnerPrimary, partnerTintAlpha), borderColor: partnerPrimary},
              ]}>
              <View style={styles.passRow}>
                <Ticket size={18} color={partnerTextOnTint} strokeWidth={2.25} />
                <Text style={[displayType.display, styles.passText, {color: colors.textPrimary}]}>
                  {formatRosterPass(partner.roster_pass)}
                </Text>
              </View>
              <Text style={[bodyType.regular, styles.passHint, {color: colors.textSecondary}]}>
                Run a Contest of your own? Send yourself this Roster Pass — or
                pass it to a {LEXICON.gaffer.short} you know. They paste it in
                their Contest's Settings → Add/Edit Leagues to join{' '}
                {partner.name}'s roster.
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
                  <Copy size={14} color={partnerTextOnTint} />
                  <Text style={[bodyType.bold, styles.inviteBtnText, {color: partnerTextOnTint}]}>Copy</Text>
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
                  <Share2 size={14} color={partnerTextOnTint} />
                  <Text style={[bodyType.bold, styles.inviteBtnText, {color: partnerTextOnTint}]}>Share</Text>
                </Pressable>
              </View>
            </View>
            </View>
          </ModuleSection>
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
    // Clips the banner image to the rounded corners. Harmless without one —
    // nothing else in this header overflows.
    overflow:          'hidden',
  },
  // Fixed-strength scrim, never tuned to one Partner's photo. Two flat bands
  // instead of a gradient component: react-native-linear-gradient is a
  // dependency but has never rendered anywhere in this app, and this ships as
  // an OTA. A base wash keeps the whole band readable; this bottom band carries
  // the extra weight where text sits. Geometry only — both colours come from
  // theme tokens at the call site (colors.scrim / colors.scrimStrong).
  scrimBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
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
  perkEyebrow: {fontSize: 10, letterSpacing: 2},
  perkIcon:   {fontSize: 48},
  // Stepped down from h2 to h3 (§4.1). The venue name is the single dominant
  // display line on this page; at h2 the perk headline competed with it at
  // near-equal weight and the eye had no clear first read. One hierarchy
  // change, not a type-system rewrite — verify on device.
  perkText: {
    fontSize: displayType.size.h3,
    textAlign: 'center',
    lineHeight: displayType.size.h3 * 1.05,
  },
  redeemHint: {fontSize: 13, textAlign: 'center'},

  // The body under a ModuleSection label. ModuleSection pads its own label row
  // but not its children, and it supplies the top margin — so this carries the
  // horizontal padding and row gap that the old hand-rolled `section` did, and
  // nothing else. `section` and `sectionLabel` are gone: the labels are
  // ModuleSection now, which is where the 11px-vs-22px difference was.
  sectionBody: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
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
  // Row wrapper reserves space beside the name for an Official badge (§8).
  // Structure only — nothing renders in the gap yet.
  poolNameRow: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
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
