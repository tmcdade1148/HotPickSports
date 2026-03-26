import React, {useState, useRef, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useGlobalStore} from '@shell/stores/globalStore';
import {AvatarSelector, SYSTEM_AVATARS} from '@shell/components/AvatarSelector';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

export function ProfileSetupScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const user = useGlobalStore(s => s.user);
  const updateProfile = useGlobalStore(s => s.updateProfile);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [poolieName, setPoolieName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [firstNameError, setFirstNameError] = useState('');
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSubmit = firstName.trim().length > 0 && !saving;

  // Autosave on field blur — saves whatever is filled so far
  const autosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      const trimmedFirst = firstName.trim();
      if (!trimmedFirst || !user?.id) return;
      await updateProfile(user.id, {
        first_name: trimmedFirst,
        last_name: lastName.trim() || null,
        poolie_name: poolieName.trim() || null,
      });
    }, 800);
  }, [firstName, lastName, poolieName, user?.id, updateProfile]);

  const handleAvatarSelect = (avatar: {
    key: string;
    color: string;
    emoji: string;
  }) => {
    setSelectedAvatar(avatar.key);
  };

  const handleUploadPhoto = () => {
    // Photo upload requires react-native-image-picker — deferred until dependency is added
    Alert.alert(
      'Coming Soon',
      'Photo upload will be available soon. Choose a system avatar for now!',
    );
  };

  const handleSubmit = async () => {
    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      setFirstNameError('First name is required.');
      return;
    }
    if (!user?.id) return;

    setFirstNameError('');
    setSaving(true);

    // Auto-detect timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Determine avatar fields
    const avatarData = selectedAvatar
      ? {
          avatar_key: selectedAvatar,
          avatar_type: 'system' as const,
        }
      : {
          // Auto-assign first system avatar as default
          avatar_key: SYSTEM_AVATARS[0].key,
          avatar_type: 'system' as const,
        };

    const ok = await updateProfile(user.id, {
      first_name: trimmedFirst,
      last_name: lastName.trim() || null,
      poolie_name: poolieName.trim() || null,
      timezone,
      ...avatarData,
    });

    setSaving(false);

    if (ok) {
      navigation.replace('PushNotification');
    } else {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Let's set up your profile</Text>

          {/* Avatar selector */}
          <View style={styles.section}>
            <Text style={styles.label}>Choose your avatar</Text>
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
              style={[
                styles.input,
                firstNameError ? styles.inputError : null,
              ]}
              placeholder="Your first name"
              placeholderTextColor={colors.textSecondary}
              value={firstName}
              onChangeText={text => {
                setFirstName(text);
                if (firstNameError) setFirstNameError('');
              }}
              onBlur={autosave}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!saving}
            />
            {firstNameError ? (
              <Text style={styles.error}>{firstNameError}</Text>
            ) : null}
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
              onBlur={autosave}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!saving}
            />
            <Text style={styles.hint}>
              Helps your poolies know who's behind the name. Only shown as "Tom
              M." — never your full surname.
            </Text>
          </View>

          {/* Poolie name (optional) */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>What should your pool call you?</Text>
              <Text style={styles.optional}>Optional</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Your poolie name"
              placeholderTextColor={colors.textSecondary}
              value={poolieName}
              onChangeText={setPoolieName}
              onBlur={autosave}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />
            <Text style={styles.hint}>
              This is your persona in the pool. Fun names welcome. You can
              change it anytime.
            </Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}>
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Let's go</Text>
            )}
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
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  section: {
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
  inputError: {
    borderColor: colors.error,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 17,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
