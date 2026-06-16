// ClubAdminScreen — dedicated home for a Club Manager (Partner Admin).
//
// Reachable from Settings → "Club Admin" when the user is the active
// organizer of any pool that's flagged as a Club Pool
// (`partners.club_pool_id = pool.id`). For a user managing multiple Clubs
// in the future, the entry-point becomes a picker; for v1, exactly one
// Club per Partner so we resolve the first match.
//
// Identity (logo, name, colors) is read-only — Super Admin owns brand
// setup. The Partner Admin manages the day-to-day program: perk,
// broadcasts, hours, link, roster-page message.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  ChevronLeft,
  Copy,
  RefreshCw,
  Ticket,
  Megaphone,
  Share2,
  Eye,
} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';
import {formatRosterPass} from '@shared/utils/format';
import {LEXICON} from '@shared/lexicon';
import {DelegateManager} from '@shell/components/DelegateManager';
import {PerkIcon, PERK_EMOJI} from '@shell/components/home/PerkIcon';

type PartnerRow = {
  id: string;
  name: string;
  slug: string;
  perk_text: string | null;
  perk_icon: string | null;
  brand_config: Record<string, unknown> | null;
  is_active: boolean;
  roster_pass: string;
  club_pool_id: string | null;
  public_info: {
    hours?: string;
    address?: string;
    perk_redeem_text?: string;
    link?: {url?: string; label?: string};
    roster_page_message?: string;
  } | null;
};

type RosterEntry = {
  pool_id: string;
  pool_name: string | null;
  invite_code: string | null;
  member_count: number;
  organizer_name: string | null;
  created_at: string;
};

function resolveLogo(bc: Record<string, unknown> | null): string | null {
  if (!bc) return null;
  const nested = (bc.logo ?? {}) as Record<string, unknown>;
  if (typeof nested.full === 'string' && nested.full.length > 0) return nested.full;
  if (typeof bc.logo_url === 'string' && bc.logo_url.length > 0) return bc.logo_url;
  return null;
}

