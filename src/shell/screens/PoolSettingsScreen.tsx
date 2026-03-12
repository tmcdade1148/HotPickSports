import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import {
  ChevronLeft,
  Copy,
  Share2,
  Archive,
  Globe,
  Award,
  Megaphone,
} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {BroadcastComposer} from '@shell/components/BroadcastComposer';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';
import type {BrandConfig} from '@shell/theme/types';
import {HOTPICK_DEFAULTS} from '@shell/theme/defaults';

export function PoolSettingsScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const poolId = route.params?.poolId as string;

  const userPools = useGlobalStore(s => s.userPools);
  const poolMembers = useGlobalStore(s => s.poolMembers);
  const updatePoolSettings = useGlobalStore(s => s.updatePoolSettings);
  const archivePool = useGlobalStore(s => s.archivePool);

  const pool = useMemo(
    () => userPools.find(p => p.id === poolId),
    [userPools, poolId],
  );

  const poolBrand = useMemo(() => {
    const bc = pool?.brand_config as unknown as BrandConfig | null | undefined;
    return bc?.is_branded ? bc : null;
  }, [pool]);
  const accentColor = poolBrand?.secondary_color ?? HOTPICK_DEFAULTS.primary_color;

  const [poolName, setPoolName] = useState(pool?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [broadcastVisible, setBroadcastVisible] = useState(false);

  if (!pool) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <ChevronLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pool Settings</Text>
          <View style={{width: 24}} />
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Pool not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasNameChanged = poolName.trim() !== pool.name;
  const memberCount = poolMembers.length;
  const startDate = new Date(pool.pool_start_date).toLocaleDateString(
    undefined,
    {month: 'long', day: 'numeric', year: 'numeric'},
  );

  const handleSaveName = async () => {
    if (!hasNameChanged) return;
    setSaving(true);
    const result = await updatePoolSettings(poolId, {
      name: poolName.trim(),
    });
    setSaving(false);
    if (result.success) {
      Alert.alert('Saved', 'Pool name updated.');
    } else {
      Alert.alert('Error', result.error ?? 'Failed to update pool name');
    }
  };

  const handleShareInvite = async () => {
    if (!pool.invite_code) return;
    try {
      await Share.share({
        message: `Join my pool "${pool.name}" on HotPick Sports! Use invite code: ${pool.invite_code}`,
      });
    } catch {
      // User cancelled share
    }
  };

  const handleCopyCode = () => {
    if (!pool.invite_code) return;
    Clipboard.setString(pool.invite_code);
    Alert.alert('Copied', 'Invite code copied to clipboard.');
  };

  const handleTogglePublic = () => {
    const newVal = !pool.is_public;
    Alert.alert(
      newVal ? 'Make Public?' : 'Make Private?',
      newVal
        ? 'Anyone with the invite code can join.'
        : 'New members will need approval to join.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Confirm',
          onPress: async () => {
            const result = await updatePoolSettings(poolId, {
              isPublic: newVal,
            });
            if (!result.success) {
              Alert.alert(
                'Error',
                result.error ?? 'Failed to update setting',
              );
            }
          },
        },
      ],
    );
  };

  const handleArchive = () => {
    Alert.alert(
      'Archive Pool',
      `Archive "${pool.name}"? Members will no longer see this pool in their active list. This can be reversed.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            const result = await archivePool(poolId);
            if (result.success) {
              navigation.goBack();
            } else {
              Alert.alert(
                'Error',
                result.error ?? 'Failed to archive pool',
              );
            }
          },
        },
      ],
    );
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
            <ChevronLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pool Settings</Text>
          <View style={{width: 24}} />
        </View>

        {/* Pool Name */}
        <Text style={styles.sectionTitle}>Pool Name</Text>
        <View style={styles.nameRow}>
          <TextInput
            style={styles.nameInput}
            value={poolName}
            onChangeText={setPoolName}
            maxLength={30}
            placeholder="Pool name"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="done"
            onSubmitEditing={handleSaveName}
          />
          {hasNameChanged && (
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSaveName}
              disabled={saving}>
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Invite Code */}
        {pool.invite_code && !pool.is_global && (
          <>
            <Text style={styles.sectionTitle}>Invite Code</Text>
            <View style={styles.inviteCard}>
              <Text style={[styles.inviteCodeLarge, {color: accentColor}]}>{pool.invite_code}</Text>
              <View style={styles.inviteActions}>
                <TouchableOpacity
                  style={[styles.inviteButton, {borderColor: accentColor}]}
                  onPress={handleCopyCode}>
                  <Copy size={16} color={accentColor} />
                  <Text style={[styles.inviteButtonText, {color: accentColor}]}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.inviteButton, {borderColor: accentColor}]}
                  onPress={handleShareInvite}>
                  <Share2 size={16} color={accentColor} />
                  <Text style={[styles.inviteButtonText, {color: accentColor}]}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* Pool Info */}
        <Text style={styles.sectionTitle}>Pool Info</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Members</Text>
            <Text style={styles.infoValue}>{memberCount}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Member Limit</Text>
            <Text style={styles.infoValue}>
              {pool.member_limit ?? 'Unlimited'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Start Date</Text>
            <Text style={styles.infoValue}>{startDate}</Text>
          </View>
          {pool.is_founding_pool && (
            <View style={styles.foundingBadge}>
              <Award size={14} color={colors.primary} />
              <Text style={styles.foundingText}>Founding Pool</Text>
            </View>
          )}
        </View>

        {/* Public Toggle */}
        <TouchableOpacity style={styles.toggleRow} onPress={handleTogglePublic}>
          <Globe
            size={18}
            color={pool.is_public ? colors.primary : colors.textSecondary}
          />
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>Public Pool</Text>
            <Text style={styles.toggleDesc}>
              {pool.is_public
                ? 'Anyone with the invite code can join'
                : 'New members need approval'}
            </Text>
          </View>
          <View
            style={[
              styles.toggleIndicator,
              pool.is_public && styles.toggleIndicatorOn,
            ]}>
            <View
              style={[
                styles.toggleDot,
                pool.is_public && styles.toggleDotOn,
              ]}
            />
          </View>
        </TouchableOpacity>

        {/* Broadcast */}
        <Text style={styles.sectionTitle}>Communication</Text>
        <TouchableOpacity
          style={[styles.broadcastButton, {borderColor: accentColor}]}
          onPress={() => setBroadcastVisible(true)}>
          <Megaphone size={18} color={accentColor} />
          <Text style={[styles.broadcastText, {color: accentColor}]}>Send Broadcast</Text>
        </TouchableOpacity>

        {/* Danger Zone */}
        <Text style={[styles.sectionTitle, styles.dangerTitle]}>
          Danger Zone
        </Text>
        <TouchableOpacity style={styles.archiveButton} onPress={handleArchive}>
          <Archive size={18} color={colors.error} />
          <Text style={styles.archiveText}>Archive Pool</Text>
        </TouchableOpacity>
      </ScrollView>

      <BroadcastComposer
        poolId={poolId}
        poolName={pool.name}
        visible={broadcastVisible}
        onClose={() => setBroadcastVisible(false)}
      />
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  inviteCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  inviteCodeLarge: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 4,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  inviteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  foundingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  foundingText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  toggleDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  toggleIndicator: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleIndicatorOn: {
    backgroundColor: colors.primary,
  },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  toggleDotOn: {
    alignSelf: 'flex-end',
  },
  broadcastButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
  },
  broadcastText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  dangerTitle: {
    color: colors.error,
    marginTop: spacing.xl,
  },
  archiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.error,
    marginHorizontal: spacing.lg,
  },
  archiveText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
