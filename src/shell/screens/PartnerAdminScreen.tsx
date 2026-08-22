import React, {useState, useEffect, useCallback} from 'react';
import {Text, TextInput} from '@shared/components/AppText';
import {
  View,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Share,
  Image,
  Modal,
  Pressable,
  Switch,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {
  ChevronLeft,
  Plus,
  RefreshCw,
  Users,
  X,
  Share2,
  Pencil,
  Upload,
  Link as LinkIcon,
  Copy,
  Ticket,
} from 'lucide-react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import QRCode from 'react-native-qrcode-svg';
import {formatRosterPass} from '@shared/utils/format';
import {launchImageLibrary} from 'react-native-image-picker';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {HOTPICK_DEFAULTS, deriveFullBrandColors} from '@shell/theme/defaults';
import type {BrandConfig} from '@shell/theme/types';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';
import {
  PartnerType,
  Partner,
  PARTNER_TYPES,
  PARTNER_TYPE_LABELS,
  DEFAULT_CAN_RUN_POOLS_BY_TYPE,
  COLOR_FIELDS,
} from './partnerAdmin/types';
import {
  PickedImage,
  LibraryItem,
  fileNameSlug,
  uploadRemoteUrlToLibrary,
  listLibraryItems,
  deleteLibraryItem,
  validateLogoAsset,
  validateBannerAsset,
  slugify,
  uploadPartnerImage,
} from './partnerAdmin/assetUtils';
import {createStyles} from './partnerAdmin/styles';
import {DelegateManager} from '@shell/components/DelegateManager';

export function PartnerAdminScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation<any>();
  const user = useGlobalStore(s => s.user);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedPartnerId, setExpandedPartnerId] = useState<string | null>(
    null,
  );
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [editColors, setEditColors] = useState<Record<string, string>>({});
  const [editName, setEditName] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  // Participation perk — partner-managed copy, never authored by HotPick.
  const [editPerkText, setEditPerkText] = useState('');
  const [editPerkIcon, setEditPerkIcon] = useState('');
  const [editCanRunPools, setEditCanRunPools] = useState(false);
  const [editPartnerType, setEditPartnerType] = useState<PartnerType>('other');
  const [saving, setSaving] = useState(false);
  const [creatingPoolForPartnerId, setCreatingPoolForPartnerId] = useState<string | null>(null);
  // Director seeding (partner board) — staff-only on-ramp. The first Director
  // is seeded here by email; from then on the board adds its own.
  const [formDirectorEmail, setFormDirectorEmail] = useState(''); // create form
  const grantPartnerDirector = useGlobalStore(s => s.grantPartnerDirector);
  // Address — partners.public_info->'address'. Same field and same save path
  // League Tools uses; blank clears it. No new column.
  const [editAddress, setEditAddress] = useState('');
  const [addressSaving, setAddressSaving] = useState(false);
  // Which competition a new Club Contest lands in. Read from the registry via
  // activeSport (never hardcoded), but CONFIRMED by the admin before creating
  // — a super admin on the beta list can be sitting on nfl_2025_sim, which is
  // exactly the sandbox the server-side DEFAULT used to trap partners in.
  const activeSport = useGlobalStore(s => s.activeSport);
  const targetCompetition =
    activeSport?.contestsCreateIn ?? activeSport?.competition ?? null;
  // Gaffer assignment — the Club Contest's organizer. Only meaningful once the
  // partner has a Club Contest. A pool-level seat, separate from the board.
  const [gafferEmail, setGafferEmail] = useState('');
  const [assigningGaffer, setAssigningGaffer] = useState(false);
  const setClubPoolGaffer = useGlobalStore(s => s.setClubPoolGaffer);
  // partner_id → existing pool id+name, so we know whether to show
  // "Start Club Contest" or the existing-Contest card inside an edit card.
  const [partnerPoolByPartnerId, setPartnerPoolByPartnerId] = useState<
    Record<string, {id: string; name: string; invite_code: string | null}>
  >({});

  // Create form state
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formSlugError, setFormSlugError] = useState('');
  const [formColors, setFormColors] = useState({
    primary_color: HOTPICK_DEFAULTS.primary_color,
    secondary_color: HOTPICK_DEFAULTS.secondary_color,
    background_color: HOTPICK_DEFAULTS.background_color,
    highlight_color: HOTPICK_DEFAULTS.highlight_color,
  });
  // Create form holds a local pick (uploaded after INSERT into the new
  // partner's slug folder). No library grid pre-create — the partner
  // doesn't exist yet, so it has no folder.
  const [formLogoPick, setFormLogoPick] = useState<PickedImage | null>(null);
  const [formBannerPick, setFormBannerPick] = useState<PickedImage | null>(null);
  const [formPartnerType, setFormPartnerType] = useState<PartnerType>('other');
  const [formCanRunPools, setFormCanRunPools] = useState<boolean>(
    DEFAULT_CAN_RUN_POOLS_BY_TYPE.other,
  );
  const [creating, setCreating] = useState(false);

  // Per-partner logo library. Surfaced only in the edit form (where we
  // have a slug). Cached by slug so switching between expanded edit cards
  // doesn't repeatedly refetch.
  const [libraryItemsBySlug, setLibraryItemsBySlug] = useState<Record<string, LibraryItem[]>>({});
  const [libraryLoadingSlug, setLibraryLoadingSlug] = useState<string | null>(null);
  const [libraryUploading, setLibraryUploading] = useState(false);

  const [urlPromptFor, setUrlPromptFor] = useState<{
    prefix: string;
    onSelect: (url: string) => void;
  } | null>(null);
  const [urlPromptValue, setUrlPromptValue] = useState('');

  const refreshLibraryForSlug = useCallback(async (slug: string) => {
    if (!slug) return;
    setLibraryLoadingSlug(slug);
    const items = await listLibraryItems(slug);
    setLibraryItemsBySlug(prev => ({...prev, [slug]: items}));
    setLibraryLoadingSlug(null);
  }, []);

  const resetCreateForm = useCallback(() => {
    setFormName('');
    setFormSlug('');
    setFormSlugError('');
    setFormColors({
      primary_color: HOTPICK_DEFAULTS.primary_color,
      secondary_color: HOTPICK_DEFAULTS.secondary_color,
      background_color: HOTPICK_DEFAULTS.background_color,
      highlight_color: HOTPICK_DEFAULTS.highlight_color,
    });
    setFormLogoPick(null);
    setFormBannerPick(null);
    setFormPartnerType('other');
    setFormCanRunPools(DEFAULT_CAN_RUN_POOLS_BY_TYPE.other);
    setFormDirectorEmail('');
  }, []);

  const fetchPartners = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const {data} = await supabase
      .from('partners')
      .select('*')
      .order('created_at', {ascending: false});
    const partnerRows = (data as Partner[]) ?? [];
    setPartners(partnerRows);

    // Club Contest per partner — drives the create-vs-view CTA in each card.
    // Keyed off the authoritative partners.club_pool_id, NOT pools.partner_id
    // (that's the roster-affiliation edge, which many roster members share —
    // using it falsely reports a Club Contest for any
    // partner that merely has affiliated Contests).
    const clubPoolIds = partnerRows
      .map(p => p.club_pool_id)
      .filter((id): id is string => Boolean(id));
    const byPartner: Record<string, {id: string; name: string; invite_code: string | null}> = {};
    if (clubPoolIds.length > 0) {
      const {data: clubPools} = await supabase
        .from('pools')
        .select('id, name, invite_code')
        .in('id', clubPoolIds);
      const poolById = new Map(
        (clubPools ?? []).map((p: any) => [p.id as string, p]),
      );
      partnerRows.forEach(pt => {
        const cp = pt.club_pool_id ? poolById.get(pt.club_pool_id) : undefined;
        if (cp) {
          byPartner[pt.id] = {id: cp.id, name: cp.name, invite_code: cp.invite_code};
        }
      });
    }
    setPartnerPoolByPartnerId(byPartner);

    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  // Deferred upload — INSERT must return a partner.id before we know
  // the storage path. Edit-flow uploads immediately by contrast.
  const pickAssetForCreate = async (
    kind: 'logo' | 'banner',
    onPick: (picked: PickedImage) => void,
  ) => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.9,
        includeBase64: false,
      });
      if (result.didCancel || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.uri) return;

      const picked: PickedImage = {
        uri: asset.uri,
        fileName: asset.fileName || `${kind}.png`,
        type: asset.type || 'image/png',
        width: asset.width ?? 0,
        height: asset.height ?? 0,
        fileSize: asset.fileSize ?? 0,
      };

      const err =
        kind === 'logo' ? validateLogoAsset(picked) : validateBannerAsset(picked);
      if (err) {
        Alert.alert(`${kind === 'logo' ? 'Logo' : 'Banner'} Rejected`, err);
        return;
      }

      onPick(picked);
    } catch (err: any) {
      Alert.alert('Pick Error', err?.message || String(err));
    }
  };

  const validateSlug = (slug: string): string | null => {
    if (!slug) return null; // optional — will auto-generate from name
    if (slug.length > 12) return 'Max 12 characters';
    if (!/^[a-z0-9-]+$/.test(slug)) return 'Letters, numbers, hyphens only';
    return null;
  };

  const checkSlugUniqueness = async (slug: string) => {
    if (!slug) { setFormSlugError(''); return; }
    const err = validateSlug(slug);
    if (err) { setFormSlugError(err); return; }
    const {data} = await supabase
      .from('pools')
      .select('id')
      .eq('invite_slug', slug)
      .limit(1);
    if (data && data.length > 0) {
      setFormSlugError('This code is already taken');
    } else {
      setFormSlugError('');
    }
  };

  const handleCreate = async () => {
    const name = formName.trim();
    if (!name || !user?.id) return;

    const finalSlug = formSlug.trim().toLowerCase() || slugify(name);
    const slugErr = validateSlug(finalSlug);
    if (slugErr) {
      setFormSlugError(slugErr);
      return;
    }

    setCreating(true);

    const derived = deriveFullBrandColors(
      formColors.primary_color,
      formColors.secondary_color,
      formColors.background_color,
      formColors.highlight_color,
    );

    const brandConfig: BrandConfig = {
      partner_name: name,
      pool_label: name,
      ...derived,
      logo: {
        full: '',
        mark: '',
        wordmark: '',
        mono_light: '',
        mono_dark: '',
      },
      app_name: name,
      invite_slug: finalSlug,
      is_branded: true,
      powered_by_hotpick: true,
    };

    const {data: inserted, error} = await supabase
      .from('partners')
      .insert({
        name,
        slug: finalSlug,
        brand_config: brandConfig as unknown,
        created_by: user.id,
        partner_type: formPartnerType,
        can_run_pools: formCanRunPools,
      })
      .select('id')
      .single();

    if (error || !inserted) {
      Alert.alert('Error', error?.message ?? 'Failed to create partner.');
      setCreating(false);
      return;
    }

    const partnerId = inserted.id as string;

    // Failed uploads leave the partner intact — user can retry from edit.
    const [uploadedLogoUrl, uploadedBannerUrl] = await Promise.all([
      formLogoPick
        ? uploadPartnerImage(
            finalSlug,
            fileNameSlug(formLogoPick.fileName).replace(/\.[^.]+$/, ''),
            formLogoPick.uri,
            formLogoPick.fileName,
          )
        : Promise.resolve(null),
      formBannerPick
        ? uploadPartnerImage(partnerId, 'banner', formBannerPick.uri, formBannerPick.fileName)
        : Promise.resolve(null),
    ]);

    if (formLogoPick && !uploadedLogoUrl) {
      Alert.alert(
        'Logo Upload Failed',
        'The partner was created but the logo did not upload. You can retry from the edit form.',
      );
    }
    if (formBannerPick && !uploadedBannerUrl) {
      Alert.alert(
        'Banner Upload Failed',
        'The partner was created but the banner did not upload. You can retry from the edit form.',
      );
    }

    if (uploadedLogoUrl || uploadedBannerUrl) {
      const updatedConfig: BrandConfig = {
        ...brandConfig,
        logo: {
          ...brandConfig.logo,
          full: uploadedLogoUrl ?? '',
        },
        ...(uploadedBannerUrl
          ? ({banner: {full: uploadedBannerUrl}} as Partial<BrandConfig>)
          : {}),
      };
      const {error: updateErr} = await supabase
        .from('partners')
        .update({brand_config: updatedConfig as unknown})
        .eq('id', partnerId);
      if (updateErr) {
        console.warn('Partner brand_config update failed:', updateErr.message);
      }
    }

    // Seed the first Director if an email was provided at create time. Works
    // for every partner (Contest-hosting or not) — the board is partner-level.
    const director = formDirectorEmail.trim();
    if (director) {
      const res = await grantPartnerDirector(partnerId, director);
      if (!res.success) {
        Alert.alert(
          'Partner Created — Director Not Set',
          `${res.error ?? 'Something went wrong.'} You can add the Director from the partner's edit form.`,
        );
      } else {
        Alert.alert(
          res.pending ? 'Director Invited' : 'Director Added',
          res.pending
            ? `${director} isn't on HotPick yet. They'll become a Director when they create an account with that exact email.`
            : `${director} is now a Director of ${name}.`,
        );
      }
    }

    resetCreateForm();
    setShowForm(false);
    fetchPartners();
    setCreating(false);
  };

  const handleShareQR = async (partner: Partner) => {
    const url = `https://hotpick.app/${partner.slug}`;
    try {
      await Share.share({
        message: `Join ${partner.name} on HotPick: ${url}`,
        url,
      });
    } catch {
      // User cancelled share
    }
  };

  const startEditing = (partner: Partner) => {
    const bc = partner.brand_config as unknown as BrandConfig | null;
    setEditingPartnerId(partner.id);
    setEditName(partner.name);
    setEditColors({
      primary_color: bc?.primary_color ?? HOTPICK_DEFAULTS.primary_color,
      secondary_color: bc?.secondary_color ?? HOTPICK_DEFAULTS.secondary_color,
      background_color: bc?.background_color ?? HOTPICK_DEFAULTS.background_color,
      highlight_color: bc?.highlight_color ?? HOTPICK_DEFAULTS.highlight_color,
    });
    setEditLogoUrl(bc?.logo?.full ?? '');
    setEditPerkText(partner.perk_text ?? '');
    setEditPerkIcon(partner.perk_icon ?? '');
    setEditCanRunPools(partner.can_run_pools ?? false);
    setEditPartnerType((partner.partner_type as PartnerType) ?? 'other');
    setEditAddress(partner.public_info?.address ?? '');
  };

  // Named the competition, every time. The server default used to be
  // 'nfl_2025_sim', which would have put the first real Partner's Contest in
  // the tester sandbox; that default is gone, so the caller must be explicit.
  // Confirming out loud is the point — the value is visible before it is
  // committed rather than inherited from wherever the admin happened to be.
  const handleCreatePartnerPool = (partner: Partner) => {
    if (!targetCompetition) {
      Alert.alert(
        'No Active Competition',
        "Can't tell which competition this Contest belongs to. Open a sport first, then try again.",
      );
      return;
    }
    Alert.alert(
      `Start ${partner.name}'s Club Contest?`,
      `It will be created in ${targetCompetition}.\n\nCheck that competition before continuing — a Contest created in a sandbox competition can't be moved.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Start Contest',
          onPress: () => doCreatePartnerPool(partner, targetCompetition),
        },
      ],
    );
  };

  const doCreatePartnerPool = async (partner: Partner, competition: string) => {
    setCreatingPoolForPartnerId(partner.id);
    const {data, error} = await supabase.rpc('create_partner_pool', {
      p_partner_id: partner.id,
      p_competition: competition,
    });
    setCreatingPoolForPartnerId(null);
    if (error) {
      Alert.alert('Could Not Start Club Contest', error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.pool_id) {
      setPartnerPoolByPartnerId(prev => ({
        ...prev,
        [partner.id]: {
          id: row.pool_id,
          name: row.pool_name ?? partner.name,
          invite_code: row.invite_code ?? null,
        },
      }));
      Alert.alert(
        'Club Contest is live',
        `${partner.name}'s Club Contest is live in ${competition}. Invite code: ${row.invite_code ?? '—'} · Signage slug: ${row.invite_slug ?? partner.slug}`,
      );
    }
  };

  // Address lives at partners.public_info->'address' — the same field, and the
  // same RPC, League Tools writes through (ClubAdminScreen's
  // handleSavePublicInfo). update_partner_public_info shallow-merges
  // server-side and gates on _caller_can_manage_partner, which admits super
  // admins; going direct to the table instead would mean a client-side
  // read-modify-write that can clobber a Director editing hours at the same
  // moment. Blank saves null — no address is a valid state.
  const handleSaveAddress = async (partner: Partner) => {
    setAddressSaving(true);
    const trimmed = editAddress.trim();
    const {data, error} = await supabase.rpc('update_partner_public_info', {
      p_partner_id: partner.id,
      p_patch: {address: trimmed.length > 0 ? trimmed : null},
    });
    setAddressSaving(false);
    const result = data as {ok?: boolean; error?: string} | null;
    if (error || result?.error) {
      Alert.alert('Could Not Save Address', error?.message ?? result?.error ?? 'Something went wrong.');
      return;
    }
    fetchPartners();
  };

  const handleAssignGaffer = async (partner: Partner) => {
    const email = gafferEmail.trim();
    if (!email) return;
    setAssigningGaffer(true);
    const res = await setClubPoolGaffer(partner.id, email);
    setAssigningGaffer(false);
    if (!res.success) {
      Alert.alert(
        'Could Not Assign Gaffer',
        res.error === 'NO_CLUB_POOL'
          ? 'Start the Club Contest first, then assign its Gaffer.'
          : res.error === 'FORBIDDEN'
            ? 'Super-admin only.'
            : res.error ?? 'Something went wrong.',
      );
      return;
    }
    setGafferEmail('');
    Alert.alert(
      res.pending ? 'Gaffer Invited' : 'Gaffer Assigned',
      res.pending
        ? `${email} isn't on HotPick yet. They'll run ${partner.name}'s Contest when they create an account with that exact email.`
        : `${email} now runs ${partner.name}'s Contest as Gaffer.`,
    );
  };

  const handleSaveEdit = async (partner: Partner) => {
    if (!editName.trim()) return;
    setSaving(true);

    try {
      const bc = partner.brand_config as unknown as BrandConfig | null;
      const derived = deriveFullBrandColors(
        editColors.primary_color,
        editColors.secondary_color,
        editColors.background_color,
        editColors.highlight_color,
      );

      const updatedConfig: BrandConfig = {
        ...(bc ?? HOTPICK_DEFAULTS),
        partner_name: editName.trim(),
        pool_label: editName.trim(),
        app_name: editName.trim(),
        invite_slug: slugify(editName.trim()),
        ...derived,
        logo: {
          ...(bc?.logo ?? HOTPICK_DEFAULTS.logo),
          full: editLogoUrl,
        },
        is_branded: true,
        powered_by_hotpick: true,
      };

      const trimmedPerk = editPerkText.trim();
      if (trimmedPerk.length > 120) {
        Alert.alert('Perk too long', 'Perk text must be 120 characters or fewer.');
        setSaving(false);
        return;
      }

      const trimmedName = editName.trim();
      const nameChanged = trimmedName !== partner.name;

      // Only rewrite slug when the name actually changed. Rewriting on every
      // save risks UNIQUE-constraint collisions and silently changes the
      // partner's public URL — both painful for partners.
      const updatePayload: Record<string, unknown> = {
        brand_config: updatedConfig as unknown,
        perk_text: trimmedPerk.length === 0 ? null : trimmedPerk,
        perk_icon: editPerkIcon.trim().length === 0 ? null : editPerkIcon.trim(),
        can_run_pools: editCanRunPools,
        partner_type: editPartnerType,
      };
      if (nameChanged) {
        updatePayload.name = trimmedName;
        updatePayload.slug = slugify(trimmedName);
      }

      // Chain .select().single() so an RLS-filtered or otherwise silent
      // 0-row UPDATE throws PGRST116 instead of returning success with no
      // change applied (CLAUDE.md Red Flag — silent RLS-filtered writes).
      const {error} = await supabase
        .from('partners')
        .update(updatePayload)
        .eq('id', partner.id)
        .select('id')
        .single();

      if (error) {
        const msg = error.code === 'PGRST116'
          ? "Save blocked — your account isn't allowed to update this partner, or the row was changed by someone else."
          : error.message;
        Alert.alert('Could Not Save', msg);
        setSaving(false);
        return;
      }

      // Pool brand_config propagation is owned server-side by the
      // partners_propagate_brand AFTER UPDATE trigger, which cascades this
      // partner's new brand_config to pools (partner_id / owning_club_id) and
      // to pool_partner_affiliations. The partner UPDATE above carries
      // brand_config, so that trigger has fired — no client-side pool write
      // needed (Hard Rule #23; CLAUDE.md red flag against direct client
      // UPDATE of pools.brand_config). T2-1.

      setEditingPartnerId(null);
      fetchPartners();
      Alert.alert('Saved', `${editName.trim()} updated successfully.`);
    } catch (err: any) {
      Alert.alert('Save Error', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  /** Shared color field row renderer */
  const renderColorField = (
    key: string,
    label: string,
    hint: string,
    value: string,
    onChange: (text: string) => void,
  ) => (
    <View key={key} style={styles.colorField}>
      <Text style={styles.colorLabel}>{label}</Text>
      <Text style={styles.colorHint}>{hint}</Text>
      <View style={styles.colorInputRow}>
        <View
          style={[
            styles.colorSwatch,
            {backgroundColor: value},
          ]}
        />
        <TextInput
          style={styles.colorInput}
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={7}
          placeholder="#000000"
          placeholderTextColor={colors.textSecondary}
        />
      </View>
    </View>
  );

  const openUrlPrompt = (prefix: string, onSelect: (url: string) => void) => {
    setUrlPromptValue('');
    setUrlPromptFor({prefix, onSelect});
  };

  const submitUrlPrompt = async () => {
    const url = urlPromptValue.trim();
    const target = urlPromptFor;
    if (!url || !target) return;
    setLibraryUploading(true);
    const uploadedUrl = await uploadRemoteUrlToLibrary(target.prefix, url);
    setLibraryUploading(false);
    if (!uploadedUrl) return;
    setUrlPromptFor(null);
    target.onSelect(uploadedUrl);
    refreshLibraryForSlug(target.prefix);
  };

  const addToLibrary = async (prefix: string, onSelect: (url: string) => void) => {
    await pickAssetForCreate('logo', async picked => {
      setLibraryUploading(true);
      const basename = fileNameSlug(picked.fileName).replace(/\.[^.]+$/, '');
      const url = await uploadPartnerImage(prefix, basename, picked.uri, picked.fileName);
      setLibraryUploading(false);
      if (!url) {
        Alert.alert('Upload Failed', 'Logo did not upload.');
        return;
      }
      onSelect(url);
      refreshLibraryForSlug(prefix);
    });
  };

  const confirmDeleteLibraryItem = (
    prefix: string,
    item: LibraryItem,
    selectedUrl: string | null,
    onSelect: (url: string | null) => void,
  ) => {
    Alert.alert(
      'Delete this logo?',
      `Remove "${item.displayName}" from this partner's logo library. Cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteLibraryItem(prefix, item.name);
            if (!ok) return;
            if (selectedUrl === item.url) onSelect(null);
            refreshLibraryForSlug(prefix);
          },
        },
      ],
    );
  };

  /** Edit-form logo picker — grid scoped to a single partner's slug folder.
   *  Items can be selected, added (Photos or URL), or deleted. */
  const renderLogoLibraryPicker = (
    prefix: string,
    selectedUrl: string | null,
    onSelect: (url: string | null) => void,
  ) => {
    const items = libraryItemsBySlug[prefix];
    const loading = libraryLoadingSlug === prefix;

    if (items === undefined && !loading) {
      // Kick off load on first render for this prefix.
      refreshLibraryForSlug(prefix);
    }

    return (
      <View style={styles.logoSection}>
        <Text style={styles.colorLabel}>Logo</Text>
        <Text style={styles.colorHint}>
          Pick from this partner's logo library, or add a new one. Square 1:1 ·
          512×512px recommended · max 2MB · PNG, JPG, or WebP.
        </Text>

        {selectedUrl && (
          <View style={styles.logoPreviewRow}>
            <Image
              source={{uri: selectedUrl}}
              style={styles.logoPreview}
              resizeMode="contain"
            />
            <View style={styles.assetMetaCol}>
              <Text style={styles.colorHint} numberOfLines={2}>Selected</Text>
              <TouchableOpacity onPress={() => onSelect(null)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Clear selected logo">
                <Text style={styles.resetText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.libraryRow}>
          {loading && !items?.length ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            (items ?? []).map(item => {
              const isSelected = item.url === selectedUrl;
              const renderUri = item.updatedAt
                ? `${item.url}?v=${new Date(item.updatedAt).getTime()}`
                : item.url;
              return (
                <View key={item.name} style={styles.libraryTileWrap}>
                  <TouchableOpacity
                    onPress={() => onSelect(item.url)}
                    style={[
                      styles.libraryTile,
                      {
                        borderColor: isSelected ? colors.primary : colors.border,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${item.displayName}`}>
                    <Image source={{uri: renderUri}} style={styles.libraryThumb} resizeMode="contain" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmDeleteLibraryItem(prefix, item, selectedUrl, onSelect)}
                    style={[styles.libraryDeleteBadge, {backgroundColor: colors.error}]}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${item.displayName}`}>
                    <X size={11} color={colors.onPrimary} strokeWidth={3} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
          <TouchableOpacity
            style={[styles.libraryTile, styles.libraryAddTile, {borderColor: colors.border}]}
            onPress={() => addToLibrary(prefix, url => onSelect(url))}
            disabled={libraryUploading}
            accessibilityRole="button"
            accessibilityLabel="Add logo from photo library"
            accessibilityState={{disabled: libraryUploading}}>
            {libraryUploading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Upload size={18} color={colors.textSecondary} />
                <Text style={styles.libraryAddText}>Photos</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.libraryTile, styles.libraryAddTile, {borderColor: colors.border}]}
            onPress={() => openUrlPrompt(prefix, url => onSelect(url))}
            disabled={libraryUploading}
            accessibilityRole="button"
            accessibilityLabel="Add logo by URL"
            accessibilityState={{disabled: libraryUploading}}>
            <LinkIcon size={18} color={colors.textSecondary} />
            <Text style={styles.libraryAddText}>URL</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  const renderPartnerTypeSelector = (
    value: PartnerType,
    onChange: (next: PartnerType) => void,
  ) => (
    <View style={styles.typeRow}>
      {PARTNER_TYPES.map(type => {
        const selected = type === value;
        return (
          <TouchableOpacity
            key={type}
            onPress={() => onChange(type)}
            style={[
              styles.typePill,
              selected
                ? {backgroundColor: colors.primary, borderColor: colors.primary}
                : {borderColor: colors.border},
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Partner type: ${PARTNER_TYPE_LABELS[type]}`}
            accessibilityState={{selected}}>
            <Text
              style={[
                styles.typePillText,
                {color: selected ? colors.onPrimary : colors.textSecondary},
              ]}>
              {PARTNER_TYPE_LABELS[type]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderCreateAssetPicker = (
    kind: 'logo' | 'banner',
    picked: PickedImage | null,
    onPick: (p: PickedImage | null) => void,
    helpCopy: string,
  ) => (
    <View style={styles.logoSection}>
      <Text style={styles.colorLabel}>{kind === 'logo' ? 'Logo' : 'Banner (optional)'}</Text>
      <Text style={styles.colorHint}>{helpCopy}</Text>
      {picked ? (
        <View style={styles.logoPreviewRow}>
          <Image
            source={{uri: picked.uri}}
            style={kind === 'logo' ? styles.logoPreview : styles.bannerPreview}
            resizeMode="contain"
          />
          <View style={styles.assetMetaCol}>
            <Text style={styles.colorHint}>{picked.width}×{picked.height}</Text>
            <Text style={styles.colorHint}>
              {(picked.fileSize / 1024).toFixed(0)} KB
            </Text>
            <View style={styles.assetActionRow}>
              <TouchableOpacity
                style={styles.logoChangeButton}
                onPress={() => pickAssetForCreate(kind, onPick)}
                accessibilityRole="button"
                accessibilityLabel={`Change ${kind}`}>
                <Text style={styles.logoChangeText}>Change</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onPick(null)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Remove ${kind}`}>
                <Text style={[styles.resetText, {marginLeft: spacing.md}]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.logoUploadButton}
          onPress={() => pickAssetForCreate(kind, onPick)}
          accessibilityRole="button"
          accessibilityLabel={`Pick ${kind === 'logo' ? 'logo' : 'banner'}`}>
          <Upload size={18} color={colors.textSecondary} />
          <Text style={styles.logoUploadText}>
            Pick {kind === 'logo' ? 'Logo' : 'Banner'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <ChevronLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Partner Management</Text>
          <TouchableOpacity
            onPress={() => {
              if (showForm) resetCreateForm();
              setShowForm(!showForm);
            }}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel={showForm ? 'Close new partner form' : 'Add new partner'}>
            {showForm ? (
              <X size={24} color={colors.textPrimary} />
            ) : (
              <Plus size={24} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Create Partner Form */}
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>New Partner</Text>

            <TextInput
              style={styles.nameInput}
              placeholder="Partner name"
              placeholderTextColor={colors.textSecondary}
              value={formName}
              onChangeText={setFormName}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {/* Custom invite code */}
            <View style={styles.slugInputRow}>
              <Text style={styles.slugLabel}>Invite Code for Signage</Text>
              <TextInput
                style={[styles.slugInput, formSlugError ? {borderColor: colors.error} : null]}
                placeholder={formName.trim() ? slugify(formName.trim()).toUpperCase() : 'AUTO'}
                placeholderTextColor={colors.textSecondary}
                value={formSlug}
                onChangeText={text => {
                  const cleaned = text.toLowerCase().replace(/[^a-z0-9-]/g, '');
                  setFormSlug(cleaned);
                  if (formSlugError) setFormSlugError('');
                }}
                onBlur={() => checkSlugUniqueness(formSlug)}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={12}
              />
              <View style={styles.slugMeta}>
                <Text style={styles.slugCharCount}>{formSlug.length}/12</Text>
                {formSlug.trim() ? (
                  <Text style={styles.slugDisplay}>{formSlug.toUpperCase()}</Text>
                ) : formName.trim() ? (
                  <Text style={styles.slugDisplay}>{slugify(formName.trim()).toUpperCase()}</Text>
                ) : null}
              </View>
              {formSlugError ? (
                <Text style={styles.slugError}>{formSlugError}</Text>
              ) : null}
            </View>

            <Text style={styles.colorsHeading}>Partner Type</Text>
            <Text style={styles.colorsDerivedNote}>
              Sets a sensible default for "Can run pools" — you can still flip it.
            </Text>
            {renderPartnerTypeSelector(formPartnerType, next => {
              setFormPartnerType(next);
              setFormCanRunPools(DEFAULT_CAN_RUN_POOLS_BY_TYPE[next]);
            })}

            <View style={styles.classRow}>
              <View style={styles.classCopy}>
                <Text style={styles.classLabel}>
                  {formCanRunPools
                    ? 'Can create & join pools as a partner'
                    : 'Sponsor only — cannot run or join pools'}
                </Text>
                <Text style={styles.colorsDerivedNote}>
                  {formCanRunPools
                    ? 'Partner-staff accounts can be added to pools in the partner role.'
                    : 'Brand still surfaces via perks, broadcasts, and roster.'}
                </Text>
              </View>
              <Switch
                value={formCanRunPools}
                onValueChange={setFormCanRunPools}
                trackColor={{false: colors.border, true: colors.primary}}
                thumbColor={colors.onPrimary}
                ios_backgroundColor={colors.border}
              />
            </View>

            {renderCreateAssetPicker(
              'logo',
              formLogoPick,
              setFormLogoPick,
              'Square 1:1 · 512×512px recommended · max 2MB · PNG, JPG, or WebP. Uploaded to this partner’s library after create.',
            )}
            {renderCreateAssetPicker(
              'banner',
              formBannerPick,
              setFormBannerPick,
              '1.91:1 · 1200×630px recommended · max 3MB · PNG, JPG, or WebP. Wired now, rendered later.',
            )}

            {/* 3 color fields */}
            <Text style={styles.colorsHeading}>Brand Colors</Text>
            <Text style={styles.colorsDerivedNote}>
              Surface and text colors are auto-derived from these.
            </Text>
            <View style={styles.colorGrid}>
              {COLOR_FIELDS.map(({key, label, hint}) =>
                renderColorField(
                  key,
                  label,
                  hint,
                  formColors[key],
                  text => setFormColors(prev => ({...prev, [key]: text})),
                ),
              )}
            </View>

            {/* First Director (optional) — seeded right after creation. Works
                for any partner, Contest-hosting or not. From here the board
                adds its own; staff only ever seed the first one. */}
            <Text style={[styles.colorsHeading, {marginTop: spacing.md}]}>First Director (optional)</Text>
            <Text style={styles.colorsDerivedNote}>
              Email of the person who'll run this partner — perk, broadcasts, and
              adding other Directors. Leave blank to add later.
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: borderRadius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                color: colors.textPrimary,
                marginTop: spacing.sm,
                marginBottom: spacing.md,
              }}
              value={formDirectorEmail}
              onChangeText={setFormDirectorEmail}
              placeholder="director@email.com"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[
                styles.createButton,
                (!formName.trim() || creating) && styles.buttonDisabled,
              ]}
              onPress={handleCreate}
              disabled={!formName.trim() || creating}
              accessibilityRole="button"
              accessibilityLabel="Create partner"
              accessibilityState={{disabled: !formName.trim() || creating}}>
              {creating ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={styles.createButtonText}>Create Partner</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Partners List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Partners</Text>
          <TouchableOpacity
            onPress={fetchPartners}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel="Refresh partners">
            <RefreshCw size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={styles.loader}
          />
        ) : partners.length === 0 ? (
          <Text style={styles.emptyText}>
            No partners yet. Tap + to create one.
          </Text>
        ) : (
          partners.map(partner => {
            const bc = partner.brand_config as unknown as BrandConfig | null;
            const isExpanded = expandedPartnerId === partner.id;
            const isEditing = editingPartnerId === partner.id;
            const logoUrl = bc?.logo?.full;

            return (
              <View key={partner.id} style={styles.partnerCard}>
                <View style={styles.partnerHeader}>
                  <TouchableOpacity
                    style={styles.partnerInfo}
                    onPress={() =>
                      setExpandedPartnerId(isExpanded ? null : partner.id)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${partner.name}`}>
                    {logoUrl ? (
                      <Image
                        source={{uri: logoUrl}}
                        style={styles.partnerListLogo}
                        resizeMode="contain"
                      />
                    ) : bc ? (
                      <View style={styles.swatchRow}>
                        <View
                          style={[
                            styles.miniSwatch,
                            {backgroundColor: bc.primary_color},
                          ]}
                        />
                        <View
                          style={[
                            styles.miniSwatch,
                            {backgroundColor: bc.secondary_color},
                          ]}
                        />
                      </View>
                    ) : null}
                    <View style={styles.partnerNameCol}>
                      <Text style={styles.partnerName}>{partner.name}</Text>
                      {(partner.partner_type || !partner.can_run_pools) && (
                        <View style={styles.partnerBadgeRow}>
                          {partner.partner_type && (
                            <View style={styles.typeBadge}>
                              <Text style={styles.typeBadgeText}>
                                {PARTNER_TYPE_LABELS[partner.partner_type].toUpperCase()}
                              </Text>
                            </View>
                          )}
                          {!partner.can_run_pools && (
                            <View style={styles.classBadge}>
                              <Text style={styles.classBadgeText}>SPONSOR ONLY</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.partnerHeaderActions}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => {
                        if (isEditing) {
                          setEditingPartnerId(null);
                        } else {
                          startEditing(partner);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={isEditing ? `Close edit for ${partner.name}` : `Edit ${partner.name}`}>
                      {isEditing ? (
                        <>
                          <X size={14} color={colors.primary} />
                          <Text style={[styles.editButtonLabel, {color: colors.primary}]}>Close</Text>
                        </>
                      ) : (
                        <>
                          <Pencil size={14} color={colors.primary} />
                          <Text style={[styles.editButtonLabel, {color: colors.primary}]}>Edit</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        setExpandedPartnerId(isExpanded ? null : partner.id)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${isExpanded ? 'Hide' : 'Show'} ${partner.name} signage and QR code`}>
                      <Users
                        size={18}
                        color={
                          isExpanded ? colors.primary : colors.textSecondary
                        }
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Edit form */}
                {isEditing && (
                  <View style={styles.editSection}>
                    <TextInput
                      style={styles.nameInput}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Partner name"
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="words"
                    />

                    <Text style={styles.colorsHeading}>Partner Type</Text>
                    {renderPartnerTypeSelector(editPartnerType, setEditPartnerType)}

                    {renderLogoLibraryPicker(partner.slug, editLogoUrl || null, url =>
                      setEditLogoUrl(url ?? ''),
                    )}

                    <Text style={styles.colorsHeading}>Brand Colors</Text>
                    <Text style={styles.colorsDerivedNote}>
                      Surface and text colors are auto-derived.
                    </Text>
                    <View style={styles.colorGrid}>
                      {COLOR_FIELDS.map(({key, label, hint}) =>
                        renderColorField(
                          key,
                          label,
                          hint,
                          editColors[key] || '',
                          text =>
                            setEditColors(prev => ({...prev, [key]: text})),
                        ),
                      )}
                    </View>

                    <Text style={styles.colorsHeading}>Partner Class</Text>
                    <View style={styles.classRow}>
                      <View style={styles.classCopy}>
                        <Text style={styles.classLabel}>
                          {editCanRunPools
                            ? 'Can create & join pools as a partner'
                            : 'Sponsor only — cannot run or join pools'}
                        </Text>
                        <Text style={styles.colorsDerivedNote}>
                          {editCanRunPools
                            ? 'Operator: runs their own Club Contest with an invite code. Organizers can also add their pool to this partner’s roster.'
                            : 'Sponsor-only: no Club Contest. Brand surfaces via perk + broadcasts. Organizers find them in the directory and add the partner to their pool’s roster.'}
                        </Text>
                      </View>
                      <Switch
                        value={editCanRunPools}
                        onValueChange={setEditCanRunPools}
                        trackColor={{false: colors.border, true: colors.primary}}
                        thumbColor={colors.onPrimary}
                        ios_backgroundColor={colors.border}
                      />
                    </View>

                    {/* Club Contest — only meaningful when can_run_pools. */}
                    {editCanRunPools && (() => {
                      const existing = partnerPoolByPartnerId[partner.id];
                      if (existing) {
                        return (
                          <View style={styles.partnerPoolCard}>
                            <Text style={styles.classLabel}>
                              Club Contest: {existing.name}
                            </Text>
                            <Text style={styles.colorsDerivedNote}>
                              {partner.name}'s own Contest. Members join with invite
                              code{' '}
                              <Text style={{fontWeight: '700'}}>
                                {existing.invite_code ?? '—'}
                              </Text>
                              .
                            </Text>

                            {/* Gaffer — runs this Club Contest. A pool-level
                                seat, separate from the board: the Gaffer need
                                not be a Director, and being a Director does not
                                make anyone the Gaffer. Pending until they sign
                                up with this email. */}
                            <Text style={[styles.colorsHeading, {marginTop: spacing.md}]}>Gaffer</Text>
                            <Text style={styles.colorsDerivedNote}>
                              Runs this Contest (picks, members, weekly cycle). May
                              be a Director's email or a different person, and need
                              not play.
                            </Text>
                            <TextInput
                              style={{
                                borderWidth: 1,
                                borderColor: colors.border,
                                borderRadius: borderRadius.md,
                                paddingHorizontal: spacing.md,
                                paddingVertical: spacing.sm,
                                color: colors.textPrimary,
                                marginTop: spacing.sm,
                              }}
                              value={gafferEmail}
                              onChangeText={setGafferEmail}
                              placeholder="gaffer@email.com"
                              placeholderTextColor={colors.textSecondary}
                              autoCapitalize="none"
                              keyboardType="email-address"
                              autoCorrect={false}
                            />
                            <TouchableOpacity
                              style={[
                                styles.createButton,
                                {marginTop: spacing.sm},
                                (assigningGaffer || !gafferEmail.trim()) && styles.buttonDisabled,
                              ]}
                              onPress={() => handleAssignGaffer(partner)}
                              disabled={assigningGaffer || !gafferEmail.trim()}
                              accessibilityRole="button"
                              accessibilityLabel={`Assign Gaffer for ${partner.name}`}>
                              {assigningGaffer ? (
                                <ActivityIndicator size="small" color={colors.onPrimary} />
                              ) : (
                                <Text style={styles.createButtonText}>Assign Gaffer</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        );
                      }
                      return (
                        <>
                          <Text style={styles.colorsDerivedNote}>
                            This partner runs its own Contest. (Save the partner if
                            you just switched this on.)
                          </Text>
                          <TouchableOpacity
                            style={[
                              styles.createButton,
                              creatingPoolForPartnerId === partner.id && styles.buttonDisabled,
                              {marginBottom: spacing.md, marginTop: spacing.sm},
                            ]}
                            onPress={() => handleCreatePartnerPool(partner)}
                            disabled={creatingPoolForPartnerId === partner.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Start Club Contest for ${partner.name}`}
                            accessibilityState={{disabled: creatingPoolForPartnerId === partner.id}}>
                            {creatingPoolForPartnerId === partner.id ? (
                              <ActivityIndicator size="small" color={colors.onPrimary} />
                            ) : (
                              <Text style={styles.createButtonText}>Start Club Contest</Text>
                            )}
                          </TouchableOpacity>
                        </>
                      );
                    })()}

                    {/* The board — available for EVERY partner, sponsor-only
                        included, because it is partner-level and owes nothing
                        to a Club Contest. Live Directors AND unclaimed pending
                        grants both list here, which is what answers "who's on
                        the board, and did they sign up yet." */}
                    <Text style={[styles.colorsHeading, {marginTop: spacing.lg}]}>Directors</Text>
                    <Text style={styles.colorsDerivedNote}>
                      Who runs {partner.name} — perk, broadcasts, and each other.
                      Add by the email they'll sign in with; it stays pending until
                      they do. A partner always keeps at least one.
                    </Text>
                    <DelegateManager
                      target={{kind: 'partner', partnerId: partner.id}}
                      roleNoun="Director"
                      delegateRole="director"
                      canManage
                      showHeader={false}
                    />

                    {/* Address — partners.public_info->'address', the SAME field
                        League Tools writes. Blank clears it. */}
                    <Text style={[styles.colorsHeading, {marginTop: spacing.lg}]}>Address</Text>
                    <Text style={styles.colorsDerivedNote}>
                      Shows on the roster page. Same field {partner.name} edits in
                      League Tools — blank clears it.
                    </Text>
                    <TextInput
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: borderRadius.md,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        color: colors.textPrimary,
                        marginTop: spacing.sm,
                      }}
                      value={editAddress}
                      onChangeText={setEditAddress}
                      placeholder="123 Hertel Avenue, Buffalo NY"
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={[
                        styles.createButton,
                        {marginTop: spacing.sm, marginBottom: spacing.md},
                        (addressSaving ||
                          editAddress.trim() === (partner.public_info?.address ?? '')) &&
                          styles.buttonDisabled,
                      ]}
                      onPress={() => handleSaveAddress(partner)}
                      disabled={
                        addressSaving ||
                        editAddress.trim() === (partner.public_info?.address ?? '')
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Save address for ${partner.name}`}>
                      {addressSaving ? (
                        <ActivityIndicator size="small" color={colors.onPrimary} />
                      ) : (
                        <Text style={styles.createButtonText}>Save Address</Text>
                      )}
                    </TouchableOpacity>

                    {/* Staff entry into this partner's own League Tools. The
                        param is honored only for a super admin — see
                        ClubAdminScreen's header note. This is what replaced
                        holding a board seat just to look. */}
                    <TouchableOpacity
                      style={[styles.createButton, {marginBottom: spacing.md}]}
                      onPress={() =>
                        navigation.navigate('ClubAdmin', {partnerId: partner.id})
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Open League Tools for ${partner.name}`}>
                      <Text style={styles.createButtonText}>Open League Tools</Text>
                    </TouchableOpacity>

                    {/* Participation perk — partner-managed; max 120 chars. */}
                    <Text style={styles.colorsHeading}>Participation Perk</Text>
                    <Text style={styles.colorsDerivedNote}>
                      Partner-provided. Shows on Pool Module + Partner Roster.
                      Max 120 chars. Leave blank to hide partner modules.
                    </Text>
                    <View style={styles.perkRow}>
                      <TextInput
                        style={styles.perkIconInput}
                        value={editPerkIcon}
                        onChangeText={setEditPerkIcon}
                        placeholder="🎁"
                        placeholderTextColor={colors.textSecondary}
                        maxLength={4}
                      />
                      <TextInput
                        style={styles.perkTextInput}
                        value={editPerkText}
                        onChangeText={text => {
                          if (text.length <= 120) setEditPerkText(text);
                        }}
                        placeholder='$1 off any draft, Sundays.'
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        numberOfLines={2}
                        maxLength={120}
                      />
                    </View>
                    <Text style={styles.perkCharCount}>
                      {editPerkText.length}/120
                      {partner.perk_updated_at && editPerkText === (partner.perk_text ?? '')
                        ? '  ·  last updated ' +
                          new Date(partner.perk_updated_at).toLocaleDateString()
                        : ''}
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.createButton,
                        (!editName.trim() || saving) && styles.buttonDisabled,
                      ]}
                      onPress={() => handleSaveEdit(partner)}
                      disabled={!editName.trim() || saving}
                      accessibilityRole="button"
                      accessibilityLabel={`Save changes to ${partner.name}`}
                      accessibilityState={{disabled: !editName.trim() || saving}}>
                      {saving ? (
                        <ActivityIndicator size="small" color={colors.onPrimary} />
                      ) : (
                        <Text style={styles.createButtonText}>Save Changes</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* Signage + QR Code — expanded view. Pool alignment moves
                    to the organizer side (PartnerDirectoryScreen); see
                    260519 Partner-Pool model rework. */}
                {isExpanded && (
                  <>
                    {/* Invite Code for Signage */}
                    <View style={styles.signageSection}>
                      <Text style={styles.poolListLabel}>Invite Code for Signage</Text>
                      <Text style={styles.signageCode}>{partner.slug.toUpperCase()}</Text>
                      <Text style={styles.signageHint}>
                        Users type this code to join the pool. Case-insensitive.
                      </Text>
                    </View>

                    {/* Roster Pass — shared by the Club admin with a Gaffer.
                        Distinct from the Invite Code above (which lets a
                        user join the Club's pool). The Roster Pass lets a
                        Gaffer link THEIR Contest to this Club's roster. */}
                    <View style={styles.signageSection}>
                      <View style={styles.rosterPassHeaderRow}>
                        <Ticket size={14} color={colors.primary} strokeWidth={2.25} />
                        <Text style={styles.poolListLabel}>Roster Pass</Text>
                      </View>
                      <Text style={styles.signageCode}>
                        {formatRosterPass(partner.roster_pass)}
                      </Text>
                      <Text style={styles.signageHint}>
                        Share with a Gaffer who wants to link their Contest to{' '}
                        {partner.name}'s roster. They enter it on the Affiliate
                        with a Club page.
                      </Text>
                      <TouchableOpacity
                        style={styles.shareButton}
                        onPress={() => {
                          Clipboard.setString(formatRosterPass(partner.roster_pass));
                          Alert.alert(
                            'Copied',
                            `Roster Pass for ${partner.name} copied to clipboard.`,
                          );
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Copy ${partner.name} Roster Pass`}>
                        <Copy size={16} color={colors.primary} />
                        <Text style={styles.shareButtonText}>Copy Roster Pass</Text>
                      </TouchableOpacity>
                    </View>

                    {/* QR Code */}
                    <View style={styles.qrSection}>
                      <Text style={styles.poolListLabel}>Invite QR Code</Text>
                      <View style={styles.qrContainer}>
                        <QRCode
                          value={`https://hotpick.app/${partner.slug}`}
                          size={160}
                          backgroundColor={colors.background}
                          color={colors.textPrimary}
                        />
                      </View>
                      <Text style={styles.qrUrl}>
                        hotpick.app/{partner.slug}
                      </Text>
                      <TouchableOpacity
                        style={styles.shareButton}
                        onPress={() => handleShareQR(partner)}
                        accessibilityRole="button"
                        accessibilityLabel={`Share ${partner.name} invite link`}>
                        <Share2 size={16} color={colors.primary} />
                        <Text style={styles.shareButtonText}>Share Link</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal
        visible={urlPromptFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setUrlPromptFor(null)}>
        <Pressable
          style={styles.urlPromptBackdrop}
          onPress={() => setUrlPromptFor(null)}
          accessibilityLabel="Dismiss add logo dialog">
          <Pressable
            style={styles.urlPromptCard}
            onPress={() => {
              /* swallow taps inside the card so backdrop dismiss doesn't fire */
            }}>
            <Text style={styles.urlPromptTitle}>Add Logo by URL</Text>
            <Text style={styles.urlPromptHint}>
              Paste a direct image URL. Must be a square PNG/JPG/WebP, ≤2MB.
              Tip: open a logo in the Supabase Storage dashboard and copy its
              public URL.
            </Text>
            <TextInput
              style={styles.urlPromptInput}
              value={urlPromptValue}
              onChangeText={setUrlPromptValue}
              placeholder="https://…/logo.png"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
            />
            <View style={styles.urlPromptActions}>
              <TouchableOpacity
                onPress={() => setUrlPromptFor(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel">
                <Text style={styles.urlPromptCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitUrlPrompt}
                disabled={urlPromptValue.trim().length === 0}
                accessibilityRole="button"
                accessibilityLabel="Add logo from URL"
                accessibilityState={{disabled: urlPromptValue.trim().length === 0}}
                style={[
                  styles.urlPromptSubmit,
                  urlPromptValue.trim().length === 0 && styles.buttonDisabled,
                ]}>
                <Text style={styles.urlPromptSubmitText}>Add</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

