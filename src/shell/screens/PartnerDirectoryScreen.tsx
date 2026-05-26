// Organizer-side Club directory. Lists active Clubs; tapping one affiliates
// the calling Contest with that Club via `add_pool_affiliation`. A Contest
// can be affiliated with many Clubs simultaneously — each affiliation
// surfaces that Club's brand + perk to the Contest's members.
//
// "Users join Contests, the Gaffer affiliates with Clubs." This screen is
// the Gaffer's join-a-roster surface.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import {ChevronLeft, Check, X as XIcon} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';
import {readableTextOn} from '@shared/utils/color';

type PartnerRow = {
  id: string;
  name: string;
  slug: string;
  perk_text: string | null;
  perk_icon: string | null;
  brand_config: Record<string, unknown> | null;
  is_active: boolean;
  can_run_pools: boolean;
  partner_type: string | null;
};

type Params = {PartnerDirectory: {poolId: string}};

function resolvePartnerLogo(bc: Record<string, unknown> | null): string | null {
  if (!bc) return null;
  const nested = (bc.logo ?? {}) as Record<string, unknown>;
  if (typeof nested.full === 'string' && nested.full.length > 0) return nested.full;
  if (typeof bc.logo_url === 'string' && bc.logo_url.length > 0) return bc.logo_url;
  return null;
}

