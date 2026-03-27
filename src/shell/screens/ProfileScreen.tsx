import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useGlobalStore} from '@shell/stores/globalStore';
import {AvatarSelector, SYSTEM_AVATARS} from '@shell/components/AvatarSelector';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

/**
 * ProfileScreen — Full profile settings per onboarding spec.
 * First name, last name, poolie name, display preference, avatar, email, sign out.
 */
export function ProfileScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const user = useGlobalStore(s => s.user);
  const userProfile = useGlobalStore(s => s.userProfile);
  const updateProfile = useGlobalStore(s => s.updateProfile);
  const signOut = useGlobalStore(s => s.signOut);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [poolieName, setPoolieName] = useState('');
  // display_name_preference always 'poolie_name' — all poolies identified by poolie name
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialized = useRef(false);

  // Initialize form fields from profile
  useEffect(() => {
    if (userProfile) {
      setFirstName(userProfile.first_name ?? '');
      setLastName(userProfile.last_name ?? '');
      setPoolieName(userProfile.poolie_name ?? '');
      // display_name_preference always poolie_name
      setSelectedAvatar(userProfile.avatar_key ?? null);
      // Mark initialized after first load so auto-save doesn't fire on mount
      setTimeout(() => { isInitialized.current = true; }, 100);
    }
  }, [userProfile]);

  const hasChanges =
    firstName.trim() !== (userProfile?.first_name ?? '') ||
    lastName.trim() !== (userProfile?.last_name ?? '') ||
    poolieName.trim() !== (userProfile?.poolie_name ?? '') ||
    selectedAvatar !== (userProfile?.avatar_key ?? null);

  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0 && poolieName.trim().length > 0 && hasChanges && !saving;

  // Auto-save: debounce 1.5s after any field change
  const doAutoSave = useCallback(async () => {
    if (!user?.id || !isInitialized.current) return;
    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) return; // Don't auto-save with empty first name

    const currentHasChanges =
      trimmedFirst !== (userProfile?.first_name ?? '') ||
      lastName.trim() !== (userProfile?.last_name ?? '') ||
      poolieName.trim() !== (userProfile?.poolie_name ?? '') ||
      selectedAvatar !== (userProfile?.avatar_key ?? null);

    if (!currentHasChanges) return;

    setSaving(true);
    const avatarData = selectedAvatar
      ? {avatar_key: selectedAvatar, avatar_type: 'system' as const}
      : {};

    const ok = await updateProfile(user.id, {
      first_name: trimmedFirst,
      last_name: lastName.trim() || null,
      poolie_name: poolieName.trim() || null,
      display_name_preference: 'poolie_name',
      ...avatarData,
    });

    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [firstName, lastName, poolieName, selectedAvatar, user?.id, userProfile, updateProfile]);

  // Trigger auto-save on field changes
  useEffect(() => {
    if (!isInitialized.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(doAutoSave, 1500);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [firstName, lastName, poolieName, selectedAvatar, doAutoSave]);

  const handleAvatarSelect = (avatar: {
    key: string;
    color: string;
    emoji: string;
  }) => {
    setSelectedAvatar(avatar.key);
  };

  const handleUploadPhoto = () => {
    Alert.alert(
      'Coming Soon',
      'Photo upload will be available soon. Choose a system avatar for now!',
    );
  };

  const handleSave = async () => {
    if (!user?.id || !canSave) return;

    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      Alert.alert('Required', 'First name is required.');
      return;
    }

    setSaving(true);

    const avatarData = selectedAvatar
      ? {avatar_key: selectedAvatar, avatar_type: 'system' as const}
      : {};

    const ok = await updateProfile(user.id, {
      first_name: trimmedFirst,
      last_name: lastName.trim() || null,
      poolie_name: poolieName.trim() || null,
      display_name_preference: 'poolie_name',
      ...avatarData,
    });

    setSaving(false);

    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backButton}>{'< Back'}</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Profile</Text>
          </View>

          {/* Avatar */}
          <View style={styles.section}>
            <Text style={styles.label}>Avatar</Text>
            <AvatarSelector
              selectedKey={selectedAvatar}
              onSelect={handleAvatarSelect}
              onUploadPress={handleUploadPhoto}
            />
          </View>

          {/* First name (required) */}
          <View style={styles.section}>
            <Text style={styles.label}>
              First name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Your first name"
              placeholderTextColor={colors.textSecondary}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!saving}
            />
          </View>

          {/* Last name (required) */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Last name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Your last name"
              placeholderTextColor={colors.textSecondary}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!saving}
            />
            <Text style={styles.hint}>
              Full surnames are never displayed publicly. We'll only use the initial.
            </Text>
          </View>

          {/* Poolie name (required) */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Poolie name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder={
                poolieName ? 'Your poolie name' : 'Add your poolie name'
              }
              placeholderTextColor={colors.textSecondary}
              value={poolieName}
              onChangeText={setPoolieName}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />
            <Text style={styles.hint}>
              Pick your Poolie name. This is how you'll be identified in the leaderboard and SmackTalk. Change anytime.
            </Text>
          </View>

          {/* Email (read-only) */}
          <View style={styles.section}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{user?.email ?? ''}</Text>
            </View>
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={!canSave}>
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : saved ? (
              <Text style={styles.saveButtonText}>Saved!</Text>
            ) : (
              <Text style={styles.saveButtonText}>Save changes</Text>
            )}
          </TouchableOpacity>

          {/* Sign out */}
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  backButton: {
    fontSize: 16,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.error,
  },
  optional: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 17,
  },
  readOnlyField: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  readOnlyText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  toggleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.error,
    alignItems: 'center',
  },
  signOutText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
});
