import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Share,
  Image,
  Modal,
  Platform,
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
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import {launchImageLibrary} from 'react-native-image-picker';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {HOTPICK_DEFAULTS, deriveFullBrandColors} from '@shell/theme/defaults';
import type {BrandConfig} from '@shell/theme/types';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

// DB column is plain text — the union narrows it app-side.
type PartnerType = 'hospitality' | 'operator' | 'media' | 'brand' | 'other';

const PARTNER_TYPES: PartnerType[] = ['hospitality', 'operator', 'media', 'brand', 'other'];

const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  hospitality: 'Hospitality',
  operator: 'Operator',
  media: 'Media',
  brand: 'Brand',
  other: 'Other',
};

const DEFAULT_CAN_RUN_POOLS_BY_TYPE: Record<PartnerType, boolean> = {
  hospitality: false,
  operator: true,
  media: false,
  brand: false,
  other: false,
};

interface Partner {
  id: string;
  name: string;
  slug: string;
  brand_config: unknown;
  created_at: string;
  // Participation-perk fields added by migration 260513_partner_perks.
  // perk_text is the customer-facing perk copy (max 120 chars, partner-managed).
  // perk_icon is an emoji or lucide name; renders as a small icon on PartnerModule.
  perk_text: string | null;
  perk_icon: string | null;
  perk_updated_at: string | null;
  // When true, the partner can be selected as the presenting partner of new
  // pools and partner-staff can join pools in the partner role. When false
  // (default), the partner is sponsor-only — brand surfaces via perk /
  // broadcasts / roster, but cannot run pools. Migration 260515.
  can_run_pools: boolean;
  // Stored as text in the DB; the app constrains to the PartnerType union.
  partner_type: PartnerType | null;
}

// react-native-image-picker returns `asset.type` inconsistently across
// platforms: MIME on Android, sometimes a UTI like `public.png` on iOS,
// `image/jpg` instead of `image/jpeg`, or empty. Accept either a MIME or
// a file-extension match so a real PNG isn't rejected for label drift.
const LOGO_BUCKET = 'partner-logos';
const LIBRARY_PREFIX = '_library';

const ALLOWED_MIME: readonly string[] = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ALLOWED_EXT = /\.(png|jpe?g|webp)$/i;

const LOGO_MAX_BYTES   = 2 * 1024 * 1024;
const BANNER_MAX_BYTES = 3 * 1024 * 1024;
const BANNER_RATIO     = 1200 / 630; // 1.9047…
const BANNER_RATIO_TOLERANCE = 0.05;

interface PickedImage {
  uri: string;
  fileName: string;
  type: string;
  width: number;
  height: number;
  fileSize: number;
}

interface LibraryItem {
  name: string;       // basename within _library, e.g. 'mes-que.png'
  displayName: string;
  url: string;        // canonical public URL — what gets saved on partner
  updatedAt: string;  // for cache-busting at render time only
}

function libraryItemUrl(name: string): string {
  const {data} = supabase.storage.from(LOGO_BUCKET).getPublicUrl(`${LIBRARY_PREFIX}/${name}`);
  return data.publicUrl;
}

function fileNameSlug(input: string): string {
  const dot = input.lastIndexOf('.');
  const base = dot > 0 ? input.slice(0, dot) : input;
  const ext  = dot > 0 ? input.slice(dot + 1).toLowerCase() : 'png';
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logo';
  return `${slug}.${ext}`;
}

async function probeImageSize(url: string): Promise<{w: number; h: number} | null> {
  return new Promise(resolve => {
    Image.getSize(url, (w, h) => resolve({w, h}), () => resolve(null));
  });
}

