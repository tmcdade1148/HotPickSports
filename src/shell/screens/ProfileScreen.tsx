import React, {useState, useEffect} from 'react';
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
import {colors, spacing, borderRadius} from '@shared/theme';

/**
 * ProfileScreen — Full profile settings per onboarding spec.
 * First name, last name, poolie name, display preference, avatar, email, sign out.
 */
export function ProfileScreen({navigation}: any) {
  const user = useGlobalStore(s => s.user);
  const userProfile = useGlobalStore(s => s.userProfile);
  const updateProfile = useGlobalStore(s => s.updateProfile);
  const signOut = useGlobalStore(s => s.signOut);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [poolieName, setPoolieName] = useState('');
  const [displayPref, setDisplayPref] = useState<'first_name' | 'poolie_name'>(
    'first_name',
  );
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Initialize form fields from profile
  useEffect(() => {
    if (userProfile) {
      setFirstName(userProfile.first_name ?? '');
      setLastName(userProfile.last_name ?? '');
      setPoolieName(userProfile.poolie_name ?? '');
      setDisplayPref(userProfile.display_name_preference ?? 'first_name');
      setSelectedAvatar(userProfile.avatar_key ?? null);
    }
  }, [userProfile]);

  const hasChanges =
    firstName.trim() !== (userProfile?.first_name ?? '') ||
    lastName.trim() !== (userProfile?.last_name ?? '') ||
    poolieName.trim() !== (userProfile?.poolie_name ?? '') ||
    displayPref !== (userProfile?.display_name_preference ?? 'first_name') ||
    selectedAvatar !== (userProfile?.avatar_key ?? null);

  const canSave = firstName.trim().length > 0 && hasChanges && !saving;

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
      display_name_preference: displayPref,
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

          {/* Last name (optional) */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Last name</Text>
              <Text style={styles.optional}>Optional</Text>
            </View>
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
              Shown as "Tom M." — never your full surname.
            </Text>
          </View>

          {/* Poolie name (optional) */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Poolie name</Text>
              <Text style={styles.optional}>Optional</Text>
            </View>
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
              Your persona in the pool. Fun names welcome. Change anytime.
            </Text>
          </View>

          {/* Display preference toggle */}
          {poolieName.trim().length > 0 && (
            <View style={styles.section}>
              <Text style={styles.label}>Show me as</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[
                    styles.toggleOption,
                    displayPref === 'first_name' && styles.toggleActive,
                  ]}
                  onPress={() => setDisplayPref('first_name')}
                  disabled={saving}>
                  <Text
                    style={[
                      styles.toggleText,
                      displayPref === 'first_name' && styles.toggleTextActive,
                    ]}>
                    {firstName.trim() || 'First name'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleOption,
                    displayPref === 'poolie_name' && styles.toggleActive,
                  ]}
                  onPress={() => setDisplayPref('poolie_name')}
                  disabled={saving}>
                  <Text
                    style={[
                      styles.toggleText,
                      displayPref === 'poolie_name' && styles.toggleTextActive,
                    ]}>
                    {poolieName.trim() || 'Poolie name'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

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

const styles = StyleSheet.create({
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
    color: colors.text,
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
    color: colors.text,
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
    color: colors.text,
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
