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
  Clipboard,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  User,
  Plus,
  LogOut,
  ChevronRight,
  Users,
  Star,
} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {SYSTEM_AVATARS} from '@shell/components/AvatarSelector';
import {getDisplayName} from '@shared/utils/displayName';
import {colors, spacing, borderRadius} from '@shared/theme';

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const rootNavigation = navigation.getParent();

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

  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const displayName = getDisplayName(userProfile);

  // Resolve avatar emoji for profile card
  const avatarInfo = userProfile?.avatar_key
    ? SYSTEM_AVATARS.find(a => a.key === userProfile.avatar_key)
    : null;

  const handleJoinPool = async () => {
    if (!inviteCode.trim() || !user?.id) return;

    setJoining(true);
    setJoinError('');

    const pool = await joinPool(user.id, inviteCode.trim());

    if (pool) {
      setInviteCode('');
      setActivePoolId(pool.id);
      Alert.alert('Joined!', `You've joined ${pool.name}`);
    } else {
      setJoinError('Invalid invite code or pool is full.');
    }
    setJoining(false);
  };

  const handleCreatePool = () => {
    if (activeSport) {
      rootNavigation?.navigate('CreatePool');
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
          rootNavigation?.reset({index: 0, routes: [{name: 'Welcome'}]});
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      {/* Profile card */}
      <TouchableOpacity
        style={styles.profileCard}
        onPress={() => rootNavigation?.navigate('Profile')}>
        <View style={styles.profileInfo}>
          <View
            style={[
              styles.avatarCircle,
              avatarInfo && {backgroundColor: avatarInfo.color},
            ]}>
            {avatarInfo ? (
              <Text style={styles.avatarEmoji}>{avatarInfo.emoji}</Text>
            ) : (
              <User size={24} color={colors.textSecondary} />
            )}
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
        </View>
        <ChevronRight size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Pools section */}
      <Text style={styles.sectionTitle}>My Pools</Text>

      {userPools.map(pool => (
        <TouchableOpacity
          key={pool.id}
          style={[
            styles.poolRow,
            pool.id === activePoolId && styles.poolRowActive,
          ]}
          onPress={() => setActivePoolId(pool.id)}>
          <View style={styles.poolInfo}>
            <Users
              size={18}
              color={
                pool.id === activePoolId
                  ? colors.primary
                  : colors.textSecondary
              }
            />
            <View style={styles.poolNameCol}>
              <View style={styles.poolNameRow}>
                <Text
                  style={[
                    styles.poolName,
                    pool.id === activePoolId && styles.poolNameActive,
                  ]}
                  numberOfLines={1}>
                  {pool.name}
                </Text>
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
                      <Text style={styles.inviteCode}>
                        {pool.invite_code}
                      </Text>
                    </TouchableOpacity>
                  )}
              </View>
              {pool.is_global ? (
                <Text style={styles.globalBadge}>Global pool</Text>
              ) : poolRoles[pool.id] ? (
                <Text style={styles.roleBadge}>
                  {poolRoles[pool.id].charAt(0).toUpperCase() +
                    poolRoles[pool.id].slice(1)}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.poolActions}>
            {pool.id === activePoolId && (
              <Text style={styles.activeLabel}>Active</Text>
            )}
            <TouchableOpacity
              onPress={() => setDefaultPoolId(pool.id)}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Star
                size={18}
                color={
                  pool.id === defaultPoolId
                    ? colors.primary
                    : colors.textSecondary
                }
                fill={pool.id === defaultPoolId ? colors.primary : 'none'}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      ))}

      {/* Join pool */}
      <View style={styles.joinSection}>
        <Text style={styles.joinLabel}>Have an invite code?</Text>
        <View style={styles.codeRow}>
          <TextInput
            style={styles.codeInput}
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
          <Text style={styles.codeError}>{joinError}</Text>
        ) : null}
      </View>

      {/* Create pool */}
      <TouchableOpacity
        style={styles.createPoolButton}
        onPress={handleCreatePool}>
        <Plus size={18} color={colors.primary} />
        <Text style={styles.createPoolText}>Create a pool</Text>
      </TouchableOpacity>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <LogOut size={18} color={colors.error} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
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
    backgroundColor: colors.border,
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
    color: colors.text,
  },
  profileEmail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  poolRowActive: {
    borderWidth: 1,
    borderColor: colors.primary,
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
  poolNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  poolName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    flexShrink: 1,
  },
  inviteCode: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    letterSpacing: 1,
    overflow: 'hidden',
  },
  poolNameActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  poolActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  globalBadge: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  roleBadge: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  joinSection: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  joinLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  codeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    letterSpacing: 2,
    fontWeight: '600',
  },
  joinButton: {
    backgroundColor: colors.primary,
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
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  createPoolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  createPoolText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.error,
  },
  signOutText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
});