// Fetches a remote image and uploads it into the library so it appears
// in the grid alongside picker-sourced logos. Uses supabase.storage.upload
// (not the FormData REST endpoint) so a fetched Blob works directly in RN.
async function uploadRemoteUrlToLibrary(url: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) {
    Alert.alert('URL Rejected', 'URL must start with http:// or https://.');
    return null;
  }

  const dims = await probeImageSize(url);
  if (!dims) {
    Alert.alert('Fetch Failed', "Couldn't load the image. Is the URL public and reachable?");
    return null;
  }
  if (dims.w !== dims.h) {
    Alert.alert('Not Square', `Logo must be square. URL image is ${dims.w}×${dims.h}.`);
    return null;
  }

  const response = await fetch(url);
  if (!response.ok) {
    Alert.alert('Fetch Failed', `HTTP ${response.status}.`);
    return null;
  }
  const blob = await response.blob();

  if (blob.size > LOGO_MAX_BYTES) {
    Alert.alert('Too Large', `Image is ${(blob.size / 1024 / 1024).toFixed(2)}MB. Max 2MB.`);
    return null;
  }
  if (!ALLOWED_MIME.includes(blob.type.toLowerCase())) {
    Alert.alert('Format Rejected', `Got "${blob.type || 'unknown'}". Need PNG, JPG, or WebP.`);
    return null;
  }

  const cleanPath = url.split('?')[0];
  const lastSegment = cleanPath.split('/').pop() || 'logo.png';
  const ext = (lastSegment.split('.').pop() || 'png').toLowerCase();
  const basename = fileNameSlug(lastSegment).replace(/\.[^.]+$/, '');
  const storagePath = `${LIBRARY_PREFIX}/${basename}.${ext}`;

  const {error} = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(storagePath, blob, {contentType: blob.type, upsert: true});

  if (error) {
    Alert.alert('Upload Error', error.message);
    return null;
  }

  const {data} = supabase.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

async function listLibraryItems(): Promise<LibraryItem[]> {
  const {data, error} = await supabase
    .storage
    .from(LOGO_BUCKET)
    .list(LIBRARY_PREFIX, {limit: 200, sortBy: {column: 'updated_at', order: 'desc'}});
  if (error || !data) return [];
  return data
    .filter(o => o.name && !o.name.endsWith('/'))
    .map(o => ({
      name: o.name,
      displayName: o.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      url: libraryItemUrl(o.name),
      updatedAt: o.updated_at ?? '',
    }));
}

function hasAllowedFormat(a: PickedImage): boolean {
  return ALLOWED_MIME.includes(a.type.toLowerCase()) || ALLOWED_EXT.test(a.fileName);
}

function validateLogoAsset(a: PickedImage): string | null {
  if (!hasAllowedFormat(a)) {
    return `Logo must be PNG, JPG, or WebP. Got "${a.type || 'unknown'}" / "${a.fileName}".`;
  }
  if (a.fileSize > LOGO_MAX_BYTES) return 'Logo must be 2MB or smaller.';
  if (a.width !== a.height) return `Logo must be square. You picked ${a.width}×${a.height}.`;
  return null;
}

function validateBannerAsset(a: PickedImage): string | null {
  if (!hasAllowedFormat(a)) {
    return `Banner must be PNG, JPG, or WebP. Got "${a.type || 'unknown'}" / "${a.fileName}".`;
  }
  if (a.fileSize > BANNER_MAX_BYTES) return 'Banner must be 3MB or smaller.';
  const ratio = a.width / a.height;
  if (Math.abs(ratio - BANNER_RATIO) / BANNER_RATIO > BANNER_RATIO_TOLERANCE) {
    return `Banner must be ~1.91:1 (e.g. 1200×630). You picked ${a.width}×${a.height}.`;
  }
  return null;
}

