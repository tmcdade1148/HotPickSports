import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {
  User,
  Plus,
  LogOut,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Users,
  Star,
  Palette,
  Settings,
  Info,
  BookOpen,
} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {SYSTEM_AVATARS} from '@shell/components/AvatarSelector';
import {getDisplayName} from '@shared/utils/displayName';
import {spacing, borderRadius} from '@shared/theme';
import type {BrandConfig} from '@shell/theme/types';
import {HOTPICK_DEFAULTS, isLightColor} from '@shell/theme/defaults';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function SettingsScreen() {
  const navigation = useNavigation<any>();

  const user = useGlobalStore(s => s.user);
  const userProfile = useGlobalStore(s => s.userProfile);
  const userPools = useGlobalStore(s => s.userPools);
  const poolRoles = useGlobalStore(s => s.poolRoles);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const defaultPoolId = useGlobalStore(s => s.defaultPoolId);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const setDefaultPoolId = useGlobalStore(s => s.setDefaultPoolId);
  const activeSport = useGlobalStore(s => s.activeSport);
  const joinPool = useGlobalStore(s => s.joinPool);
  const signOut = useGlobalStore(s => s.signOut);

  // Settings page always uses HotPick colors — never changes for partner pools
  const colors = {
    primary: HOTPICK_DEFAULTS.primary_color,
    secondary: HOTPICK_DEFAULTS.secondary_color,
    background: HOTPICK_DEFAULTS.background_color,
    surface: HOTPICK_DEFAULTS.surface_color,
    textPrimary: HOTPICK_DEFAULTS.text_primary,
    textSecondary: HOTPICK_DEFAULTS.text_secondary,
    border: '#333333',
    error: '#EF476F',
  };

  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [poolsExpanded, setPoolsExpanded] = useState(false);

  const displayName = getDisplayName(userProfile);

  // Get brand colors for a specific pool (per-pool branding)
  const getPoolColors = (pool: {brand_config?: unknown}) => {
    const config = pool.brand_config as BrandConfig | null | undefined;
    if (config && config.is_branded) {
      return {primary: config.primary_color, secondary: config.secondary_color};
    }
    return {primary: HOTPICK_DEFAULTS.primary_color, secondary: HOTPICK_DEFAULTS.secondary_color};
  };

  // Resolve avatar emoji for profile card
  const avatarInfo = userProfile?.avatar_key
    ? SYSTEM_AVATARS.find(a => a.key === userProfile.avatar_key)
    : null;

  const togglePools = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPoolsExpanded(!poolsExpanded);
  };

  const handleJoinPool = async () => {
    if (!inviteCode.trim() || !user?.id) return;

    setJoining(true);
    setJoinError('');

    const result = await joinPool(user.id, inviteCode.trim());

    if (result.pool) {
      setInviteCode('');
      setActivePoolId(result.pool.id);
      Alert.alert('Joined!', `You've joined ${result.pool.name}`);
    } else if (result.poolFull) {
      setJoinError('This pool is full and cannot accept new members.');
    } else {
      setJoinError(result.error ?? 'Invalid invite code or pool is full.');
    }
    setJoining(false);
  };

  const handleCreatePool = () => {
    if (activeSport) {
      navigation.navigate('CreatePool');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          navigation.reset({index: 0, routes: [{name: 'Welcome'}]});
        },
      },
    ]);
  };

  // Find active pool name for the collapsed summary
  const activePool = userPools.find(p => p.id === activePoolId);

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]} edges={['top']}>
      {/* Header — outside ScrollView, matches About/Instructions */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.textPrimary}]}>Settings</Text>
        <View style={{width: 24}} />
      </View>
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">

      {/* Profile card */}
      <TouchableOpacity
        style={[styles.profileCard, {backgroundColor: colors.surface}]}
        onPress={() => navigation.navigate('Profile')}>
        <View style={styles.profileInfo}>
          <View
            style={[
              styles.avatarCircle,
              {backgroundColor: colors.border},
              avatarInfo && {backgroundColor: avatarInfo.color},
            ]}>
            {avatarInfo ? (
              <Text style={styles.avatarEmoji}>{avatarInfo.emoji}</Text>
            ) : (
              <User size={24} color={colors.textSecondary} />
            )}
          </View>
          <View style={styles.profileText}>
            <Text style={[styles.profileName, {color: colors.textPrimary}]}>{displayName}</Text>
            <Text style={[styles.profileEmail, {color: colors.textSecondary}]}>{user?.email}</Text>
          </View>
        </View>
        <ChevronRight size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Pools section — collapsible */}
      <TouchableOpacity
        style={[styles.poolsHeader, {backgroundColor: colors.surface}]}
        onPress={togglePools}
        activeOpacity={0.7}>
        <View style={styles.poolsHeaderLeft}>
          <Users size={18} color={colors.primary} />
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>My Pools</Text>
          <Text style={[styles.poolCount, {color: colors.textSecondary}]}>
            ({userPools.length})
          </Text>
        </View>
        <View style={styles.poolsHeaderRight}>
          {!poolsExpanded && activePool && (
            <Text style={[styles.activePoolHint, {color: colors.primary}]} numberOfLines={1}>
              {activePool.name}
            </Text>
          )}
          {poolsExpanded ? (
            <ChevronUp size={20} color={colors.textSecondary} />
          ) : (
            <ChevronDown size={20} color={colors.textSecondary} />
          )}
        </View>
      </TouchableOpacity>

      {poolsExpanded && (
        <View style={styles.poolsContent}>
          {/* Pool list — partner pools first, then HotPick pools */}
          {[
            ...userPools.filter(p => !!(p.brand_config as any)?.is_branded),
            'DIVIDER' as const,
            ...userPools.filter(p => !(p.brand_config as any)?.is_branded),
          ].map((poolOrDivider) => {
            if (poolOrDivider === 'DIVIDER') {
              const hasPartner = userPools.some(p => !!(p.brand_config as any)?.is_branded);
              if (!hasPartner) return null;
              return <View key="partner-divider" style={{height: 16}} />;
            }
            const pool = poolOrDivider as typeof userPools[0];
            const poolBrand = getPoolColors(pool);
            const isBranded = !!(pool.brand_config as any)?.is_branded;
            const isActive = pool.id === activePoolId;
            const hotpick = {primary: HOTPICK_DEFAULTS.primary_color, secondary: HOTPICK_DEFAULTS.secondary_color};

            // Partner pills: secondary bg when inactive, primary bg when active
            // HotPick pills: no bg when inactive, primary border when active
            const pillBg = isBranded
              ? (isActive ? poolBrand.primary : poolBrand.secondary)
              : undefined;
            // Contrast text for partner pill backgrounds
            const pillTextColor = isBranded
              ? (isLightColor(pillBg!) ? '#1A1A1A' : '#FFFFFF')
              : (isActive ? hotpick.primary : colors.textPrimary);
            const pillIconColor = isBranded
              ? (isLightColor(pillBg!) ? '#1A1A1A' : '#FFFFFF')
              : (isActive ? hotpick.primary : colors.textSecondary);

            return (
              <TouchableOpacity
                key={pool.id}
                style={[
                  styles.poolRow,
                  isBranded && {backgroundColor: pillBg},
                  !isBranded && isActive && {borderWidth: 1.5, borderColor: hotpick.primary},
                ]}
                onPress={() => setActivePoolId(pool.id)}>
                <View style={styles.poolInfo}>
                  <Users size={18} color={pillIconColor} />
                  <View style={styles.poolNameCol}>
                      <Text
                        style={[
                          styles.poolName,
                          {color: pillTextColor},
                          isActive && !isBranded && {fontWeight: '600'},
                        ]}
                        numberOfLines={1}>
                        {pool.name}
                      </Text>
                    <View style={styles.poolMetaRow}>
                      {pool.is_global ? (
                        <Text style={[styles.globalBadge, isBranded && {color: pillTextColor + 'AA'}]}>Global pool</Text>
                      ) : poolRoles[pool.id] ? (
                        <Text style={[styles.roleBadge, isBranded && {color: pillTextColor + 'AA'}]}>
                          {poolRoles[pool.id].charAt(0).toUpperCase() +
                            poolRoles[pool.id].slice(1)}
                        </Text>
                      ) : null}
                      {!pool.is_global &&
                        pool.invite_code &&
                        (poolRoles[pool.id] === 'organizer' ||
                          poolRoles[pool.id] === 'admin') && (
                          <TouchableOpacity
                            onPress={() => {
                              Clipboard.setString(pool.invite_code ?? '');
                              Alert.alert(
                                'Invite Code Copied',
                                pool.invite_code ?? '',
                                [{text: 'OK'}],
                              );
                            }}
                            hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
                            <Text
                              style={[
                                styles.inviteCode,
                                {
                                  color: pillTextColor,
                                  backgroundColor: (isBranded ? pillTextColor : hotpick.primary) + '15',
                                },
                              ]}>
                              {pool.invite_code}
                            </Text>
                          </TouchableOpacity>
                        )}
                    </View>
                  </View>
                </View>
                <View style={styles.poolActions}>
                  {isActive && (
                    <Text style={[styles.activeLabel, {color: isBranded ? pillTextColor : hotpick.primary}]}>
                      Active
                    </Text>
                  )}
                  {(poolRoles[pool.id] === 'organizer' ||
                    poolRoles[pool.id] === 'admin') && (
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('PoolMembers', {poolId: pool.id})
                      }
                      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                      <Users size={18} color={pillIconColor} />
                    </TouchableOpacity>
                  )}
                  {poolRoles[pool.id] === 'organizer' && (
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('PoolSettings', {poolId: pool.id})
                      }
                      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                      <Settings size={18} color={pillIconColor} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => setDefaultPoolId(pool.id)}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Star
                      size={18}
                      color={
                        pool.id === defaultPoolId
                          ? (isBranded ? pillTextColor : hotpick.primary)
                          : pillIconColor
                      }
                      fill={pool.id === defaultPoolId ? (isBranded ? pillTextColor : hotpick.primary) : 'none'}
                    />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Join pool */}
          <View style={styles.joinSection}>
            <Text style={[styles.joinLabel, {color: colors.textPrimary}]}>Have an invite code?</Text>
            <View style={styles.codeRow}>
              <TextInput
                style={[styles.codeInput, {borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface}]}
                placeholder="Enter code"
                placeholderTextColor={colors.textSecondary}
                value={inviteCode}
                onChangeText={text => {
                  setInviteCode(text.toUpperCase());
                  if (joinError) setJoinError('');
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                returnKeyType="go"
                onSubmitEditing={handleJoinPool}
              />
              <TouchableOpacity
                style={[
                  styles.joinButton,
                  {backgroundColor: colors.primary},
                  (!inviteCode.trim() || joining) && styles.joinButtonDisabled,
                ]}
                onPress={handleJoinPool}
                disabled={!inviteCode.trim() || joining}>
                {joining ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.joinButtonText}>Join</Text>
                )}
              </TouchableOpacity>
            </View>
            {joinError ? (
              <Text style={[styles.codeError, {color: colors.error}]}>{joinError}</Text>
            ) : null}
          </View>

          {/* Create pool */}
          <TouchableOpacity
            style={[styles.createPoolButton, {backgroundColor: colors.surface, borderColor: colors.primary}]}
            onPress={handleCreatePool}>
            <Plus size={18} color={colors.primary} />
            <Text style={[styles.createPoolText, {color: colors.primary}]}>Create a pool</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Links section */}
      <TouchableOpacity
        style={[styles.linkRow, {backgroundColor: colors.surface}]}
        onPress={() => navigation.navigate('Instructions')}>
        <View style={styles.linkLeft}>
          <BookOpen size={20} color={colors.primary} />
          <Text style={[styles.linkText, {color: colors.textPrimary}]}>How HotPick Works</Text>
        </View>
        <ChevronRight size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.linkRow, {backgroundColor: colors.surface}]}
        onPress={() => navigation.navigate('About')}>
        <View style={styles.linkLeft}>
          <Info size={20} color={colors.primary} />
          <Text style={[styles.linkText, {color: colors.textPrimary}]}>About HotPick Sports</Text>
        </View>
        <ChevronRight size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Developer tools — only visible in dev builds */}
      {__DEV__ && (
        <TouchableOpacity
          style={[styles.devButton, {borderColor: colors.border}]}
          onPress={() => navigation.navigate('PartnerAdmin')}>
          <Palette size={18} color={colors.textSecondary} />
          <Text style={[styles.devButtonText, {color: colors.textSecondary}]}>Partner Admin (Dev)</Text>
        </TouchableOpacity>
      )}

      {/* Sign out */}
      <TouchableOpacity style={[styles.signOutButton, {borderColor: colors.error}]} onPress={handleSignOut}>
        <LogOut size={18} color={colors.error} />
        <Text style={[styles.signOutText, {color: colors.error}]}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 24,
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  // Pools collapsible header
  poolsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  poolsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  poolsHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    justifyContent: 'flex-end',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  poolCount: {
    fontSize: 14,
    fontWeight: '500',
  },
  activePoolHint: {
    fontSize: 13,
    fontWeight: '500',
    maxWidth: 140,
  },
  poolsContent: {
    marginBottom: spacing.md,
  },
  // Pool rows
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  poolInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  poolNameCol: {
    flex: 1,
  },
  poolMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  poolName: {
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
  },
  inviteCode: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    letterSpacing: 1,
    overflow: 'hidden',
  },
  poolActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  globalBadge: {
    fontSize: 11,
    marginTop: 1,
  },
  roleBadge: {
    fontSize: 11,
    marginTop: 1,
  },
  joinSection: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  joinLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  codeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    letterSpacing: 2,
    fontWeight: '600',
  },
  joinButton: {
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.4,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  codeError: {
    fontSize: 13,
    marginTop: spacing.xs,
  },
  createPoolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: spacing.md,
  },
  createPoolText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Link rows
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    paddingVertical: spacing.md + 2,
    marginBottom: spacing.sm,
  },
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  linkText: {
    fontSize: 15,
    fontWeight: '500',
  },
  devButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  devButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    marginTop: spacing.sm,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
