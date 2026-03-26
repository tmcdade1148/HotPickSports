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
  Platform,
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
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import {launchImageLibrary} from 'react-native-image-picker';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {HOTPICK_DEFAULTS, deriveFullBrandColors} from '@shell/theme/defaults';
import type {BrandConfig} from '@shell/theme/types';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

interface Partner {
  id: string;
  name: string;
  slug: string;
  brand_config: unknown;
  created_at: string;
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

/** Upload an image to Supabase Storage and return the public URL */
async function uploadPartnerLogo(
  slug: string,
  uri: string,
  fileName: string,
): Promise<string | null> {
  try {
    const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
    const storagePath = `${slug}/logo.${ext}`;
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
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/partner-logos/${storagePath}`;

    const formData = new FormData();
    formData.append('file', {
      uri,
      name: `logo.${ext}`,
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
      .from('partner-logos')
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
  const [formLogoUrl, setFormLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [creating, setCreating] = useState(false);

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

  const pickAndUploadLogo = async (
    slug: string,
    onSuccess: (url: string) => void,
  ) => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 512,
        maxHeight: 512,
      });

      if (result.didCancel || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.uri) return;

      setUploadingLogo(true);
      const publicUrl = await uploadPartnerLogo(
        slug,
        asset.uri,
        asset.fileName || 'logo.png',
      );
      setUploadingLogo(false);

      if (publicUrl) {
        onSuccess(publicUrl);
      } else {
        Alert.alert('Upload Failed', 'Upload returned null. See previous error alerts for details.');
      }
    } catch (err: any) {
      setUploadingLogo(false);
      Alert.alert('Pick/Upload Error', err?.message || String(err));
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
        full: formLogoUrl,
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

    const {error} = await supabase.from('partners').insert({
      name,
      slug: finalSlug,
      brand_config: brandConfig as unknown,
      created_by: user.id,
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setFormName('');
      setFormColors({
        primary_color: HOTPICK_DEFAULTS.primary_color,
        secondary_color: HOTPICK_DEFAULTS.secondary_color,
        background_color: HOTPICK_DEFAULTS.background_color,
        highlight_color: HOTPICK_DEFAULTS.highlight_color,
      });
      setFormLogoUrl('');
      setShowForm(false);
      fetchPartners();
    }
    setCreating(false);
  };

  const handleAssignToPool = async (partner: Partner, poolId: string) => {
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

    const pool = userPools.find(p => p.id === poolId);
    Alert.alert(
      'Assigned',
      `${partner.name} brand applied to ${pool?.name ?? 'pool'}.\n\nInvite code for signage: ${partnerSlug.toUpperCase()}`,
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

      const {error} = await supabase
        .from('partners')
        .update({
          name: editName.trim(),
          slug: slugify(editName.trim()),
          brand_config: updatedConfig as unknown,
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

  /** Shared logo section renderer */
  const renderLogoSection = (
    logoUrl: string,
    slug: string,
    onLogoUploaded: (url: string) => void,
  ) => (
    <View style={styles.logoSection}>
      <Text style={styles.colorLabel}>Logo</Text>
      {logoUrl ? (
        <View style={styles.logoPreviewRow}>
          <Image
            source={{uri: logoUrl}}
            style={styles.logoPreview}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={styles.logoChangeButton}
            onPress={() => pickAndUploadLogo(slug, onLogoUploaded)}
            disabled={uploadingLogo}>
            {uploadingLogo ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.logoChangeText}>Change</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.logoUploadButton}
          onPress={() => pickAndUploadLogo(slug, onLogoUploaded)}
          disabled={uploadingLogo}>
          {uploadingLogo ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Upload size={18} color={colors.textSecondary} />
              <Text style={styles.logoUploadText}>Upload Logo</Text>
            </>
          )}
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
            onPress={() => setShowForm(!showForm)}
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

            {/* Logo upload */}
            {formName.trim()
              ? renderLogoSection(formLogoUrl, slugify(formName.trim()), url =>
                  setFormLogoUrl(url),
                )
              : null}

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
                <ActivityIndicator size="small" color="#FFFFFF" />
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
                    <Text style={styles.partnerName}>{partner.name}</Text>
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

                    {/* Logo in edit mode */}
                    {renderLogoSection(editLogoUrl, partner.slug, url =>
                      setEditLogoUrl(url),
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
                    <TouchableOpacity
                      style={[
                        styles.createButton,
                        (!editName.trim() || saving) && styles.buttonDisabled,
                      ]}
                      onPress={() => handleSaveEdit(partner)}
                      disabled={!editName.trim() || saving}>
                      {saving ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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