/** Partners set 4 colors — the rest are auto-derived */
const COLOR_FIELDS: {key: 'primary_color' | 'secondary_color' | 'background_color' | 'highlight_color'; label: string; hint: string}[] = [
  {key: 'primary_color', label: 'Primary', hint: 'Buttons, headers'},
  {key: 'secondary_color', label: 'Secondary', hint: 'Accents'},
  {key: 'background_color', label: 'Background', hint: 'Page base'},
  {key: 'highlight_color', label: 'Highlight', hint: 'Light color for dark bg'},
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// pathPrefix is `${LIBRARY_PREFIX}` for shared logos, or a partner.id for
// partner-keyed assets (banner). `basename` is the file basename within
// the prefix — for logos it's a slugified original filename so the
// library shows readable names; for banners it's just "banner".
async function uploadPartnerImage(
  pathPrefix: string,
  basename: string,
  uri: string,
  fileName: string,
): Promise<string | null> {
  try {
    const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
    const storagePath = `${pathPrefix}/${basename}.${ext}`;
    const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    // Get auth token for the upload
    const {data: {session}} = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      Alert.alert('Upload Error', 'Not authenticated');
      return null;
    }

    // React Native: upload directly via REST API using fetch + FormData
    const SUPABASE_URL = 'https://mzqtrpdiqhopjmxjccwy.supabase.co';
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${LOGO_BUCKET}/${storagePath}`;

    const formData = new FormData();
    formData.append('file', {
      uri,
      name: `${basename}.${ext}`,
      type: mimeType,
    } as any);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-upsert': 'true',
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      console.warn('Logo upload error:', errText);
      Alert.alert('Upload Error', `${uploadResponse.status}: ${errText}`);
      return null;
    }

    const {data} = supabase.storage
      .from(LOGO_BUCKET)
      .getPublicUrl(storagePath);

    return data.publicUrl;
  } catch (err: any) {
    console.warn('Logo upload failed:', err);
    Alert.alert('Upload Error', err?.message || 'Unknown error');
    return null;
  }
}

export function PartnerAdminScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation<any>();
  const user = useGlobalStore(s => s.user);
  const userPools = useGlobalStore(s => s.userPools);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const updatePoolBrandConfig = useGlobalStore(s => s.updatePoolBrandConfig);

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
  const [formLogoLibraryUrl, setFormLogoLibraryUrl] = useState<string | null>(null);
  const [formBannerPick, setFormBannerPick] = useState<PickedImage | null>(null);
  const [formPartnerType, setFormPartnerType] = useState<PartnerType>('other');
  const [formCanRunPools, setFormCanRunPools] = useState<boolean>(
    DEFAULT_CAN_RUN_POOLS_BY_TYPE.other,
  );
  const [creating, setCreating] = useState(false);

  // Shared logo library — surfaced in both the create form and the edit form.
  // Tom's logos live at partner-logos/_library/. Adding to the library
  // uploads + auto-selects in the active form.
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryUploading, setLibraryUploading] = useState(false);

  // URL-paste affordance — backup when the iOS picker is restricted (sim
  // Limited Photos, empty Photos library, etc.). Holds the in-flight prompt.
  const [urlPromptFor, setUrlPromptFor] = useState<((url: string) => void) | null>(null);
  const [urlPromptValue, setUrlPromptValue] = useState('');

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryItems(await listLibraryItems());
    setLibraryLoading(false);
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

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
    setFormLogoLibraryUrl(null);
    setFormBannerPick(null);
    setFormPartnerType('other');
    setFormCanRunPools(DEFAULT_CAN_RUN_POOLS_BY_TYPE.other);
  }, []);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    const {data} = await supabase
      .from('partners')
      .select('*')
      .order('created_at', {ascending: false});
    setPartners((data as Partner[]) ?? []);
    setLoading(false);
  }, []);

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
        full: formLogoLibraryUrl ?? '',
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

    // Banner is partner-keyed (one banner per partner, not shared). Failed
    // banner upload leaves the partner intact — user can retry from edit.
    let uploadedBannerUrl: string | null = null;
    if (formBannerPick) {
      uploadedBannerUrl = await uploadPartnerImage(
        partnerId,
        'banner',
        formBannerPick.uri,
        formBannerPick.fileName,
      );
      if (!uploadedBannerUrl) {
        Alert.alert(
          'Banner Upload Failed',
          'The partner was created but the banner did not upload. You can retry from the edit form.',
        );
      }
    }

    if (uploadedBannerUrl) {
      const updatedConfig: BrandConfig = {
        ...brandConfig,
        ...({banner: {full: uploadedBannerUrl}} as Partial<BrandConfig>),
      };
      const {error: updateErr} = await supabase
        .from('partners')
        .update({brand_config: updatedConfig as unknown})
        .eq('id', partnerId);
      if (updateErr) {
        console.warn('Partner brand_config update failed:', updateErr.message);
      }
    }

    resetCreateForm();
    setShowForm(false);
    fetchPartners();
    setCreating(false);
  };

  const handleAssignToPool = async (partner: Partner, poolId: string) => {
    // Gate: only partners flagged as can_run_pools may be assigned to a
    // pool. Sponsor-only partners still surface via perk / broadcasts /
    // roster but cannot be a pool's presenting partner. Server-side
    // trigger (260515_partner_can_run_pools) enforces this independently.
    if (!partner.can_run_pools) {
      Alert.alert(
        'Partner is sponsor-only',
        `${partner.name} is set to sponsor-only. Flip the "Partner Class" switch in this partner's settings to allow pool assignment.`,
      );
      return;
    }

    const brandConfig = partner.brand_config as unknown as BrandConfig;
    const partnerSlug = partner.slug;

    const {error} = await supabase
      .from('pools')
      .update({
        brand_config: brandConfig as unknown,
        partner_id: partner.id,
        invite_slug: partnerSlug,
      })
      .eq('id', poolId);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    updatePoolBrandConfig(poolId, brandConfig);

    // Add the partner slug as an additional invite code on the pool (6–12
    // chars, alphanumeric). Letters-only of the slug, uppercased.
    // The primary auto-generated code on the pool is unchanged; this is an
    // extra code so signage / posters can use the partner name. If the
    // sluggified result doesn't fit the rules, we silently skip — the pool
    // is still joinable via its primary code.
    const partnerCode = partnerSlug.replace(/[^0-9a-z]/gi, '').toUpperCase();
    let partnerCodeAdded = false;
    if (partnerCode.length >= 6 && partnerCode.length <= 12) {
      const {data: rpcData} = await supabase.rpc('add_pool_invite_code', {
        p_pool_id: poolId,
        p_code: partnerCode,
        p_label: `${partner.name} signage`,
        p_is_primary: false,
      });
      // CODE_TAKEN is non-fatal — somebody else already has this code or
      // this pool already has it. Treat as "fine, move on."
      partnerCodeAdded = !rpcData?.error;
    }

    const pool = userPools.find(p => p.id === poolId);
    const codeNote = partnerCodeAdded
      ? `\n\nExtra invite code for signage: ${partnerCode}`
      : partnerCode.length >= 6 && partnerCode.length <= 12
        ? `\n\n(Signage code "${partnerCode}" was already taken — primary pool code still works.)`
        : '';
    Alert.alert(
      'Assigned',
      `${partner.name} brand applied to ${pool?.name ?? 'pool'}.${codeNote}`,
    );
    setExpandedPartnerId(null);
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

  const handleResetPool = async (poolId: string) => {
    const {error} = await supabase
      .from('pools')
      .update({brand_config: null, partner_id: null})
      .eq('id', poolId);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    updatePoolBrandConfig(poolId, null);

    const pool = userPools.find(p => p.id === poolId);
    Alert.alert('Reset', `${pool?.name ?? 'Pool'} reverted to HotPick defaults.`);
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

      const {error} = await supabase
        .from('partners')
        .update({
          name: editName.trim(),
          slug: slugify(editName.trim()),
          brand_config: updatedConfig as unknown,
          perk_text: trimmedPerk.length === 0 ? null : trimmedPerk,
          perk_icon: editPerkIcon.trim().length === 0 ? null : editPerkIcon.trim(),
          // perk_updated_at is auto-stamped by the partners_touch_perk_updated_at
          // trigger when perk_text or perk_icon changes.
          can_run_pools: editCanRunPools,
          partner_type: editPartnerType,
        })
        .eq('id', partner.id);

      if (error) {
        Alert.alert('Error', error.message);
        setSaving(false);
        return;
      }

      // Update any pools that use this partner's brand
      const assignedPools = userPools.filter(
        p => (p as any).partner_id === partner.id,
      );
      for (const pool of assignedPools) {
        const {error: poolError} = await supabase
          .from('pools')
          .update({brand_config: updatedConfig as unknown})
          .eq('id', pool.id);
        if (poolError) {
          console.warn('Pool brand update error:', poolError.message);
        }
        updatePoolBrandConfig(pool.id, updatedConfig);
      }

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

  const openUrlPrompt = (onSelect: (url: string) => void) => {
    setUrlPromptValue('');
    setUrlPromptFor(() => onSelect);
  };

  const submitUrlPrompt = async () => {
    const url = urlPromptValue.trim();
    const onSelect = urlPromptFor;
    if (!url || !onSelect) return;
    setLibraryUploading(true);
    const uploadedUrl = await uploadRemoteUrlToLibrary(url);
    setLibraryUploading(false);
    if (!uploadedUrl) return;
    setUrlPromptFor(null);
    onSelect(uploadedUrl);
    refreshLibrary();
  };

  /** Uploads a new logo to the shared library and auto-selects it. */
  const addToLibrary = async (onSelect: (url: string) => void) => {
    await pickAssetForCreate('logo', async picked => {
      setLibraryUploading(true);
      const basename = fileNameSlug(picked.fileName).replace(/\.[^.]+$/, '');
      const url = await uploadPartnerImage(
        LIBRARY_PREFIX,
        basename,
        picked.uri,
        picked.fileName,
      );
      setLibraryUploading(false);
      if (!url) {
        Alert.alert('Upload Failed', 'Logo did not upload to the library.');
        return;
      }
      onSelect(url);
      refreshLibrary();
    });
  };

  /** Shared logo picker — read-only grid of library items + Add-to-Library
   *  affordance. Used by both create and edit forms. */
  const renderLogoLibraryPicker = (
    selectedUrl: string | null,
    onSelect: (url: string | null) => void,
  ) => (
    <View style={styles.logoSection}>
      <Text style={styles.colorLabel}>Logo</Text>
      <Text style={styles.colorHint}>
        Pick from the HotPick Sports Logos library, or add a new one.
        Square 1:1 · 512×512px recommended · max 2MB · PNG, JPG, or WebP.
      </Text>

      {selectedUrl && (
        <View style={styles.logoPreviewRow}>
          <Image
            source={{uri: selectedUrl}}
            style={styles.logoPreview}
            resizeMode="contain"
          />
          <View style={styles.assetMetaCol}>
            <Text style={styles.colorHint} numberOfLines={2}>
              Selected
            </Text>
            <TouchableOpacity onPress={() => onSelect(null)} hitSlop={6}>
              <Text style={styles.resetText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.libraryRow}>
        {libraryLoading && libraryItems.length === 0 ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          libraryItems.map(item => {
            const isSelected = item.url === selectedUrl;
            // Bust RN's Image cache when the same path is overwritten;
            // canonical URL stays clean for selection compare + persistence.
            const renderUri = item.updatedAt
              ? `${item.url}?v=${new Date(item.updatedAt).getTime()}`
              : item.url;
            return (
              <TouchableOpacity
                key={item.name}
                onPress={() => onSelect(item.url)}
                style={[
                  styles.libraryTile,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                accessibilityLabel={`Select ${item.displayName}`}>
                <Image source={{uri: renderUri}} style={styles.libraryThumb} resizeMode="contain" />
              </TouchableOpacity>
            );
          })
        )}
        <TouchableOpacity
          style={[styles.libraryTile, styles.libraryAddTile, {borderColor: colors.border}]}
          onPress={() => addToLibrary(onSelect)}
          disabled={libraryUploading}>
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
          onPress={() => openUrlPrompt(onSelect)}
          disabled={libraryUploading}>
          <LinkIcon size={18} color={colors.textSecondary} />
          <Text style={styles.libraryAddText}>URL</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

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
            ]}>
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
                onPress={() => pickAssetForCreate(kind, onPick)}>
                <Text style={styles.logoChangeText}>Change</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onPick(null)} hitSlop={6}>
                <Text style={[styles.resetText, {marginLeft: spacing.md}]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.logoUploadButton}
          onPress={() => pickAssetForCreate(kind, onPick)}>
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
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <ChevronLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Partner Admin</Text>
          <TouchableOpacity
            onPress={() => {
              if (showForm) resetCreateForm();
              setShowForm(!showForm);
            }}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
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

            {renderLogoLibraryPicker(formLogoLibraryUrl, setFormLogoLibraryUrl)}
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

            <TouchableOpacity
              style={[
                styles.createButton,
                (!formName.trim() || creating) && styles.buttonDisabled,
              ]}
              onPress={handleCreate}
              disabled={!formName.trim() || creating}>
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
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
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
                    }>
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
                      }}>
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
                      }>
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

                    {/* Editing here does NOT re-default can_run_pools —
                        that would surprise-override existing partners. */}
                    <Text style={styles.colorsHeading}>Partner Type</Text>
                    {renderPartnerTypeSelector(editPartnerType, setEditPartnerType)}

                    {renderLogoLibraryPicker(editLogoUrl || null, url =>
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

                    {/* Partner class — controls whether this partner can be
                        selected as a pool's presenting partner and whether
                        partner-staff can join pools in the partner role. */}
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
                            ? 'Partner-staff accounts can be added to pools in the partner role, and this partner appears in the new-pool partner picker.'
                            : 'Brand still appears via perk, broadcasts, and roster — but the partner cannot organize or join pools.'}
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
                      disabled={!editName.trim() || saving}>
                      {saving ? (
                        <ActivityIndicator size="small" color={colors.onPrimary} />
                      ) : (
                        <Text style={styles.createButtonText}>Save Changes</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* Assign to Pool + QR Code — expanded view */}
                {isExpanded && (
                  <>
                    <View style={styles.poolList}>
                      <Text style={styles.poolListLabel}>Assign to pool:</Text>
                      {userPools.map(pool => {
                        const hasBrand = pool.brand_config != null;
                        return (
                          <View key={pool.id} style={styles.poolAssignRow}>
                            <Text
                              style={styles.poolAssignName}
                              numberOfLines={1}>
                              {pool.name}
                              {pool.id === activePoolId ? ' (Active)' : ''}
                            </Text>
                            <View style={styles.poolAssignActions}>
                              {hasBrand && (
                                <TouchableOpacity
                                  onPress={() => handleResetPool(pool.id)}
                                  hitSlop={{
                                    top: 6,
                                    bottom: 6,
                                    left: 6,
                                    right: 6,
                                  }}>
                                  <Text style={styles.resetText}>Reset</Text>
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                style={styles.assignButton}
                                onPress={() =>
                                  handleAssignToPool(partner, pool.id)
                                }>
                                <Text style={styles.assignButtonText}>
                                  Apply
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    {/* Invite Code for Signage */}
                    <View style={styles.signageSection}>
                      <Text style={styles.poolListLabel}>Invite Code for Signage</Text>
                      <Text style={styles.signageCode}>{partner.slug.toUpperCase()}</Text>
                      <Text style={styles.signageHint}>
                        Users type this code to join the pool. Case-insensitive.
                      </Text>
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
                        onPress={() => handleShareQR(partner)}>
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
        <View style={styles.urlPromptBackdrop}>
          <View style={styles.urlPromptCard}>
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
              <TouchableOpacity onPress={() => setUrlPromptFor(null)}>
                <Text style={styles.urlPromptCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitUrlPrompt}
                disabled={urlPromptValue.trim().length === 0}
                style={[
                  styles.urlPromptSubmit,
                  urlPromptValue.trim().length === 0 && styles.buttonDisabled,
                ]}>
                <Text style={styles.urlPromptSubmitText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Create form
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  slugPreview: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  slugInputRow: {
    marginBottom: spacing.md,
  },
  slugLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  slugInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  slugMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  slugCharCount: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  slugDisplay: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.textPrimary,
  },
  slugError: {
    fontSize: 12,
    color: colors.error,
    marginTop: spacing.xs,
  },

  // Logo
  logoSection: {
    marginBottom: spacing.lg,
  },
  logoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  logoPreview: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoChangeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  logoChangeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  logoUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    borderStyle: 'dashed',
    marginTop: spacing.xs,
  },
  logoUploadText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  partnerListLogo: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },

  // Colors
  colorsHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  colorsDerivedNote: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  classCopy: {
    flex: 1,
  },
  classLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: 4,
  },
  perkIconInput: {
    width: 56,
    minHeight: 56,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    fontSize: 22,
    textAlign: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  perkTextInput: {
    flex: 1,
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 13,
    lineHeight: 18,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  perkCharCount: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: spacing.lg,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  colorField: {
    width: '48%',
  },
  colorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  colorHint: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 4,
    opacity: 0.7,
  },
  colorInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  colorInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  createButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  createButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Partners list
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  loader: {
    marginTop: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },

  // Partner card
  partnerCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  partnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  partnerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  partnerHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editButtonLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  editSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 3,
  },
  miniSwatch: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  partnerName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  partnerNameCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  partnerBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  classBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  classBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.textTertiary,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.primary,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  typePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  bannerPreview: {
    width: 120,
    height: 63,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  libraryTile: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  libraryThumb: {
    width: 60,
    height: 60,
  },
  libraryAddTile: {
    borderStyle: 'dashed',
    gap: 2,
  },
  libraryAddText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  urlPromptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  urlPromptCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surfaceElevated || colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  urlPromptTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  urlPromptHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 17,
  },
  urlPromptInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    marginBottom: spacing.md,
  },
  urlPromptActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.lg,
  },
  urlPromptCancel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  urlPromptSubmit: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  urlPromptSubmitText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  assetMetaCol: {
    flex: 1,
    gap: 2,
  },
  assetActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },

  // Pool assign
  poolList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  poolListLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  poolAssignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  poolAssignName: {
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  poolAssignActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resetText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.error,
  },
  assignButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  assignButtonText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '600',
  },

  // Signage invite code
  signageSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    alignItems: 'center' as const,
  },
  signageCode: {
    fontSize: 32,
    fontWeight: '800' as const,
    letterSpacing: 3,
    color: colors.textPrimary,
    marginVertical: spacing.sm,
  },
  signageHint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center' as const,
  },

  // QR Code
  qrSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  qrContainer: {
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  qrUrl: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
});
