import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Linking,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  LayoutAnimation,
  Modal,
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
  HelpCircle,
  Check,
} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {SYSTEM_AVATARS} from '@shell/components/AvatarSelector';
import {getDisplayName} from '@shared/utils/displayName';
import {spacing, borderRadius} from '@shared/theme';
import {useColorScheme} from 'react-native';
import type {BrandConfig} from '@shell/theme/types';
import {HOTPICK_DEFAULTS, SEMANTIC_COLORS, SEMANTIC_COLORS_DARK, deriveDarkColors, isLightColor} from '@shell/theme/defaults';
import {getEventsByPriority} from '@sports/registry';
import {LEXICON} from '@shared/lexicon';


export function SettingsScreen({route}: any) {
  const navigation = useNavigation<any>();
  const expandPools = route?.params?.expandPools ?? false;

  const user = useGlobalStore(s => s.user);
  const userProfile = useGlobalStore(s => s.userProfile);
  const visiblePools = useGlobalStore(s => s.visiblePools);
  const allPools = useGlobalStore(s => s.userPools);
  // Show global pool in settings when user has no visible private pools
  const userPools = visiblePools.length > 0 ? visiblePools : allPools;
  const poolRoles = useGlobalStore(s => s.poolRoles);

  // Club Admin gating reads from the globalStore.managedClub slice,
  // which is loaded alongside the user profile (no per-Settings-mount
  // refetch).
  const managedClub = useGlobalStore(s => s.managedClub);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  // Member counts come from the Home screen's rank loader (kept in
  // userRankByPool). If the user lands on Settings first the map is
  // empty — count just doesn't render until Home loads.
  const userRankByPool = useGlobalStore(s => s.userRankByPool);
  const activeSport = useGlobalStore(s => s.activeSport);
  const visibleCompetitions = useGlobalStore(s => s.visibleCompetitions);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);
  const rawDefaultPoolId = useGlobalStore(s => s.defaultPoolId);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const setDefaultPoolId = useGlobalStore(s => s.setDefaultPoolId);

  // Effective default: manual setting → first created → first partner pool → first joined
  const effectiveDefaultPoolId = rawDefaultPoolId
    ?? userPools.find(p => poolRoles[p.id] === 'organizer')?.id
    ?? userPools.find(p => !!(p.brand_config as any)?.is_branded)?.id
    ?? userPools[0]?.id
    ?? null;
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
    onPrimary: '#FFFFFF',
  };

  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [poolsExpanded, setPoolsExpanded] = useState(expandPools);
  const [compPickerVisible, setCompPickerVisible] = useState(false);

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
    if (!user?.id) return;
    const normalized = inviteCode.toUpperCase().replace(/[\s-]/g, '');
    if (normalized.length < 6 || normalized.length > 12) {
      setJoinError('Invite code must be 6–12 characters.');
      return;
    }
    if (!/^[0-9A-Z]+$/.test(normalized)) {
      setJoinError('Invite code can only contain letters and numbers.');
      return;
    }

    setJoining(true);
    setJoinError('');

    const result = await joinPool(user.id, normalized);

    if (result.pool) {
      setInviteCode('');
      setActivePoolId(result.pool.id);
      Alert.alert('Joined!', `You've joined ${result.pool.name}`);
    } else if (result.poolFull) {
      setJoinError('This Contest is full and cannot accept new members.');
    } else {
      setJoinError(result.error ?? 'Invalid invite code or Contest is full.');
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
      'This will permanently remove your name, email, and avatar. Your picks and scores will be retained anonymously for Ladder integrity.\n\nYou will be signed out immediately. This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            // Second confirmation
            Alert.alert(
              'Are you absolutely sure?',
              'Your profile, Contest memberships, and notification preferences will be permanently removed.',
              [
                {text: 'Go Back', style: 'cancel'},
                {
                  text: 'Yes, Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      if (!user?.id) return;
                      const {data: {session}} = await supabase.auth.getSession();
                      const resp = await supabase.functions.invoke('delete-account', {
                        headers: {Authorization: `Bearer ${session?.access_token}`},
                      });
                      if (resp.error || resp.data?.success === false) {
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

      {/* History section — awards + career record (HistoryScreen) */}
      <Text style={[styles.groupLabel, {color: colors.textSecondary}]}>History</Text>
      <View style={[styles.groupCard, {backgroundColor: colors.surface}]}>
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => navigation.navigate('History')}>
          <View style={styles.linkLeft}>
            <Award size={20} color={colors.primary} />
            <Text style={[styles.linkText, {color: colors.textPrimary}]}>Awards & Records</Text>
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
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>My {LEXICON.contest.plural}</Text>
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
          <Text style={[styles.poolsHint, {color: colors.textSecondary}]}>
            Tap a Contest to make it active. Tap the ★ to pin a Contest to the
            top of your Home Screen — the rest sort alphabetically.
          </Text>
          {/* Pool list — Official Club Contests first, then everything else
              (Affiliated + Private mix alphabetically). Only Official rows
              wear Club brand colors; Affiliated/Private render as neutral
              pills per product call. */}
          {[
            ...userPools.filter(p => !!p.owning_club_id),
            'DIVIDER' as const,
            ...userPools.filter(p => !p.owning_club_id),
          ].map((poolOrDivider) => {
            if (poolOrDivider === 'DIVIDER') {
              const hasOfficial = userPools.some(p => !!p.owning_club_id);
              if (!hasOfficial) return null;
              return <View key="partner-divider" style={{height: 16}} />;
            }
            const pool = poolOrDivider as typeof userPools[0];
            const poolBrand = getPoolColors(pool);
            // `isBranded` here means "this row IS an Official Club
            // Contest" — only Official rows wear Club brand colors.
            // Affiliated pools render neutral, same as Private.
            const isBranded = !!pool.owning_club_id;
            const isActive = pool.id === activePoolId;
            const hotpick = {primary: colors.primary, secondary: colors.secondary, surface: colors.surface};

            // Three visual states:
            //   • Official + active:   solid Club primary bg + contrast text
            //   • Official + inactive: neutral surface + 1.5px NEUTRAL
            //                          outline + standard text. Reads as a
            //                          quiet, unselected row (per 2026-05-27
            //                          product call). The "Mes Que · Gaffer"
            //                          subtitle still calls out the Club
            //                          relationship — the pill itself doesn't
            //                          need to be Club-colored when not active.
            //   • Non-Official:        neutral bg; HotPick primary border
            //                          only when active.
            const pillBg = isBranded && isActive ? poolBrand.primary : undefined;
            const pillTextColor = isBranded && isActive
              ? (isLightColor(pillBg!) ? '#303030' : '#FFFFFF')
              : isActive
                ? hotpick.primary
                : colors.textPrimary;
            const pillIconColor = isBranded && isActive
              ? (isLightColor(pillBg!) ? '#303030' : '#FFFFFF')
              : isActive
                ? hotpick.primary
                : colors.textSecondary;

            const poolGlowColor = isBranded
              ? (pool.brand_config as any)?.secondary_color || '#0E6666'
              : '#0E6666';

            return (
              <TouchableOpacity
                key={pool.id}
                style={[
                  styles.poolRow,
                  // Filled bg only for Official+active. Every other state
                  // sits on neutral surface.
                  isBranded && isActive && {backgroundColor: pillBg},
                  (!isBranded || !isActive) && {backgroundColor: hotpick.surface},
                  // Borders: inactive Official gets a quiet neutral outline
                  // so it doesn't disappear into the rest of the list.
                  // Active private gets the HotPick accent border.
                  isBranded && !isActive && {borderWidth: 1.5, borderColor: colors.border},
                  !isBranded && isActive && {borderWidth: 1.5, borderColor: hotpick.primary},
                  // Suspended pools get a thick red outline so members
                  // see at a glance that this Contest is frozen.
                  pool.is_suspended && {borderWidth: 1.5, borderColor: colors.error},
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
                        {userRankByPool[pool.id]?.memberCount != null && (
                          <Text style={[styles.poolMemberCount, {color: pillTextColor + 'AA'}]}>
                            {`  (${userRankByPool[pool.id].memberCount})`}
                          </Text>
                        )}
                      </Text>
                    <View style={styles.poolMetaRow}>
                      {pool.is_suspended && (
                        <Text style={[styles.roleBadge, {color: colors.error, fontWeight: '800'}]}>
                          SUSPENDED ·{' '}
                        </Text>
                      )}
                      {/* Official Club Contests surface the owning Club's
                          name in the meta row so the pill identifies WHICH
                          Club it belongs to (the brand-color background
                          alone doesn't say "Mes Que" out loud). Read off
                          the brand_config snapshot — kept fresh by the
                          partners_propagate_brand trigger. */}
                      {isBranded && (
                        <Text style={[styles.roleBadge, {color: pillTextColor + 'CC', fontWeight: '700'}]}>
                          {(() => {
                            const bc = pool.brand_config as Record<string, unknown> | null;
                            return typeof bc?.partner_name === 'string' ? bc.partner_name : LEXICON.league.short;
                          })()}
                          {(pool.is_global || poolRoles[pool.id]) ? ' · ' : ''}
                        </Text>
                      )}
                      {pool.is_global ? (
                        <Text style={[styles.globalBadge, {color: colors.textSecondary}, isBranded && {color: pillTextColor + 'AA'}]}>Global Contest</Text>
                      ) : poolRoles[pool.id] ? (
                        <Text style={[styles.roleBadge, {color: colors.textSecondary}, isBranded && {color: pillTextColor + 'AA'}]}>
                          {poolRoles[pool.id] === 'organizer'
                            ? LEXICON.gaffer.short
                            : poolRoles[pool.id].charAt(0).toUpperCase() +
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
                  {/* "Active" label removed — the pill's visual state
                      (brand color bg for Official, primary border for
                      everything else) already signals active. */}
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

          {/* Join Contest */}
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
                maxLength={12}
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
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={styles.joinButtonText}>Join</Text>
                )}
              </TouchableOpacity>
            </View>
            {joinError ? (
              <Text style={[styles.codeError, {color: colors.error}]}>{joinError}</Text>
            ) : null}
          </View>

          {/* Create Contest */}
          <TouchableOpacity
            style={[styles.createPoolButton, {backgroundColor: colors.surface, borderColor: colors.primary}]}
            onPress={handleCreatePool}>
            <Plus size={18} color={colors.primary} />
            <View>
              <Text style={[styles.createPoolText, {color: colors.primary}]}>Create a Contest</Text>
              <Text style={[styles.createPoolSub, {color: colors.primary}]}>and invite friends</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Admin section — the single home for all admin entry points.
          Visible to platform super_admins and/or Club managers. Each row
          is individually gated: the super-admin tools (HotPick Admin hub,
          Hardware Admin, Competition switcher) on is_super_admin; Club Admin
          on managing a Club (managedClub) — so a Club manager who isn't a
          super-admin sees only that one row. */}
      {(userProfile?.is_super_admin || managedClub !== null) && (
        <>
          <View style={styles.adminLabelRow}>
            <Text style={[styles.groupLabel, {color: colors.textSecondary}]}>Admin</Text>
            {/* Access level for the logged-in user, in red. The section only
                shows for super-admins or Club managers, so it's one of those. */}
            <Text style={[styles.accessBadge, {color: colors.error}]}>
              {userProfile?.is_super_admin ? 'Super Admin' : LEXICON.leagueTools}
            </Text>
          </View>
          <View style={[styles.groupCard, {backgroundColor: colors.surface}]}>
            {userProfile?.is_super_admin && (
              <>
                <TouchableOpacity
                  style={styles.groupRow}
                  onPress={() => navigation.navigate('AdminHome')}>
                  <View style={styles.linkLeft}>
                    <Shield size={20} color={colors.primary} />
                    <Text style={[styles.linkText, {color: colors.textPrimary}]}>HotPick Admin</Text>
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
                <View style={[styles.groupDivider, {backgroundColor: colors.border}]} />
                <TouchableOpacity
                  style={styles.groupRow}
                  onPress={() => setCompPickerVisible(true)}>
              <View style={styles.linkLeft}>
                <Settings size={20} color={colors.primary} />
                <Text style={[styles.linkText, {color: colors.textPrimary}]}>
                  Competition: {activeSport?.name ?? '—'}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
              </>
            )}
            {/* Club Admin — gated on managing a Club, so a Club manager who
                isn't a super-admin still sees just this row. */}
            {userProfile?.is_super_admin && managedClub !== null && (
              <View style={[styles.groupDivider, {backgroundColor: colors.border}]} />
            )}
            {managedClub !== null && (
              <TouchableOpacity
                style={styles.groupRow}
                onPress={() => navigation.navigate('ClubAdmin')}>
                <View style={styles.linkLeft}>
                  <Settings size={20} color={colors.primary} />
                  <View>
                    <Text style={[styles.linkText, {color: colors.textPrimary}]}>{LEXICON.leagueTools}</Text>
                    <Text style={{fontSize: 12, color: colors.textSecondary, marginTop: 2}}>
                      Managing: {managedClub.name}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </>
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

      {/* Get Help — fires a mailto: to the support inbox. v1 fallback per
          the 2026-05-27 product call (deferred a fuller in-app ticket
          form). Pre-populates a context line so support knows who's
          writing and from which app build. */}
      <TouchableOpacity
        style={[styles.signOutButton, {borderColor: colors.border, marginTop: 0}]}
        onPress={() => {
          const subject = encodeURIComponent('HotPick — Help request');
          const body = encodeURIComponent(
            `\n\n\n---\nFrom: ${userProfile?.poolie_name ?? user?.email ?? 'a HotPick user'}\n` +
            `Email: ${user?.email ?? ''}\n` +
            `User ID: ${user?.id ?? ''}\n` +
            `Please describe what you need help with above this line.`,
          );
          Linking.openURL(
            `mailto:support@hotpicksports.com?subject=${subject}&body=${body}`,
          ).catch(() => {
            Alert.alert(
              'Email not available',
              'Reach us at support@hotpicksports.com',
            );
          });
        }}>
        <HelpCircle size={18} color={colors.textPrimary} />
        <Text style={[styles.signOutText, {color: colors.textPrimary}]}>Get Help</Text>
      </TouchableOpacity>

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

      {/* Competition picker — every competition the user can see, with a check
          on the active one. Replaces the old SIM ⇄ 2026 toggle so super-admins
          can jump straight to any sim (nfl_2025_sim / simA / simG) or 2026. */}
      <Modal
        visible={compPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCompPickerVisible(false)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setCompPickerVisible(false)}
          style={styles.compModalScrim}>
          <View style={[styles.compModalCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[styles.groupLabel, {color: colors.textSecondary, paddingHorizontal: spacing.lg, paddingTop: spacing.md}]}>
              SWITCH COMPETITION
            </Text>
            <ScrollView>
              {getEventsByPriority(visibleCompetitions).map(ev => {
                const isActive = activeSport?.competition === ev.competition;
                return (
                  <TouchableOpacity
                    key={ev.competition}
                    style={styles.groupRow}
                    onPress={() => {
                      if (isActive) {
                        setCompPickerVisible(false);
                        return;
                      }
                      // Confirm before switching — changing competition resets the
                      // active view; don't do it on a stray tap.
                      Alert.alert(
                        'Switch Competition',
                        `Switch to ${ev.name}?\n\nCurrent: ${activeSport?.name ?? 'none'}`,
                        [
                          {text: 'Cancel', style: 'cancel'},
                          {
                            text: 'Switch',
                            onPress: () => {
                              setCompPickerVisible(false);
                              setActiveSport(ev);
                              Alert.alert('Switched', `Now using ${ev.name}. Restart the app for a clean state.`);
                            },
                          },
                        ],
                      );
                    }}>
                    <View style={styles.linkLeft}>
                      {isActive ? (
                        <Check size={20} color={colors.primary} />
                      ) : (
                        <View style={styles.compCheckSpacer} />
                      )}
                      <Text style={[styles.linkText, {color: colors.textPrimary}]}>{ev.name}</Text>
                    </View>
                    <Text style={[styles.compModalSub, {color: colors.textSecondary}]}>{ev.competition}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
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
  poolsHint: {
    fontSize: 12,
    lineHeight: 16,
    marginRight: spacing.lg,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
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
  poolMemberCount: {
    fontSize: 13,
    fontWeight: '500',
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
  adminLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  accessBadge: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    marginRight: spacing.xs,
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
  compModalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  compModalCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingBottom: spacing.sm,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  compCheckSpacer: {
    width: 20,
  },
  compModalSub: {
    fontSize: 12,
  },
});
