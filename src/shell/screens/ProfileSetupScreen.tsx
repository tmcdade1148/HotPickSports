import React, {useState} from 'react';
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
import {
  usePoolieNameValidator,
  poolieNameErrorMessage,
} from '@shell/hooks/usePoolieNameValidator';

/**
 * ProfileSetupScreen — Welcome screen shown when profiles.poolie_name is
 * missing (OAuth Onboarding Spec §4).
 *
 * Shape per spec §4.2:
 *   - Greeting: "Welcome, {first_name}." — read from profile. The user
 *     does not type their name here. For OAuth users, first_name has
 *     already been written to profiles by socialAuth.ts.
 *   - Poolie Name field (required) with live availability check.
 *   - Avatar selection (required, system avatar pre-selected).
 *   - CTA: "Let's Go" — writes poolie_name and avatar to profiles.
 *
 * Edge case (spec §2.3 red flag): if Apple returned nil fullName on
 * first auth AND no first_name exists on profile (rare — user dismissed
 * the share-name prompt), we fall back to asking for first name here.
 * We never prompt for email.
 *
 * First / last name editing lives in Settings → Account, not here.
 */
export function ProfileSetupScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const user = useGlobalStore(s => s.user);
  const userProfile = useGlobalStore(s => s.userProfile);
  const updateProfile = useGlobalStore(s => s.updateProfile);

  const profileFirstName = userProfile?.first_name?.trim() ?? '';
  const needsFirstNameFallback = profileFirstName.length === 0;

  const [firstNameFallback, setFirstNameFallback] = useState('');
  const [poolieName, setPoolieName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>(
    SYSTEM_AVATARS[0].key,
  );
  const [saving, setSaving] = useState(false);

  const validation = usePoolieNameValidator(poolieName);
  const poolieError = poolieNameErrorMessage(validation);

  const effectiveFirstName = needsFirstNameFallback
    ? firstNameFallback.trim()
    : profileFirstName;

  const canSubmit =
    !saving &&
    validation.state === 'available' &&
    effectiveFirstName.length > 0;

  const handleSubmit = async () => {
    if (!user?.id || !canSubmit) return;
    setSaving(true);

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const ok = await updateProfile(user.id, {
      // Only write first_name when we collected it here (fallback path).
      // Otherwise preserve what socialAuth.ts wrote.
      ...(needsFirstNameFallback ? {first_name: effectiveFirstName} : {}),
      poolie_name: poolieName.trim(),
      avatar_key: selectedAvatar,
      avatar_type: 'system' as const,
      timezone,
    });

    setSaving(false);

    if (ok) {
      navigation.replace('PushNotification');
    } else {
      // Most likely cause: unique index race (someone else took the name
      // between availability check and write). Re-prompt.
      Alert.alert(
        'Try a different name',
        'That name was just taken. Pick another and try again.',
      );
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
          {/* Greeting */}
          <Text style={styles.greeting}>
            {needsFirstNameFallback ? 'Welcome.' : `Welcome, ${profileFirstName}.`}
          </Text>
          <Text style={styles.subtext}>
            Choose your Poolie Name and pick an avatar to get started.
          </Text>

          {/* First-name fallback — only shown when Apple returned nil fullName */}
          {needsFirstNameFallback ? (
            <View style={styles.section}>
              <Text style={styles.label}>
                What should we call you? <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="First name"
                placeholderTextColor={colors.textSecondary}
                value={firstNameFallback}
                onChangeText={setFirstNameFallback}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!saving}
              />
            </View>
          ) : null}

          {/* Poolie name (required) */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Choose your Poolie Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, poolieError ? styles.inputError : null]}
              placeholder="Something your group will recognize"
              placeholderTextColor={colors.textSecondary}
              value={poolieName}
              onChangeText={setPoolieName}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              editable={!saving}
            />
            {validation.state === 'checking' ? (
              <Text style={styles.hint}>Checking availability…</Text>
            ) : validation.state === 'available' && poolieName.trim().length > 0 ? (
              <Text style={styles.available}>That name is available.</Text>
            ) : poolieError ? (
              <Text style={styles.error}>{poolieError}</Text>
            ) : (
              <Text style={styles.hint}>
                Shown on leaderboards and SmackTalk. You can change it later.
              </Text>
            )}
          </View>

          {/* Avatar selection — default already chosen */}
          <View style={styles.section}>
            <Text style={styles.label}>Pick your avatar</Text>
            <AvatarSelector
              selectedKey={selectedAvatar}
              onSelect={avatar => setSelectedAvatar(avatar.key)}
            />
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}>
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Let's Go</Text>
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
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtext: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 21,
  },
  section: {
    marginBottom: spacing.lg,
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
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 17,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  available: {
    color: colors.success ?? '#1DC24C',
    fontSize: 13,
    marginTop: spacing.xs,
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
