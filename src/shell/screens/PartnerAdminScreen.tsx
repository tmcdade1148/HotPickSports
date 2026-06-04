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
  // The partner's own Club Pool (NULL = none yet). Authoritative source for
  // "does this partner have a Club Pool?" — never infer it from pools.partner_id,
  // which is the roster-affiliation edge (many roster members share it).
  club_pool_id: string | null;
  // Stored as text in the DB; the app constrains to the PartnerType union.
  partner_type: PartnerType | null;
  // 8-char alphanumeric. Distinct from pools.invite_code; shared with
  // Gaffers to authorize affiliating their Contest with this Club's
  // roster (see 260527_partners_roster_pass migration).
  roster_pass: string;
}

// react-native-image-picker returns `asset.type` inconsistently across
// platforms: MIME on Android, sometimes a UTI like `public.png` on iOS,
// `image/jpg` instead of `image/jpeg`, or empty. Accept either a MIME or
// a file-extension match so a real PNG isn't rejected for label drift.
const LOGO_BUCKET = 'partner-logos';

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

function libraryItemUrl(prefix: string, name: string): string {
  const {data} = supabase.storage.from(LOGO_BUCKET).getPublicUrl(`${prefix}/${name}`);
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

async function uploadRemoteUrlToLibrary(prefix: string, url: string): Promise<string | null> {
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
  const storagePath = `${prefix}/${basename}.${ext}`;

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

async function listLibraryItems(prefix: string): Promise<LibraryItem[]> {
  const {data, error} = await supabase
    .storage
    .from(LOGO_BUCKET)
    .list(prefix, {limit: 200, sortBy: {column: 'updated_at', order: 'desc'}});
  if (error || !data) return [];
  return data
    .filter(o => o.name && !o.name.endsWith('/'))
    .map(o => ({
      name: o.name,
      displayName: o.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      url: libraryItemUrl(prefix, o.name),
      updatedAt: o.updated_at ?? '',
    }));
}

async function deleteLibraryItem(prefix: string, name: string): Promise<boolean> {
  const {error} = await supabase
    .storage
    .from(LOGO_BUCKET)
    .remove([`${prefix}/${name}`]);
  if (error) {
    Alert.alert('Delete Failed', error.message);
    return false;
  }
  return true;
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

// pathPrefix is the partner's slug folder (or partner.id for banner).
// basename is the file basename within the prefix — slugified for logos
// so the library shows readable names; just "banner" for banners.
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
  const [creatingPoolForPartnerId, setCreatingPoolForPartnerId] = useState<string | null>(null);
  // Chairman assignment (Club Pool organizer) — staff-only on-ramp.
  const [chairmanEmail, setChairmanEmail] = useState('');
  const [assigningChairman, setAssigningChairman] = useState(false);
  const setLeagueChairman = useGlobalStore(s => s.setLeagueChairman);
  // partner_id → existing pool id+name, so we know whether to show
  // "Create Partner Pool" or "View Partner Pool" inside an edit card.
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

    // Club Pool per partner — drives the create-vs-view CTA + the Chairman
    // field in each card. Keyed off the authoritative partners.club_pool_id,
    // NOT pools.partner_id (that's the roster-affiliation edge, which many
    // roster members share — using it falsely reports a Club Pool for any
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
  };

  const handleCreatePartnerPool = async (partner: Partner) => {
    setCreatingPoolForPartnerId(partner.id);
    const {data, error} = await supabase.rpc('create_partner_pool', {
      p_partner_id: partner.id,
    });
    setCreatingPoolForPartnerId(null);
    if (error) {
      Alert.alert('Could Not Create Pool', error.message);
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
        'Club Pool Created',
        `${partner.name}'s Club Pool is live. Invite code: ${row.invite_code ?? '—'} · Signage slug: ${row.invite_slug ?? partner.slug}`,
      );
    }
  };

  const handleAssignChairman = async (partner: Partner) => {
    const email = chairmanEmail.trim();
    if (!email) return;
    setAssigningChairman(true);
    const res = await setLeagueChairman(partner.id, email);
    setAssigningChairman(false);
    if (!res.success) {
      Alert.alert(
        'Could Not Assign Chairman',
        res.error === 'NO_CLUB_POOL'
          ? 'Create the Club Pool first, then assign the Chairman.'
          : res.error === 'FORBIDDEN'
            ? 'Super-admin only.'
            : res.error ?? 'Something went wrong.',
      );
      return;
    }
    setChairmanEmail('');
    Alert.alert(
      res.pending ? 'Chairman Invited' : 'Chairman Assigned',
      res.pending
        ? `${email} isn't on HotPick yet. They'll become Chairman automatically when they create an account with that exact email.`
        : `${email} is now the Chairman of ${partner.name}.`,
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
                            ? 'Operator: runs their own Club Pool with an invite code. Organizers can also add their pool to this partner’s roster.'
                            : 'Sponsor-only: no Club Pool. Brand surfaces via perk + broadcasts. Organizers find them in the directory and add the partner to their pool’s roster.'}
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

                    {/* Club Pool — only meaningful when can_run_pools. */}
                    {editCanRunPools && (() => {
                      const existing = partnerPoolByPartnerId[partner.id];
                      if (existing) {
                        return (
                          <View style={styles.partnerPoolCard}>
                            <Text style={styles.classLabel}>
                              Club Pool: {existing.name}
                            </Text>
                            <Text style={styles.colorsDerivedNote}>
                              Members join with invite code{' '}
                              <Text style={{fontWeight: '700'}}>
                                {existing.invite_code ?? '—'}
                              </Text>
                              . The organizer of this pool edits {partner.name}'s
                              perk and sends partner broadcasts from Pool Settings.
                            </Text>

                            {/* Chairman assignment — sets the Club Pool's
                                organizer. If the email isn't a user yet, the
                                role attaches when they sign up with it. */}
                            <Text style={[styles.colorsHeading, {marginTop: spacing.md}]}>Chairman</Text>
                            <Text style={styles.colorsDerivedNote}>
                              Runs this League and can add Directors. Enter the
                              email they'll use to sign in.
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
                              value={chairmanEmail}
                              onChangeText={setChairmanEmail}
                              placeholder="chairman@email.com"
                              placeholderTextColor={colors.textSecondary}
                              autoCapitalize="none"
                              keyboardType="email-address"
                              autoCorrect={false}
                            />
                            <TouchableOpacity
                              style={[
                                styles.createButton,
                                {marginTop: spacing.sm},
                                (assigningChairman || !chairmanEmail.trim()) && styles.buttonDisabled,
                              ]}
                              onPress={() => handleAssignChairman(partner)}
                              disabled={assigningChairman || !chairmanEmail.trim()}
                              accessibilityRole="button"
                              accessibilityLabel={`Assign Chairman for ${partner.name}`}>
                              {assigningChairman ? (
                                <ActivityIndicator size="small" color={colors.onPrimary} />
                              ) : (
                                <Text style={styles.createButtonText}>Assign Chairman</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        );
                      }
                      return (
                        <>
                          <Text style={styles.colorsDerivedNote}>
                            Create the Club Pool first — then you can assign its
                            Chairman here. (Save the partner if you just switched
                            this on.)
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
                            accessibilityLabel={`Create Club Pool for ${partner.name}`}
                            accessibilityState={{disabled: creatingPoolForPartnerId === partner.id}}>
                            {creatingPoolForPartnerId === partner.id ? (
                              <ActivityIndicator size="small" color={colors.onPrimary} />
                            ) : (
                              <Text style={styles.createButtonText}>Create Club Pool</Text>
                            )}
                          </TouchableOpacity>
                        </>
                      );
                    })()}

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
  partnerPoolCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 4,
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
  libraryTileWrap: {
    position: 'relative',
    width: 64,
    height: 64,
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
  libraryDeleteBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: {width: 0, height: 1},
    shadowRadius: 2,
    elevation: 2,
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
  rosterPassHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginBottom: spacing.sm,
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
