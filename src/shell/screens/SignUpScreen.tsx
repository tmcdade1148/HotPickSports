/**
 * Sign Up screen — full name + poolie name per onboarding spec.
 */
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { signUp, isPoolieNameTaken } from '../../shared/services/auth';
import { track, Events } from '../../shared/services/analytics';
import theme from '../../shared/theme';
import { strings } from '../../shared/i18n';
import type { RootStackParamList } from '../navigation/RootNavigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SignUp'>;

export function SignUpScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [poolieName, setPoolieName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!email.trim() || !password || !fullName.trim() || !poolieName.trim()) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      // Check poolie name availability
      const taken = await isPoolieNameTaken(poolieName.trim());
      if (taken) {
        Alert.alert('Name taken', 'That poolie name is already in use. Try another one.');
        setLoading(false);
        return;
      }

      await signUp({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        poolieName: poolieName.trim(),
      });

      track({ event: Events.SIGN_UP });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      Alert.alert('Sign Up Error', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{strings.auth.signUp}</Text>

        <TextInput
          style={styles.input}
          placeholder={strings.auth.fullName}
          placeholderTextColor={theme.colors.textMuted}
          value={fullName}
          onChangeText={setFullName}
          autoComplete="name"
        />

        <TextInput
          style={styles.input}
          placeholder={strings.auth.poolieName}
          placeholderTextColor={theme.colors.textMuted}
          value={poolieName}
          onChangeText={setPoolieName}
          autoCapitalize="none"
          autoComplete="off"
        />
        <Text style={styles.hint}>{strings.auth.poolieNameHint}</Text>

        <TextInput
          style={styles.input}
          placeholder={strings.auth.email}
          placeholderTextColor={theme.colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <TextInput
          style={styles.input}
          placeholder={strings.auth.password}
          placeholderTextColor={theme.colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? strings.auth.signingUp : strings.auth.signUp}
          </Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('SignIn')}>
          <Text style={styles.link}>
            {strings.auth.hasAccount}{' '}
            <Text style={styles.linkBold}>{strings.auth.signIn}</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.size.title,
    fontWeight: 'bold',
    color: theme.colors.primary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    fontSize: theme.typography.size.md,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  hint: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textMuted,
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: theme.typography.size.lg,
    fontWeight: '600',
    color: theme.colors.textInverse,
  },
  link: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  linkBold: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
});
