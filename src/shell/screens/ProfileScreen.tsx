import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {colors, spacing, borderRadius} from '@shared/theme';

/**
 * ProfileScreen — View/edit display name + sign out.
 * Accessible from the profile icon in the pool switcher header.
 */
export function ProfileScreen({navigation}: any) {
  const user = useGlobalStore(s => s.user);
  const displayName = useGlobalStore(s => s.displayName);
  const updateDisplayName = useGlobalStore(s => s.updateDisplayName);
  const signOut = useGlobalStore(s => s.signOut);

  const [name, setName] = useState(displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasChanges = name.trim() !== (displayName ?? '');

  const handleSave = async () => {
    if (!user?.id || !hasChanges) {
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      Alert.alert('Too Short', 'Display name must be at least 2 characters.');
      return;
    }
    if (trimmed.length > 24) {
      Alert.alert('Too Long', 'Display name must be 24 characters or less.');
      return;
    }

    setSaving(true);
    const ok = await updateDisplayName(user.id, trimmed);
    setSaving(false);

    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      Alert.alert('Error', 'Failed to update display name. Please try again.');
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
          navigation.reset({index: 0, routes: [{name: 'SignIn'}]});
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Profile</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.readOnlyField}>
            <Text style={styles.readOnlyText}>{user?.email ?? ''}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            maxLength={24}
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            This name is visible to other players in your pools.
          </Text>

          <TouchableOpacity
            style={[
              styles.saveButton,
              (!hasChanges || saving) && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasChanges || saving}>
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : saved ? (
              <Text style={styles.saveButtonText}>Saved!</Text>
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.spacer} />

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
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
    padding: spacing.lg,
    paddingTop: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  saveButton: {
    backgroundColor: colors.primary,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  spacer: {
    flex: 1,
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
