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
import {useNavigation} from '@react-navigation/native';
import {
  User,
  Plus,
  LogOut,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Users,
  Building2,
  Star,
  Palette,
  Settings,
  Info,
  BookOpen,
  Mail,
  Shield,
  FileText,
  Award,
  Trash2,
  MessageSquare,
  Bell,
} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {SYSTEM_AVATARS} from '@shell/components/AvatarSelector';
import {getDisplayName} from '@shared/utils/displayName';
import {spacing, borderRadius} from '@shared/theme';
import {useColorScheme} from 'react-native';
import type {BrandConfig} from '@shell/theme/types';
import {HOTPICK_DEFAULTS, SEMANTIC_COLORS, SEMANTIC_COLORS_DARK, deriveDarkColors, isLightColor} from '@shell/theme/defaults';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function SettingsScreen({route}: any) {
  const navigation = useNavigation<any>();
  const expandPools = route?.params?.expandPools ?? false;

  const user = useGlobalStore(s => s.user);
  const userProfile = useGlobalStore(s => s.userProfile);
  const userPools = useGlobalStore(s => s.visiblePools);
  const poolRoles = useGlobalStore(s => s.poolRoles);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const rawDefaultPoolId = useGlobalStore(s => s.defaultPoolId);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const setDefaultPoolId = useGlobalStore(s => s.setDefaultPoolId);

  // Effective default: manual setting → first created → first partner pool → first joined
  const effectiveDefaultPoolId = rawDefaultPoolId
    ?? userPools.find(p => poolRoles[p.id] === 'organizer')?.id
    ?? userPools.find(p => !!(p.brand_config as any)?.is_branded)?.id
    ?? userPools[0]?.id
    ?? null;
  const activeSport = useGlobalStore(s => s.activeSport);
  const joinPool = useGlobalStore(s => s.joinPool);
  const signOut = useGlobalStore(s => s.signOut);
  const flaggedCounts = useGlobalStore(s => s.flaggedCounts);

  // Settings page always uses HotPick colors — never changes for partner pools.
  // But it must respect system dark/light mode.
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const config = isDark ? deriveDarkColors(HOTPICK_DEFAULTS) : HOTPICK_DEFAULTS;
  const semantic = isDark ? SEMANTIC_COLORS_DARK : SEMANTIC_COLORS;
  const colors = {
    primary: config.primary_color,
    secondary: config.secondary_color,
    background: config.background_color,
    surface: config.surface_color,
    textPrimary: config.text_primary,
    textSecondary: config.text_secondary,
    border: semantic.border,
    error: semantic.error,
  };

  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [poolsExpanded, setPoolsExpanded] = useState(expandPools);

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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently remove your name, email, and avatar. Your picks and scores will be retained anonymously for leaderboard integrity.\n\nYou will be signed out immediately. This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            // Second confirmation
            Alert.alert(
              'Are you absolutely sure?',
              'Your profile, pool memberships, and notification preferences will be permanently removed.',
              [
                {text: 'Go Back', style: 'cancel'},
                {
                  text: 'Yes, Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      if (!user?.id) return;
                      const {error} = await supabase.rpc('anonymize_deleted_user', {
                        p_user_id: user.id,
                      });
                      if (error) {
                        Alert.alert('Error', 'Failed to delete account. Please try again or contact support@hotpicksports.com.');
                        return;
                      }
                      await signOut();
                      navigation.reset({index: 0, routes: [{name: 'Welcome'}]});
                    } catch {
                      Alert.alert('Error', 'Something went wrong. Please contact support@hotpicksports.com.');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  // Find active pool name for the collapsed summary
  const activePool = userPools.find(p => p.id === activePoolId);

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
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

      {/* Inbox section */}
      <Text style={[styles.groupLabel, {color: colors.textSecondary}]}>Inbox</Text>
      <View style={[styles.groupCard, {backgroundColor: colors.surface}]}>
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => navigation.navigate('MessageCenter')}>
          <View style={styles.linkLeft}>
            <Mail size={20} color={colors.primary} />
            <Text style={[styles.linkText, {color: colors.textPrimary}]}>Message Center</Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={[styles.groupDivider, {backgroundColor: colors.border}]} />
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => navigation.navigate('NotificationPreferences')}>
          <View style={styles.linkLeft}>
            <Bell size={20} color={colors.primary} />
            <Text style={[styles.linkText, {color: colors.textPrimary}]}>Notification Preferences</Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

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
          {/* Pool list — partner pools first, then HotPick pools (global pool hidden) */}
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
            const hotpick = {primary: colors.primary, secondary: colors.secondary, surface: colors.surface};

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

            const poolGlowColor = isBranded
              ? (pool.brand_config as any)?.secondary_color || '#0E6666'
              : '#0E6666';

            return (
              <TouchableOpacity
                key={pool.id}
                style={[
                  styles.poolRow,
                  isBranded && {backgroundColor: pillBg},
                  !isBranded && {backgroundColor: hotpick.surface},
                  !isBranded && isActive && {borderWidth: 1.5, borderColor: hotpick.primary},
                ]}
                onPress={() => setActivePoolId(pool.id)}>
                <View style={styles.poolInfo}>
                  <TouchableOpacity
                    onPress={() => setDefaultPoolId(pool.id)}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Star
                      size={27}
                      color={
                        pool.id === effectiveDefaultPoolId
                          ? (isBranded ? pillTextColor : hotpick.primary)
                          : pillIconColor
                      }
                      fill={pool.id === effectiveDefaultPoolId ? (isBranded ? pillTextColor : hotpick.primary) : 'none'}
                    />
                  </TouchableOpacity>
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
                  {(flaggedCounts[pool.id] ?? 0) > 0 && (
                    <View style={styles.flaggedBanner}>
                      <Text style={styles.flaggedBannerText}>
                        {flaggedCounts[pool.id]} flagged
                      </Text>
                    </View>
                  )}
                  {isActive && (
                    <Text style={[styles.activeLabel, {color: isBranded ? pillTextColor : hotpick.primary}]}>
                      Active
                    </Text>
                  )}
                  {(poolRoles[pool.id] === 'organizer' || poolRoles[pool.id] === 'admin') && (
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('PoolSettings', {poolId: pool.id})
                      }
                      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                      <Settings size={18} color={pillIconColor} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('PoolMembers', {poolId: pool.id})
                    }
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Users size={18} color={pillIconColor} />
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
            <View>
              <Text style={[styles.createPoolText, {color: colors.primary}]}>Create a Pool</Text>
              <Text style={[styles.createPoolSub, {color: colors.primary}]}>and invite friends</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* About & Legal section */}
      <Text style={[styles.groupLabel, {color: colors.textSecondary}]}>About & Legal</Text>
      <View style={[styles.groupCard, {backgroundColor: colors.surface}]}>
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => navigation.navigate('Instructions')}>
          <View style={styles.linkLeft}>
            <BookOpen size={20} color={colors.primary} />
            <Text style={[styles.linkText, {color: colors.textPrimary}]}>How HotPick Works</Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={[styles.groupDivider, {backgroundColor: colors.border}]} />
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => navigation.navigate('About')}>
          <View style={styles.linkLeft}>
            <Info size={20} color={colors.primary} />
            <Text style={[styles.linkText, {color: colors.textPrimary}]}>About HotPick Sports</Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={[styles.groupDivider, {backgroundColor: colors.border}]} />
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => navigation.navigate('PrivacyPolicy')}>
          <View style={styles.linkLeft}>
            <Shield size={20} color={colors.primary} />
            <Text style={[styles.linkText, {color: colors.textPrimary}]}>Privacy Policy</Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={[styles.groupDivider, {backgroundColor: colors.border}]} />
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => navigation.navigate('TermsOfService')}>
          <View style={styles.linkLeft}>
            <FileText size={20} color={colors.primary} />
            <Text style={[styles.linkText, {color: colors.textPrimary}]}>Terms of Service</Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={[styles.groupDivider, {backgroundColor: colors.border}]} />
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => navigation.navigate('CommunityGuidelines')}>
          <View style={styles.linkLeft}>
            <MessageSquare size={20} color={colors.primary} />
            <Text style={[styles.linkText, {color: colors.textPrimary}]}>Community Guidelines</Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Admin section — super admin only */}
      {userProfile?.is_super_admin && (
        <>
          <Text style={[styles.groupLabel, {color: colors.textSecondary}]}>Admin</Text>
          <View style={[styles.groupCard, {backgroundColor: colors.surface}]}>
            <TouchableOpacity
              style={styles.groupRow}
              onPress={() => navigation.navigate('PartnerAdmin')}>
              <View style={styles.linkLeft}>
                <Palette size={20} color={colors.primary} />
                <Text style={[styles.linkText, {color: colors.textPrimary}]}>Partner Admin</Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={[styles.groupDivider, {backgroundColor: colors.border}]} />
            <TouchableOpacity
              style={styles.groupRow}
              onPress={() => navigation.navigate('HardwareAdmin')}>
              <View style={styles.linkLeft}>
                <Award size={20} color={colors.primary} />
                <Text style={[styles.linkText, {color: colors.textPrimary}]}>Hardware Admin</Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Sign out */}
      <TouchableOpacity style={[styles.signOutButton, {borderColor: colors.error}]} onPress={handleSignOut}>
        <LogOut size={18} color={colors.error} />
        <Text style={[styles.signOutText, {color: colors.error}]}>Sign Out</Text>
      </TouchableOpacity>

      {/* Delete account */}
      <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
        <Trash2 size={16} color={colors.textSecondary} />
        <Text style={[styles.deleteText, {color: colors.textSecondary}]}>Delete Account</Text>
      </TouchableOpacity>
    </ScrollView>
    </View>
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
    marginLeft: spacing.lg,
    marginBottom: spacing.md,
  },
  // Pool rows
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.lg,
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
  flaggedBanner: {
    backgroundColor: '#E53935',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  flaggedBannerText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
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
  createPoolSub: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 1,
  },
  // Group section
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    marginTop: spacing.md,
    marginLeft: spacing.xs,
  },
  groupCard: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    paddingVertical: spacing.md + 2,
  },
  groupDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md + 20 + spacing.md, // icon width + gap
  },
  // Link rows (standalone)
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
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: '400',
  },
});