export function PartnerDirectoryScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Params, 'PartnerDirectory'>>();
  const poolId = route.params.poolId;

  const updatePoolBrandConfig = useGlobalStore(s => s.updatePoolBrandConfig);
  const loadPoolAffiliations  = useGlobalStore(s => s.loadPoolAffiliations);

  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  // Multi-affiliation state: the set of partner_ids the pool is currently
  // affiliated with, sourced from pool_partner_affiliations.
  const [affiliatedIds, setAffiliatedIds] = useState<Set<string>>(new Set());

  const refreshAffiliations = useCallback(async () => {
    const {data} = await supabase
      .from('pool_partner_affiliations')
      .select('partner_id')
      .eq('pool_id', poolId);
    setAffiliatedIds(
      new Set(((data ?? []) as {partner_id: string}[]).map(r => r.partner_id)),
    );
  }, [poolId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{data: partnerData}] = await Promise.all([
        supabase
          .from('partners')
          .select('id, name, slug, perk_text, perk_icon, brand_config, is_active, can_run_pools, partner_type')
          .eq('is_active', true)
          .order('name', {ascending: true}),
        refreshAffiliations(),
      ]);
      if (cancelled) return;
      setPartners((partnerData ?? []) as PartnerRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [poolId, refreshAffiliations]);

  const handleAffiliate = async (partner: PartnerRow) => {
    setWorking(partner.id);
    // SECURITY DEFINER RPC: gates on organizer role, snapshots the Club's
    // current brand_config server-side (caller can't forge it). First
    // affiliation on a pool is auto-flagged primary by the RPC.
    const {error} = await supabase.rpc('add_pool_affiliation', {
      p_pool_id:    poolId,
      p_partner_id: partner.id,
      p_is_primary: false,
    });
    setWorking(null);
    if (error) {
      Alert.alert('Could not affiliate', error.message);
      return;
    }
    await refreshAffiliations();
    // Refresh the Home Screen's cached affiliations so Contest cards pick
    // up the new logo cluster on next render.
    loadPoolAffiliations([poolId]).catch(() => {});
    // Keep brand_config snapshot on the pool in sync — the DB trigger
    // handles primary-affiliation rotation, but the in-memory pool record
    // needs the new brand for the active session.
    updatePoolBrandConfig(poolId, (partner.brand_config as any) ?? null);
  };

  const handleRemove = (partner: PartnerRow) => {
    Alert.alert(
      `Remove affiliation with ${partner.name}?`,
      `Your Contest will lose ${partner.name}’s brand, perk, and broadcasts. You can re-affiliate any time.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setWorking(partner.id);
            const {error} = await supabase.rpc('remove_pool_affiliation', {
              p_pool_id:    poolId,
              p_partner_id: partner.id,
            });
            setWorking(null);
            if (error) {
              Alert.alert('Could not remove', error.message);
              return;
            }
            await refreshAffiliations();
            loadPoolAffiliations([poolId]).catch(() => {});
          },
        },
      ],
    );
  };

  const affiliatedPartners = useMemo(
    () => partners.filter(p => affiliatedIds.has(p.id)),
    [partners, affiliatedIds],
  );

  return (
    <SafeAreaView style={[styles.wrap, {backgroundColor: colors.background}]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft color={colors.textPrimary} size={24} />
        </Pressable>
        <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
          AFFILIATE WITH A CLUB
        </Text>
        <View style={{width: 24}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[bodyType.regular, styles.intro, {color: colors.textSecondary}]}>
          Affiliate your Contest with one or more Clubs. Each Club's brand
          and perk surfaces to your members; their broadcasts reach them too.
        </Text>

        {affiliatedPartners.length > 0 && (
          <View style={[styles.alignedCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.bold, styles.alignedTitle, {color: colors.textPrimary}]}>
              Currently affiliated with
            </Text>
            {affiliatedPartners.map(p => (
              <View key={p.id} style={styles.alignedRow}>
                <Text style={[bodyType.regular, {color: colors.textPrimary}]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Pressable
                  onPress={() => handleRemove(p)}
                  disabled={working === p.id}
                  hitSlop={6}
                  style={({pressed}) => [styles.removeBtn, {opacity: pressed ? 0.6 : 1}]}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove affiliation with ${p.name}`}>
                  {working === p.id ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <>
                      <XIcon size={12} color={colors.error} strokeWidth={2.25} />
                      <Text style={[bodyType.bold, styles.removeText, {color: colors.error}]}>
                        Remove
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{marginTop: spacing.xl}} />
        ) : partners.length === 0 ? (
          <Text style={[bodyType.regular, {color: colors.textTertiary, padding: spacing.lg}]}>
            No Clubs are currently active.
          </Text>
        ) : (
          partners.map(partner => {
            const logo = resolvePartnerLogo(partner.brand_config);
            const isAffiliated = affiliatedIds.has(partner.id);
            const isWorking = working === partner.id;
            const partnerPrimary =
              (partner.brand_config?.primary_color as string | undefined) ?? colors.primary;
            return (
              <Pressable
                key={partner.id}
                onPress={() => (isAffiliated ? handleRemove(partner) : handleAffiliate(partner))}
                disabled={isWorking}
                style={({pressed}) => [
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isAffiliated ? partnerPrimary : colors.border,
                    borderWidth: isAffiliated ? 2 : 1,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  isAffiliated
                    ? `${partner.name}, currently affiliated — tap to remove`
                    : `Affiliate Contest with ${partner.name}`
                }
                accessibilityState={{disabled: isWorking, selected: isAffiliated}}>
                <View style={[styles.cardStripe, {backgroundColor: partnerPrimary}]} />
                {logo ? (
                  <Image source={{uri: logo}} style={styles.cardLogo} resizeMode="contain" />
                ) : (
                  <View style={[styles.cardLogo, {backgroundColor: partnerPrimary, alignItems: 'center', justifyContent: 'center'}]}>
                    <Text style={{color: readableTextOn(partnerPrimary), fontWeight: '700'}}>
                      {partner.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={[bodyType.bold, styles.cardName, {color: colors.textPrimary}]} numberOfLines={1}>
                    {partner.name}
                  </Text>
                  {partner.perk_text && (
                    <Text style={[bodyType.regular, styles.cardPerk, {color: colors.textSecondary}]} numberOfLines={2}>
                      {partner.perk_text}
                    </Text>
                  )}
                  <Text style={[bodyType.regular, styles.cardMeta, {color: colors.textTertiary}]}>
                    {partner.partner_type ? partner.partner_type.toUpperCase() : 'CLUB'}
                    {partner.can_run_pools ? ' · runs Contests' : ' · sponsor only'}
                  </Text>
                </View>
                {isWorking ? (
                  <ActivityIndicator size="small" color={partnerPrimary} />
                ) : isAffiliated ? (
                  <Check size={20} color={partnerPrimary} strokeWidth={2.5} />
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: {fontSize: 16, letterSpacing: 1.5},
  scroll: {paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg, gap: spacing.sm},
  intro: {fontSize: 13, marginBottom: spacing.md, lineHeight: 18},
  alignedCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 8,
  },
  alignedTitle: {
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  alignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  removeText: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    padding: spacing.md,
    position: 'relative',
  },
  cardStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  cardLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  cardBody: {flex: 1, minWidth: 0, gap: 2},
  cardName: {fontSize: 15},
  cardPerk: {fontSize: 12, lineHeight: 16},
  cardMeta: {fontSize: 10, letterSpacing: 1, marginTop: 2},
});
