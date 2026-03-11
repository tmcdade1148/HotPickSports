import React, {useState, useEffect, useCallback, useRef} from 'react';
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
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {HOTPICK_DEFAULTS} from '@shell/theme/defaults';
import type {BrandConfig} from '@shell/theme/types';
import {colors, spacing, borderRadius} from '@shared/theme';

interface Partner {
  id: string;
  name: string;
  slug: string;
  brand_config: unknown;
  created_at: string;
}

const COLOR_FIELDS: {key: keyof Pick<BrandConfig, 'primary_color' | 'secondary_color' | 'background_color' | 'surface_color' | 'text_primary' | 'text_secondary'>; label: string}[] = [
  {key: 'primary_color', label: 'Primary'},
  {key: 'secondary_color', label: 'Secondary'},
  {key: 'background_color', label: 'Background'},
  {key: 'surface_color', label: 'Surface'},
  {key: 'text_primary', label: 'Text'},
  {key: 'text_secondary', label: 'Text 2nd'},
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function PartnerAdminScreen() {
  const navigation = useNavigation<any>();
  const user = useGlobalStore(s => s.user);
  const userPools = useGlobalStore(s => s.userPools);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const setActiveBrandConfig = useGlobalStore(s => s.setActiveBrandConfig);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedPartnerId, setExpandedPartnerId] = useState<string | null>(
    null,
  );

  // Create form state
  const [formName, setFormName] = useState('');
  const [formColors, setFormColors] = useState({
    primary_color: HOTPICK_DEFAULTS.primary_color,
    secondary_color: HOTPICK_DEFAULTS.secondary_color,
    background_color: HOTPICK_DEFAULTS.background_color,
    surface_color: HOTPICK_DEFAULTS.surface_color,
    text_primary: HOTPICK_DEFAULTS.text_primary,
    text_secondary: HOTPICK_DEFAULTS.text_secondary,
  });
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

  const handleCreate = async () => {
    const name = formName.trim();
    if (!name || !user?.id) return;

    setCreating(true);

    const brandConfig: BrandConfig = {
      partner_name: name,
      pool_label: name,
      primary_color: formColors.primary_color,
      secondary_color: formColors.secondary_color,
      background_color: formColors.background_color,
      surface_color: formColors.surface_color,
      text_primary: formColors.text_primary,
      text_secondary: formColors.text_secondary,
      logo: {full: '', mark: '', wordmark: '', mono_light: '', mono_dark: ''},
      app_name: name,
      invite_slug: slugify(name),
      is_branded: true,
      powered_by_hotpick: true,
    };

    const {error} = await supabase.from('partners').insert({
      name,
      slug: slugify(name),
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
        surface_color: HOTPICK_DEFAULTS.surface_color,
        text_primary: HOTPICK_DEFAULTS.text_primary,
        text_secondary: HOTPICK_DEFAULTS.text_secondary,
      });
      setShowForm(false);
      fetchPartners();
    }
    setCreating(false);
  };

  const handleAssignToPool = async (partner: Partner, poolId: string) => {
    const brandConfig = partner.brand_config as unknown as BrandConfig;

    const {error} = await supabase
      .from('pools')
      .update({brand_config: brandConfig as unknown, partner_id: partner.id})
      .eq('id', poolId);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    // If assigning to the active pool, update theme instantly
    if (poolId === activePoolId) {
      setActiveBrandConfig(brandConfig);
    }

    const pool = userPools.find(p => p.id === poolId);
    Alert.alert('Assigned', `${partner.name} brand applied to ${pool?.name ?? 'pool'}.`);
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

    if (poolId === activePoolId) {
      setActiveBrandConfig(null);
    }

    const pool = userPools.find(p => p.id === poolId);
    Alert.alert('Reset', `${pool?.name ?? 'Pool'} reverted to HotPick defaults.`);
  };

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
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Partner Admin</Text>
          <TouchableOpacity
            onPress={() => setShowForm(!showForm)}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            {showForm ? (
              <X size={24} color={colors.text} />
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

            {formName.trim() ? (
              <Text style={styles.slugPreview}>
                Slug: {slugify(formName.trim())}
              </Text>
            ) : null}

            <View style={styles.colorGrid}>
              {COLOR_FIELDS.map(({key, label}) => (
                <View key={key} style={styles.colorField}>
                  <Text style={styles.colorLabel}>{label}</Text>
                  <View style={styles.colorInputRow}>
                    <View
                      style={[
                        styles.colorSwatch,
                        {backgroundColor: formColors[key]},
                      ]}
                    />
                    <TextInput
                      style={styles.colorInput}
                      value={formColors[key]}
                      onChangeText={text =>
                        setFormColors(prev => ({...prev, [key]: text}))
                      }
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={7}
                      placeholder="#000000"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                </View>
              ))}
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

            return (
              <View key={partner.id} style={styles.partnerCard}>
                <TouchableOpacity
                  style={styles.partnerHeader}
                  onPress={() =>
                    setExpandedPartnerId(isExpanded ? null : partner.id)
                  }>
                  <View style={styles.partnerInfo}>
                    {bc && (
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
                    )}
                    <Text style={styles.partnerName}>{partner.name}</Text>
                  </View>
                  <Users
                    size={18}
                    color={
                      isExpanded ? colors.primary : colors.textSecondary
                    }
                  />
                </TouchableOpacity>

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

                    {/* QR Code */}
                    <View style={styles.qrSection}>
                      <Text style={styles.poolListLabel}>Invite QR Code</Text>
                      <View style={styles.qrContainer}>
                        <QRCode
                          value={`https://hotpick.app/${partner.slug}`}
                          size={160}
                          backgroundColor={colors.background}
                          color={colors.text}
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

const styles = StyleSheet.create({
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
    color: colors.text,
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
    color: colors.text,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  slugPreview: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
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
    marginBottom: 4,
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
    color: colors.text,
    backgroundColor: colors.background,
    fontFamily: 'monospace',
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
    color: colors.text,
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
    color: colors.text,
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
    color: colors.text,
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
