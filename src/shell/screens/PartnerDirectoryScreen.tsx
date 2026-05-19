// Organizer-side partner directory. Lists active partners; tapping one
// aligns the calling pool with that partner by snapshotting the partner's
// brand_config onto the pool and setting pool.partner_id + invite_slug.
//
// "Users join pools, organizers join rosters." This screen is the
// organizer's join-roster surface.

import React, {useEffect, useMemo, useState} from 'react';
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
import {ChevronLeft, Check} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';

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

  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [aligning, setAligning] = useState<string | null>(null);
  const [currentPartnerId, setCurrentPartnerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{data: partnerData}, {data: poolData}] = await Promise.all([
        supabase
          .from('partners')
          .select('id, name, slug, perk_text, perk_icon, brand_config, is_active, can_run_pools, partner_type')
          .eq('is_active', true)
          .order('name', {ascending: true}),
        supabase.from('pools').select('partner_id').eq('id', poolId).maybeSingle(),
      ]);
      if (cancelled) return;
      setPartners((partnerData ?? []) as PartnerRow[]);
      setCurrentPartnerId(poolData?.partner_id ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [poolId]);

  const handleAlign = async (partner: PartnerRow) => {
    setAligning(partner.id);
    const {error} = await supabase
      .from('pools')
      .update({
        brand_config: partner.brand_config as unknown,
        partner_id: partner.id,
        invite_slug: partner.slug,
      })
      .eq('id', poolId);
    setAligning(null);
    if (error) {
      Alert.alert('Could not align', error.message);
      return;
    }
    updatePoolBrandConfig(poolId, (partner.brand_config as any) ?? null);
    setCurrentPartnerId(partner.id);
    Alert.alert(
      'Roster joined',
      `Your pool is now on ${partner.name}'s roster. Their brand and perk will surface to your members.`,
      [{text: 'OK', onPress: () => navigation.goBack()}],
    );
  };

  const handleRemoveAlignment = async () => {
    setAligning('__none__');
    const {error} = await supabase
      .from('pools')
      .update({brand_config: null, partner_id: null})
      .eq('id', poolId);
    setAligning(null);
    if (error) {
      Alert.alert('Could not remove', error.message);
      return;
    }
    updatePoolBrandConfig(poolId, null);
    setCurrentPartnerId(null);
  };

  const aligned = useMemo(
    () => partners.find(p => p.id === currentPartnerId) ?? null,
    [partners, currentPartnerId],
  );

  return (
    <SafeAreaView style={[styles.wrap, {backgroundColor: colors.background}]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <ChevronLeft color={colors.textPrimary} size={24} />
        </Pressable>
        <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
          ALIGN WITH A PARTNER
        </Text>
        <View style={{width: 24}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[bodyType.regular, styles.intro, {color: colors.textSecondary}]}>
          Pick a partner to join their roster. Your pool will inherit their brand,
          surface their perk, and receive their broadcasts.
        </Text>

        {aligned && (
          <View style={[styles.alignedCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.bold, {color: colors.textPrimary}]}>
              Currently on {aligned.name}'s roster
            </Text>
            <Pressable
              onPress={handleRemoveAlignment}
              disabled={aligning === '__none__'}
              style={({pressed}) => [{opacity: pressed ? 0.6 : 1}]}>
              <Text style={[bodyType.bold, {color: colors.error, marginTop: 4}]}>
                {aligning === '__none__' ? 'Removing…' : 'Remove alignment'}
              </Text>
            </Pressable>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{marginTop: spacing.xl}} />
        ) : partners.length === 0 ? (
          <Text style={[bodyType.regular, {color: colors.textTertiary, padding: spacing.lg}]}>
            No partners are currently active.
          </Text>
        ) : (
          partners.map(partner => {
            const logo = resolvePartnerLogo(partner.brand_config);
            const isAligned = partner.id === currentPartnerId;
            const isAligning = aligning === partner.id;
            const partnerPrimary =
              (partner.brand_config?.primary_color as string | undefined) ?? colors.primary;
            return (
              <Pressable
                key={partner.id}
                onPress={() => handleAlign(partner)}
                disabled={isAligning || isAligned}
                style={({pressed}) => [
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isAligned ? partnerPrimary : colors.border,
                    borderWidth: isAligned ? 2 : 1,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}>
                <View style={[styles.cardStripe, {backgroundColor: partnerPrimary}]} />
                {logo ? (
                  <Image source={{uri: logo}} style={styles.cardLogo} resizeMode="contain" />
                ) : (
                  <View style={[styles.cardLogo, {backgroundColor: partnerPrimary, alignItems: 'center', justifyContent: 'center'}]}>
                    <Text style={{color: colors.onPrimary, fontWeight: '700'}}>
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
                    {partner.partner_type ? partner.partner_type.toUpperCase() : 'PARTNER'}
                    {partner.can_run_pools ? ' · runs pools' : ' · sponsor only'}
                  </Text>
                </View>
                {isAligning ? (
                  <ActivityIndicator size="small" color={partnerPrimary} />
                ) : isAligned ? (
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