export function ClubAdminScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const user = useGlobalStore(s => s.user);

  const [partner, setPartner] = useState<PartnerRow | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Local edit state per section. Save buttons only enabled when dirty.
  const [perkText, setPerkText] = useState('');
  const [perkIcon, setPerkIcon] = useState('');
  const [iconPickerVisible, setIconPickerVisible] = useState(false);
  const [perkSaving, setPerkSaving] = useState(false);

  const [redeemText, setRedeemText] = useState('');
  const [redeemSaving, setRedeemSaving] = useState(false);

  const [addressText, setAddressText] = useState('');
  const [addressSaving, setAddressSaving] = useState(false);

  const [hoursText, setHoursText] = useState('');
  const [hoursSaving, setHoursSaving] = useState(false);

  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);

  const [rosterMsg, setRosterMsg] = useState('');
  const [rosterMsgSaving, setRosterMsgSaving] = useState(false);

  const [broadcastVisible, setBroadcastVisible] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);

  // Resolve the Club this user manages. v1: one Club per Partner
  // Admin. The "do I manage a Club" question is already answered by
  // globalStore.managedClub (loaded with the profile); we read the
  // partner's full row by id here so we get brand_config + roster
  // pass + public_info that the slice doesn't carry.
  const managedClub = useGlobalStore(s => s.managedClub);
  const loadPartner = useCallback(async () => {
    if (!user?.id || !managedClub) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const {data: partnerRows} = await supabase
      .from('partners')
      .select('id, name, slug, perk_text, perk_icon, brand_config, is_active, roster_pass, club_pool_id, public_info')
      .eq('id', managedClub.id)
      .eq('is_active', true)
      .limit(1);

    const row = (partnerRows ?? [])[0] as PartnerRow | undefined;
    if (!row) {
      setLoading(false);
      return;
    }
    setPartner(row);
    setPerkText(row.perk_text ?? '');
    setPerkIcon(row.perk_icon ?? '');
    setRedeemText(row.public_info?.perk_redeem_text ?? '');
    setAddressText(row.public_info?.address ?? '');
    setHoursText(row.public_info?.hours ?? '');
    setLinkUrl(row.public_info?.link?.url ?? '');
    setLinkLabel(row.public_info?.link?.label ?? '');
    setRosterMsg(row.public_info?.roster_page_message ?? '');

    // 3. roster — every pool affiliated with this partner (including
    // the Club Pool itself + every Contest that's affiliated).
    const {data: affRows} = await supabase
      .from('pool_partner_affiliations')
      .select('pool_id, created_at, pools(id, name, invite_code, organizer_id)')
      .eq('partner_id', row.id);

    // PostgREST returns the embedded relation as an array even for
    // to-one FKs in some configurations. Tolerate both shapes.
    type PoolEmbed = {id: string; name: string | null; invite_code: string | null; organizer_id: string | null};
    type AffRow = {
      pool_id: string;
      created_at: string;
      pools: PoolEmbed | PoolEmbed[] | null;
    };
    // Collect pool data + organizer IDs first, then batch the two
    // lookups into single round-trips (was 2N queries serially).
    const affList: Array<{pool: PoolEmbed; aff_created_at: string; pool_id: string}> = [];
    for (const aff of (affRows ?? []) as unknown as AffRow[]) {
      const pool = Array.isArray(aff.pools) ? aff.pools[0] : aff.pools;
      if (!pool) continue;
      affList.push({pool, aff_created_at: aff.created_at, pool_id: aff.pool_id});
    }

    const rosterPoolIds = affList.map(a => a.pool_id);
    const organizerIds = Array.from(
      new Set(affList.map(a => a.pool.organizer_id).filter((id): id is string => !!id)),
    );

    const [countsRes, profilesRes] = await Promise.all([
      rosterPoolIds.length > 0
        ? supabase.rpc('get_pool_member_counts', {p_pool_ids: rosterPoolIds})
        : Promise.resolve({data: []}),
      organizerIds.length > 0
        ? supabase.from('profiles').select('id, poolie_name, first_name').in('id', organizerIds)
        : Promise.resolve({data: []}),
    ]);

    const countMap = new Map<string, number>();
    for (const r of (countsRes.data ?? []) as {pool_id: string; member_count: number}[]) {
      countMap.set(r.pool_id, Number(r.member_count));
    }
    const orgNameMap = new Map<string, string>();
    for (const p of (profilesRes.data ?? []) as {id: string; poolie_name: string | null; first_name: string | null}[]) {
      orgNameMap.set(p.id, p.poolie_name ?? p.first_name ?? '');
    }

    const entries: RosterEntry[] = affList.map(a => ({
      pool_id:        a.pool_id,
      pool_name:      a.pool.name,
      invite_code:    a.pool.invite_code,
      member_count:   countMap.get(a.pool_id) ?? 0,
      organizer_name: a.pool.organizer_id ? orgNameMap.get(a.pool.organizer_id) ?? null : null,
      created_at:     a.aff_created_at,
    }));
    setRoster(entries);
    setLoading(false);
  }, [user?.id, managedClub]);

  useEffect(() => {
    loadPartner();
  }, [loadPartner]);

  // ── Saves ─────────────────────────────────────────────────────────

  const handleSavePerk = async () => {
    if (!partner) return;
    setPerkSaving(true);
    const {data, error} = await supabase.rpc('update_partner_perk', {
      p_partner_id: partner.id,
      p_perk_text:  perkText.trim() || null,
      p_perk_icon:  perkIcon.trim() || null,
    });
    setPerkSaving(false);
    if (error) {
      Alert.alert('Could not save perk', error.message);
      return;
    }
    if ((data as {error?: string})?.error) {
      Alert.alert('Could not save perk', (data as {error: string}).error);
      return;
    }
    setPartner({...partner, perk_text: perkText.trim() || null, perk_icon: perkIcon.trim() || null});
    Alert.alert('Saved', `${partner.name}'s perk updated.`);
  };

  const handleSavePublicInfo = async (
    patch: Record<string, unknown>,
    setSaving: (v: boolean) => void,
    label: string,
  ) => {
    if (!partner) return;
    setSaving(true);
    const {data, error} = await supabase.rpc('update_partner_public_info', {
      p_partner_id: partner.id,
      p_patch: patch,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    const result = data as {ok?: boolean; public_info?: PartnerRow['public_info']; error?: string};
    if (result.error) {
      Alert.alert('Could not save', result.error);
      return;
    }
    setPartner({...partner, public_info: result.public_info ?? partner.public_info});
    Alert.alert('Saved', `${label} updated.`);
  };

  const handleSendBroadcast = async () => {
    if (!partner) return;
    const message = broadcastMsg.trim();
    if (message.length === 0) return;
    setBroadcastSending(true);
    const {data, error} = await supabase.functions.invoke('send-partner-broadcast', {
      body: {partner_id: partner.id, message},
    });
    setBroadcastSending(false);
    if (error) {
      Alert.alert('Could not send', error.message);
      return;
    }
    const result = data as {broadcast_id?: string; recipient_count?: number; error?: string};
    if (result?.error) {
      Alert.alert('Could not send', result.error);
      return;
    }
    setBroadcastMsg('');
    setBroadcastVisible(false);
    Alert.alert(
      'Sent',
      `Broadcast reached ${result.recipient_count ?? 0} ${
        (result.recipient_count ?? 0) === 1 ? 'Player' : 'Players'
      } on ${partner.name}'s roster.`,
    );
  };

  const handleRegenerateRosterPass = () => {
    if (!partner) return;
    Alert.alert(
      'Regenerate Roster Pass?',
      "Use this if your current pass has been shared publicly or with someone who shouldn't have it. " +
      "The old pass stops working immediately. Contests already on your roster are unaffected — " +
      "they stay affiliated. You'll need to share the new pass with any future Gaffers.",
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            const {data, error} = await supabase.rpc('regenerate_roster_pass', {
              p_partner_id: partner.id,
            });
            if (error) {
              Alert.alert('Failed', error.message);
              return;
            }
            const result = data as {ok?: boolean; roster_pass?: string; error?: string};
            if (result.error) {
              Alert.alert('Failed', result.error);
              return;
            }
            if (result.roster_pass) {
              setPartner({...partner, roster_pass: result.roster_pass});
              Alert.alert('New Roster Pass', formatRosterPass(result.roster_pass));
            }
          },
        },
      ],
    );
  };

  // ── Derived ───────────────────────────────────────────────────────

  const logo       = useMemo(() => (partner ? resolveLogo(partner.brand_config) : null), [partner]);
  const totalPlayers = useMemo(() => roster.reduce((s, r) => s + r.member_count, 0), [roster]);

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.shell, {backgroundColor: colors.background}]}>
        <ActivityIndicator color={colors.primary} style={{marginTop: spacing.xl}} />
      </SafeAreaView>
    );
  }

  if (!partner) {
    return (
      <SafeAreaView style={[styles.shell, {backgroundColor: colors.background}]} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <ChevronLeft color={colors.textPrimary} size={24} />
          </Pressable>
          <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
            CLUB ADMIN
          </Text>
          <View style={{width: 24}} />
        </View>
        <Text style={[bodyType.regular, {color: colors.textTertiary, padding: spacing.lg}]}>
          You're not currently managing a {LEXICON.league.short}.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.shell, {backgroundColor: colors.background}]} edges={['top']}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <ChevronLeft color={colors.textPrimary} size={24} />
          </Pressable>
          <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
            CLUB ADMIN
          </Text>
          <View style={{width: 24}} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Identity header */}
          <View style={[styles.identityCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            {logo ? (
              <Image source={{uri: logo}} style={styles.identityLogo} resizeMode="contain" />
            ) : (
              <View style={[styles.identityLogo, {backgroundColor: colors.surfaceElevated}]} />
            )}
            <View style={{flex: 1, minWidth: 0}}>
              <Text style={[displayType.display, styles.identityName, {color: colors.textPrimary}]} numberOfLines={1}>
                {partner.name.toUpperCase()}
              </Text>
              <Text style={[bodyType.regular, {color: colors.textTertiary, fontSize: 12}]} numberOfLines={1}>
                {partner.slug}
              </Text>
            </View>
          </View>

          {/* Roster Pass */}
          <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textSecondary}]}>
            ROSTER PASS
          </Text>
          <View style={[styles.cardBlock, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <View style={styles.passRow}>
              <Ticket size={18} color={colors.primary} strokeWidth={2.25} />
              <Text style={[displayType.display, styles.passText, {color: colors.textPrimary}]}>
                {formatRosterPass(partner.roster_pass)}
              </Text>
            </View>
            <Text style={[bodyType.regular, styles.passHint, {color: colors.textSecondary}]}>
              Share with a Gaffer to add their Contest to {partner.name}'s roster.
              They paste it in their Contest's Settings → Add/Edit Leagues.
            </Text>
            <View style={styles.passActions}>
              <Pressable
                onPress={() => {
                  Clipboard.setString(formatRosterPass(partner.roster_pass));
                  Alert.alert('Copied', 'Roster Pass copied to clipboard.');
                }}
                style={[styles.smallBtn, {borderColor: colors.primary}]}>
                <Copy size={14} color={colors.primary} />
                <Text style={[bodyType.bold, styles.smallBtnText, {color: colors.primary}]}>Copy</Text>
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
                style={[styles.smallBtn, {borderColor: colors.primary}]}>
                <Share2 size={14} color={colors.primary} />
                <Text style={[bodyType.bold, styles.smallBtnText, {color: colors.primary}]}>Share</Text>
              </Pressable>
              <Pressable
                onPress={handleRegenerateRosterPass}
                style={[styles.smallBtn, {borderColor: colors.error}]}>
                <RefreshCw size={14} color={colors.error} />
                <Text style={[bodyType.bold, styles.smallBtnText, {color: colors.error}]}>Regenerate</Text>
              </Pressable>
            </View>
          </View>

          {/* Perk editor */}
          <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textSecondary}]}>
            PERK
          </Text>
          <View style={[styles.cardBlock, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.regular, styles.helper, {color: colors.textSecondary}]}>
              Shows on every Contest in your roster. Keep it specific and time-bound.
            </Text>
            <View style={styles.perkRow}>
              <Pressable
                onPress={() => setIconPickerVisible(true)}
                style={[styles.perkIconInput, styles.perkIconSwatch, {borderColor: colors.border, backgroundColor: colors.background}]}
                accessibilityRole="button"
                accessibilityLabel="Choose a perk icon">
                <PerkIcon name={perkIcon} size={24} color={colors.textPrimary} />
              </Pressable>
              <TextInput
                style={[styles.perkInput, {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background}]}
                value={perkText}
                onChangeText={t => t.length <= 120 && setPerkText(t)}
                placeholder="$1 off draught beer weekdays."
                placeholderTextColor={colors.textTertiary}
                multiline
                maxLength={120}
              />
            </View>
            <Text style={[bodyType.regular, styles.charCount, {color: colors.textTertiary}]}>
              {perkText.length} / 120
            </Text>
            <Pressable
              onPress={handleSavePerk}
              disabled={perkSaving}
              style={[styles.saveBtn, {backgroundColor: colors.primary}, perkSaving && {opacity: 0.6}]}>
              {perkSaving ? <ActivityIndicator size="small" color={colors.onPrimary} /> :
                <Text style={[bodyType.bold, {color: colors.onPrimary}]}>Save Perk</Text>}
            </Pressable>
          </View>

          {/* Perk redeem line — the instruction shown under the perk on the
              roster page. Optional; blank falls back to the platform default. */}
          <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textSecondary}]}>
            HOW TO REDEEM
          </Text>
          <View style={[styles.cardBlock, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.regular, styles.helper, {color: colors.textSecondary}]}>
              The line under your perk that tells Players how to claim it. Leave blank to use the default.
            </Text>
            <TextInput
              style={[styles.bigTextInput, {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background}]}
              value={redeemText}
              onChangeText={t => t.length <= 160 && setRedeemText(t)}
              placeholder={`Show this screen to a ${partner.name} staff member to redeem.`}
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={160}
            />
            <Text style={[bodyType.regular, styles.charCount, {color: colors.textTertiary}]}>
              {redeemText.length} / 160
            </Text>
            <Pressable
              onPress={() => handleSavePublicInfo({perk_redeem_text: redeemText.trim() || null}, setRedeemSaving, 'Redeem instructions')}
              disabled={redeemSaving || (partner.public_info?.perk_redeem_text ?? '') === redeemText}
              style={[
                styles.saveBtn,
                {backgroundColor: colors.primary},
                (redeemSaving || (partner.public_info?.perk_redeem_text ?? '') === redeemText) && {opacity: 0.5},
              ]}>
              {redeemSaving ? <ActivityIndicator size="small" color={colors.onPrimary} /> :
                <Text style={[bodyType.bold, {color: colors.onPrimary}]}>Save Redeem Line</Text>}
            </Pressable>
          </View>

          {/* Broadcast */}
          <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textSecondary}]}>
            BROADCAST TO ROSTER
          </Text>
          <View style={[styles.cardBlock, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.regular, styles.helper, {color: colors.textSecondary}]}>
              Reaches every Player on every Contest in {partner.name}'s roster
              — currently {totalPlayers} {totalPlayers === 1 ? 'Player' : 'Players'} across {roster.length} {roster.length === 1 ? 'Contest' : 'Contests'}.
            </Text>
            <Pressable
              onPress={() => setBroadcastVisible(true)}
              style={[styles.saveBtn, {backgroundColor: colors.primary, flexDirection: 'row', gap: 8}]}>
              <Megaphone size={16} color={colors.onPrimary} />
              <Text style={[bodyType.bold, {color: colors.onPrimary}]}>Compose Broadcast</Text>
            </Pressable>
          </View>

          {/* Roster */}
          <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textSecondary}]}>
            ROSTER
          </Text>
          <View style={[styles.cardBlock, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.regular, styles.helper, {color: colors.textSecondary}]}>
              {roster.length} {roster.length === 1 ? 'Contest' : 'Contests'} · {totalPlayers} {totalPlayers === 1 ? 'Player' : 'Players'} total
            </Text>
            {roster.length === 0 ? (
              <Text style={[bodyType.regular, {color: colors.textTertiary, fontStyle: 'italic'}]}>
                No Contests on the roster yet. Share your Roster Pass with a Gaffer to add the first one.
              </Text>
            ) : (
              roster.map(r => (
                <View key={r.pool_id} style={[styles.rosterRow, {borderColor: colors.border}]}>
                  <View style={{flex: 1}}>
                    <Text style={[bodyType.bold, {color: colors.textPrimary}]} numberOfLines={1}>
                      {r.pool_name ?? '—'}
                    </Text>
                    <Text style={[bodyType.regular, {color: colors.textSecondary, fontSize: 12}]} numberOfLines={1}>
                      {r.organizer_name ? `Gaffer: ${r.organizer_name} · ` : ''}
                      {r.member_count} {r.member_count === 1 ? 'Player' : 'Players'}
                    </Text>
                  </View>
                </View>
              ))
            )}
            <Pressable
              onPress={() => navigation.navigate('PartnerRoster', {slug: partner.slug, preview: true})}
              style={[styles.saveBtn, {backgroundColor: colors.primary, flexDirection: 'row', gap: 8}]}>
              <Eye size={16} color={colors.onPrimary} />
              <Text style={[bodyType.bold, {color: colors.onPrimary}]}>See Roster Page</Text>
            </Pressable>
          </View>

          {/* Address */}
          <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textSecondary}]}>
            ADDRESS
          </Text>
          <View style={[styles.cardBlock, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.regular, styles.helper, {color: colors.textSecondary}]}>
              Where can Players find you? Free-text — shows on your League page.
            </Text>
            <TextInput
              style={[styles.bigTextInput, {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background}]}
              value={addressText}
              onChangeText={t => t.length <= 200 && setAddressText(t)}
              placeholder="123 Main St, Buffalo, NY 14201"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={200}
            />
            <Pressable
              onPress={() => handleSavePublicInfo({address: addressText.trim() || null}, setAddressSaving, 'Address')}
              disabled={addressSaving || (partner.public_info?.address ?? '') === addressText}
              style={[
                styles.saveBtn,
                {backgroundColor: colors.primary},
                (addressSaving || (partner.public_info?.address ?? '') === addressText) && {opacity: 0.5},
              ]}>
              {addressSaving ? <ActivityIndicator size="small" color={colors.onPrimary} /> :
                <Text style={[bodyType.bold, {color: colors.onPrimary}]}>Save Address</Text>}
            </Pressable>
          </View>

          {/* Hours */}
          <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textSecondary}]}>
            HOURS
          </Text>
          <View style={[styles.cardBlock, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.regular, styles.helper, {color: colors.textSecondary}]}>
              When are you open? Free-text — shows on your League page.
            </Text>
            <TextInput
              style={[styles.bigTextInput, {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background}]}
              value={hoursText}
              onChangeText={t => t.length <= 200 && setHoursText(t)}
              placeholder="Mon-Fri 4pm-2am · Sat 11am-2am · Sun closed"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={200}
            />
            <Pressable
              onPress={() => handleSavePublicInfo({hours: hoursText.trim() || null}, setHoursSaving, 'Hours')}
              disabled={hoursSaving || (partner.public_info?.hours ?? '') === hoursText}
              style={[
                styles.saveBtn,
                {backgroundColor: colors.primary},
                (hoursSaving || (partner.public_info?.hours ?? '') === hoursText) && {opacity: 0.5},
              ]}>
              {hoursSaving ? <ActivityIndicator size="small" color={colors.onPrimary} /> :
                <Text style={[bodyType.bold, {color: colors.onPrimary}]}>Save Hours</Text>}
            </Pressable>
          </View>

          {/* Link */}
          <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textSecondary}]}>
            LINK
          </Text>
          <View style={[styles.cardBlock, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.regular, styles.helper, {color: colors.textSecondary}]}>
              One link to send Players to your Instagram, website, Linktree — whatever you point your customers at.
            </Text>
            <Text style={[bodyType.regular, styles.fieldLabel, {color: colors.textSecondary}]}>URL</Text>
            <TextInput
              style={[styles.smallTextInput, {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background}]}
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://www.instagram.com/yourclub"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={[bodyType.regular, styles.fieldLabel, {color: colors.textSecondary}]}>Label</Text>
            <TextInput
              style={[styles.smallTextInput, {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background}]}
              value={linkLabel}
              onChangeText={t => t.length <= 30 && setLinkLabel(t)}
              placeholder="Instagram"
              placeholderTextColor={colors.textTertiary}
              maxLength={30}
            />
            {linkUrl.length > 0 && (
              <Pressable onPress={() => Linking.openURL(linkUrl).catch(() => {})}>
                <Text style={[bodyType.regular, {color: colors.primary, fontSize: 12, marginTop: 4}]}>
                  Preview: {linkLabel || linkUrl}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                const linkValue =
                  linkUrl.trim().length === 0
                    ? null
                    : {url: linkUrl.trim(), label: linkLabel.trim() || null};
                handleSavePublicInfo({link: linkValue}, setLinkSaving, 'Link');
              }}
              disabled={linkSaving}
              style={[styles.saveBtn, {backgroundColor: colors.primary}, linkSaving && {opacity: 0.6}]}>
              {linkSaving ? <ActivityIndicator size="small" color={colors.onPrimary} /> :
                <Text style={[bodyType.bold, {color: colors.onPrimary}]}>Save Link</Text>}
            </Pressable>
          </View>

          {/* Roster page message */}
          <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textSecondary}]}>
            ROSTER PAGE MESSAGE
          </Text>
          <View style={[styles.cardBlock, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[bodyType.regular, styles.helper, {color: colors.textSecondary}]}>
              Shows on your League's roster page — what Gaffers see when they're considering affiliating.
            </Text>
            <TextInput
              style={[styles.bigTextInput, {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background}]}
              value={rosterMsg}
              onChangeText={t => t.length <= 280 && setRosterMsg(t)}
              placeholder="Welcome! Add your Contest to our roster and your Players will see our perk."
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={280}
            />
            <Text style={[bodyType.regular, styles.charCount, {color: colors.textTertiary}]}>
              {rosterMsg.length} / 280
            </Text>
            <Pressable
              onPress={() => handleSavePublicInfo({roster_page_message: rosterMsg.trim() || null}, setRosterMsgSaving, 'Roster page message')}
              disabled={rosterMsgSaving || (partner.public_info?.roster_page_message ?? '') === rosterMsg}
              style={[
                styles.saveBtn,
                {backgroundColor: colors.primary},
                (rosterMsgSaving || (partner.public_info?.roster_page_message ?? '') === rosterMsg) && {opacity: 0.5},
              ]}>
              {rosterMsgSaving ? <ActivityIndicator size="small" color={colors.onPrimary} /> :
                <Text style={[bodyType.bold, {color: colors.onPrimary}]}>Save Message</Text>}
            </Pressable>
          </View>

          {/* Directors — the Chairman (Club Pool organizer) adds people who
              help run the League. They get the same League Tools minus this
              control. Directors (admins) see the list read-only. */}
          {managedClub && (
            <View style={[styles.cardBlock, {backgroundColor: colors.surface, borderColor: colors.border, marginTop: spacing.lg}]}>
              <Text style={[bodyType.bold, {color: colors.textPrimary, marginBottom: 4}]}>
                Add {LEXICON.director.plural}
              </Text>
              <Text style={[bodyType.regular, {color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: spacing.sm}]}>
                {LEXICON.director.plural} get the same privileges you do, but can't add new {LEXICON.director.plural}.
              </Text>
              <DelegateManager
                target={{kind: 'partner', partnerId: managedClub.id}}
                roleNoun={LEXICON.director.short}
                delegateRole="director"
                canManage={managedClub.role === 'chairman'}
                showHeader={false}
              />
            </View>
          )}

          {/* Identity (read-only) + Analytics placeholder */}
          <View style={[styles.cardBlock, {backgroundColor: colors.surface, borderColor: colors.border, marginTop: spacing.lg}]}>
            <Text style={[bodyType.bold, {color: colors.textPrimary, marginBottom: 4}]}>Identity</Text>
            <Text style={[bodyType.regular, {color: colors.textSecondary, fontSize: 12, lineHeight: 17}]}>
              Logo, colors, and name are managed by HotPick. Email{' '}
              <Text style={{fontWeight: '700'}}>support@hotpicksports.com</Text> to request changes.
            </Text>
          </View>
          <View style={[styles.cardBlock, {backgroundColor: colors.surface, borderColor: colors.border, marginTop: spacing.md}]}>
            <Text style={[bodyType.bold, {color: colors.textPrimary, marginBottom: 4}]}>Analytics</Text>
            <Text style={[bodyType.regular, {color: colors.textSecondary, fontSize: 12, lineHeight: 17}]}>
              Coming soon — perk redemption tracking, broadcast open rates, Player activity.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Partner broadcast composer. Inline modal (rather than the
          per-pool BroadcastComposer) because partner broadcasts use
          the send-partner-broadcast Edge Function with different rate
          limits + delivery target. */}
      <Modal
        visible={broadcastVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !broadcastSending && setBroadcastVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable
            style={styles.modalBackdropPress}
            onPress={() => !broadcastSending && setBroadcastVisible(false)}
          />
          <View style={[styles.modalCard, {backgroundColor: colors.surface}]}>
            <Text style={[bodyType.bold, {fontSize: 16, color: colors.textPrimary}]}>
              Broadcast to {partner.name}'s roster
            </Text>
            <Text style={[bodyType.regular, {fontSize: 12, color: colors.textSecondary, marginTop: 4}]}>
              Reaches {totalPlayers} {totalPlayers === 1 ? 'Player' : 'Players'} across {roster.length} {roster.length === 1 ? 'Contest' : 'Contests'}.
            </Text>
            <TextInput
              style={[
                styles.bigTextInput,
                {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background, marginTop: spacing.md},
              ]}
              value={broadcastMsg}
              onChangeText={t => t.length <= 280 && setBroadcastMsg(t)}
              placeholder="Drop in for kickoff — first wing's on us for HotPick Players."
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={280}
              autoFocus
            />
            <Text style={[bodyType.regular, styles.charCount, {color: colors.textTertiary}]}>
              {broadcastMsg.length} / 280
            </Text>
            <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm}}>
              <Pressable
                onPress={() => !broadcastSending && setBroadcastVisible(false)}
                style={{paddingVertical: spacing.sm, paddingHorizontal: spacing.lg}}>
                <Text style={[bodyType.bold, {color: colors.textSecondary}]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSendBroadcast}
                disabled={broadcastSending || broadcastMsg.trim().length === 0}
                style={[
                  styles.saveBtn,
                  {backgroundColor: colors.primary, paddingHorizontal: spacing.lg, marginTop: 0},
                  (broadcastSending || broadcastMsg.trim().length === 0) && {opacity: 0.5},
                ]}>
                {broadcastSending ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={[bodyType.bold, {color: colors.onPrimary}]}>Send</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Perk icon picker — curated lucide glyphs (PerkIcon's set). Replaces
          free-text icon entry so a Chairman picks from valid options. */}
      <Modal
        visible={iconPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIconPickerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalBackdropPress}
            onPress={() => setIconPickerVisible(false)}
          />
          <View style={[styles.modalCard, {backgroundColor: colors.surface}]}>
            <Text style={[bodyType.bold, {fontSize: 16, color: colors.textPrimary}]}>
              Choose a perk icon
            </Text>
            <View style={styles.iconGrid}>
              {PERK_EMOJI.map(emoji => {
                const selected = perkIcon.trim() === emoji;
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => {
                      setPerkIcon(emoji);
                      setIconPickerVisible(false);
                    }}
                    style={[
                      styles.iconOption,
                      {borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.background},
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Perk icon ${emoji}`}>
                    <PerkIcon name={emoji} size={24} color={colors.textPrimary} />
                  </Pressable>
                );
              })}
            </View>
            <View style={{flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm}}>
              <Pressable
                onPress={() => setIconPickerVisible(false)}
                style={{paddingVertical: spacing.sm, paddingHorizontal: spacing.lg}}>
                <Text style={[bodyType.bold, {color: colors.textSecondary}]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  title: {fontSize: 16, letterSpacing: 0.5},
  // Section spacing comes from sectionTitle margins (Settings-page model),
  // not a scroll-level gap — a gap here would double the space between
  // every section. Standalone cards without a preceding title set their
  // own marginTop.
  scroll: {padding: spacing.lg, paddingBottom: spacing.xxl},

  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  identityLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  identityName: {fontSize: 18, lineHeight: 22},

  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1.8,
    marginTop: spacing.md,
    marginBottom: 6,
  },

  cardBlock: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },

  helper: {fontSize: 12, lineHeight: 17},

  passRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  passText: {fontSize: 22, letterSpacing: 2},
  passHint: {fontSize: 12, lineHeight: 17, marginTop: 4},
  passActions: {flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap'},

  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  smallBtnText: {fontSize: 12},

  perkRow: {flexDirection: 'row', gap: 8, alignItems: 'flex-start'},
  perkIconInput: {
    width: 50,
    height: 50,
    textAlign: 'center',
    fontSize: 20,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  perkIconSwatch: {alignItems: 'center', justifyContent: 'center'},
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkInput: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 19,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  charCount: {fontSize: 11, textAlign: 'right'},

  saveBtn: {
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  bigTextInput: {
    minHeight: 80,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 19,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  smallTextInput: {
    height: 44,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  fieldLabel: {fontSize: 12, marginTop: 4},

  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    borderTopWidth: 1,
  },

  // Partner broadcast modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalBackdropPress: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
});
