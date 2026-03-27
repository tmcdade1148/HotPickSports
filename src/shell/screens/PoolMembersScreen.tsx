import React, {useEffect, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import {ChevronLeft, Shield, Crown, UserMinus} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useAuth} from '@shared/hooks/useAuth';
import {getDisplayName} from '@shared/utils/displayName';
import {SYSTEM_AVATARS} from '@shell/components/AvatarSelector';
import {spacing, borderRadius} from '@shared/theme';
import type {DbPoolMember, DbProfile} from '@shared/types/database';
import {useTheme} from '@shell/theme';

type MemberWithProfile = DbPoolMember & {profile?: DbProfile};

export function PoolMembersScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const poolId = route.params?.poolId as string;

  const {user} = useAuth();
  const poolMembers = useGlobalStore(s => s.poolMembers);
  const isLoadingMembers = useGlobalStore(s => s.isLoadingMembers);
  const fetchPoolMembers = useGlobalStore(s => s.fetchPoolMembers);
  const removePoolMember = useGlobalStore(s => s.removePoolMember);
  const updateMemberRole = useGlobalStore(s => s.updateMemberRole);
  const poolRoles = useGlobalStore(s => s.poolRoles);

  const myRole = poolRoles[poolId];
  const isOrganizer = myRole === 'organizer';
  const isAdmin = myRole === 'admin';
  const canManage = isOrganizer || isAdmin;

  useEffect(() => {
    if (poolId) {
      fetchPoolMembers(poolId);
    }
  }, [poolId, fetchPoolMembers]);

  const handleMemberAction = useCallback(
    (member: MemberWithProfile) => {
      // No actions on self or on organizer
      if (member.user_id === user?.id) return;
      if (member.role === 'organizer') return;

      // Admin can only remove members, not other admins
      if (isAdmin && member.role === 'admin') return;

      const memberName = getDisplayName(member.profile ?? null);
      const buttons: {text: string; onPress: () => void; style?: 'destructive' | 'cancel'}[] = [];

      // Organizer can promote/demote
      if (isOrganizer) {
        if (member.role === 'member') {
          buttons.push({
            text: 'Promote to Admin',
            onPress: async () => {
              const result = await updateMemberRole(poolId, member.user_id, 'admin');
              if (!result.success) {
                Alert.alert('Error', result.error ?? 'Failed to update role');
              }
            },
          });
        } else if (member.role === 'admin') {
          buttons.push({
            text: 'Demote to Member',
            onPress: async () => {
              const result = await updateMemberRole(poolId, member.user_id, 'member');
              if (!result.success) {
                Alert.alert('Error', result.error ?? 'Failed to update role');
              }
            },
          });
        }
      }

      // Remove (organizer can remove anyone except organizer; admin can remove members only)
      buttons.push({
        text: 'Remove from Pool',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Remove Member',
            `Remove ${memberName} from this pool? They will no longer see pool content.`,
            [
              {text: 'Cancel', style: 'cancel'},
              {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                  const result = await removePoolMember(poolId, member.user_id);
                  if (!result.success) {
                    Alert.alert('Error', result.error ?? 'Failed to remove member');
                  }
                },
              },
            ],
          );
        },
      });

      buttons.push({text: 'Cancel', style: 'cancel', onPress: () => {}});

      Alert.alert(memberName, `Role: ${member.role}`, buttons);
    },
    [poolId, user?.id, isOrganizer, isAdmin, updateMemberRole, removePoolMember],
  );

  const renderMember = ({item}: {item: MemberWithProfile}) => {
    const isMe = item.user_id === user?.id;
    const memberName = getDisplayName(item.profile ?? null);
    const joinDate = new Date(item.joined_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    // Resolve avatar
    const avatarInfo = item.profile?.avatar_key
      ? SYSTEM_AVATARS.find(a => a.key === item.profile?.avatar_key)
      : null;

    const canTap =
      canManage && !isMe && item.role !== 'organizer' && !(isAdmin && item.role === 'admin');

    return (
      <TouchableOpacity
        style={[styles.memberRow, isMe && styles.memberRowMe]}
        onPress={() => canTap && handleMemberAction(item)}
        activeOpacity={canTap ? 0.7 : 1}>
        {/* Avatar */}
        <View
          style={[
            styles.avatar,
            avatarInfo && {backgroundColor: avatarInfo.color},
          ]}>
          {avatarInfo ? (
            <Text style={styles.avatarEmoji}>{avatarInfo.emoji}</Text>
          ) : (
            <Text style={styles.avatarEmoji}>
              {memberName.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>

        {/* Info */}
        <View style={styles.memberInfo}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.memberName, isMe && styles.memberNameMe]}
              numberOfLines={1}>
              {isMe ? `${memberName} (You)` : memberName}
            </Text>
            {item.profile?.first_name && (
              <Text style={styles.realName} numberOfLines={1}>
                {item.profile.first_name}{item.profile.last_name ? ` ${item.profile.last_name.charAt(0).toUpperCase()}.` : ''}
              </Text>
            )}
            {item.role === 'organizer' && (
              <Crown size={14} color={colors.primary} />
            )}
            {item.role === 'admin' && (
              <Shield size={14} color={colors.secondary} />
            )}
          </View>
          <Text style={styles.joinDate}>Joined {joinDate}</Text>
        </View>

        {/* Role badge */}
        <View
          style={[
            styles.roleBadge,
            item.role === 'organizer' && styles.roleBadgeOrganizer,
            item.role === 'admin' && styles.roleBadgeAdmin,
          ]}>
          <Text
            style={[
              styles.roleText,
              item.role === 'organizer' && styles.roleTextOrganizer,
              item.role === 'admin' && styles.roleTextAdmin,
            ]}>
            {item.role.charAt(0).toUpperCase() + item.role.slice(1)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Members</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{poolMembers.length}</Text>
        </View>
      </View>

      {isLoadingMembers ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={[...poolMembers].sort((a, b) => {
            const nameA = (a.profile?.poolie_name || '').toLowerCase();
            const nameB = (b.profile?.poolie_name || '').toLowerCase();
            return nameA.localeCompare(nameB);
          })}
          keyExtractor={item => item.user_id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <UserMinus size={32} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No members found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  countBadge: {
    backgroundColor: colors.primary + '20',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  memberRowMe: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 18,
  },
  memberInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  memberNameMe: {
    color: colors.primary,
    fontWeight: '700',
  },
  realName: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    flexShrink: 1,
  },
  joinDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.border,
  },
  roleBadgeOrganizer: {
    backgroundColor: colors.primary + '15',
  },
  roleBadgeAdmin: {
    backgroundColor: colors.secondary + '15',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  roleTextOrganizer: {
    color: colors.primary,
  },
  roleTextAdmin: {
    color: colors.secondary,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
