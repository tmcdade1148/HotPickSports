import React, {useEffect, useState} from 'react';
import {Text, TextInput} from '@shared/components/AppText';
import {
  View,
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
import {leagueWelcomeCopy} from '@shared/copy/leagueWelcome';
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
 * Collects the same identity fields as Settings → Profile so every account
 * (email signup or OAuth) has a complete profile from the start:
 *   - First name + Last name (both required). Pre-filled from the profile when
 *     the OAuth provider supplied them (socialAuth.ts writes Apple's first-auth
 *     name / Google's name); empty for email signups. The user confirms/edits.
 *   - Player Name field (required) with live availability check.
 *   - Avatar selection (required, system avatar pre-selected).
 *   - CTA: "Let's Go" — writes first/last name, poolie_name, and avatar.
 *
 * We never prompt for email here. Last name is stored but only the initial is
 * shown publicly (matches the note in Settings → Profile).
 */
export function ProfileSetupScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const user = useGlobalStore(s => s.user);
  const userProfile = useGlobalStore(s => s.userProfile);
  const managedClub = useGlobalStore(s => s.managedClub);
  const updateProfile = useGlobalStore(s => s.updateProfile);

  // League board members (Chairman/Director) get their League welcome here,
  // folded into onboarding — they don't see the separate player PoolWelcome.
  const leagueWelcome = leagueWelcomeCopy(managedClub?.role);

  // Pre-fill from the profile — OAuth (Apple first-auth / Google) writes
  // first/last name via socialAuth.ts before this screen; email signups arrive
  // empty. Either way the user confirms/edits here. Both are required.
  const [firstName, setFirstName] = useState(userProfile?.first_name?.trim() ?? '');
  const [lastName, setLastName] = useState(userProfile?.last_name?.trim() ?? '');
  const [poolieName, setPoolieName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>(
    SYSTEM_AVATARS[0].key,
  );
  const [saving, setSaving] = useState(false);

  // Profile may resolve after first render; backfill empty fields without
  // clobbering anything the user has already typed.
  useEffect(() => {
    if (userProfile?.first_name && !firstName) setFirstName(userProfile.first_name.trim());
    if (userProfile?.last_name && !lastName) setLastName(userProfile.last_name.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.first_name, userProfile?.last_name]);

  const validation = usePoolieNameValidator(poolieName);
  const poolieError = poolieNameErrorMessage(validation);

  const canSubmit =
    !saving &&
    validation.state === 'available' &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0;

  const handleSubmit = async () => {
    if (!user?.id || !canSubmit) return;
    setSaving(true);

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const ok = await updateProfile(user.id, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
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
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}>
          {/* Greeting */}
          <Text style={styles.greeting}>Welcome!</Text>
          {leagueWelcome ? (
            <Text style={styles.leagueWelcome}>{leagueWelcome}</Text>
          ) : null}
          <Text style={styles.subtext}>
            Set up your profile by filling in your name and your Player Name.
          </Text>

          {/* Avatar selection — first, matching Settings → Profile. Default is
              already chosen (SYSTEM_AVATARS[0]). */}
          <View style={styles.section}>
            <Text style={styles.label}>Pick your avatar</Text>
            <AvatarSelector
              selectedKey={selectedAvatar}
              onSelect={avatar => setSelectedAvatar(avatar.key)}
            />
            <Text style={styles.hint}>
              We'll have more avatars to choose from soon. Please stay tuned.
            </Text>
          </View>

          {/* First name (required) — pre-filled from the OAuth provider when available */}
          <View style={styles.section}>
            <Text style={styles.label}>
              First name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="First name"
              placeholderTextColor={colors.textSecondary}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!saving}
            />
          </View>

          {/* Last name (required) — stored, but only the initial is shown publicly */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Last name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Last name"
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
              Choose your Player Name <Text style={styles.required}>*</Text>
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
                Shown on the Ladder and in Chirps. You can change it later.
              </Text>
            )}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}>
            {saving ? (
              <ActivityIndicator color={colors.onPrimary} />
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
  leagueWelcome: {
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    lineHeight: 22,
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
    color: colors.success,
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
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
