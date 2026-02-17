/**
 * Sign In screen — email/password auth wired to Supabase.
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
import { signIn } from '../../shared/services/auth';
import { track, Events } from '../../shared/services/analytics';
import theme from '../../shared/theme';
import { strings } from '../../shared/i18n';
import type { RootStackParamList } from '../navigation/RootNavigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

export function SignInScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      await signIn({ email: email.trim(), password });
      track({ event: Events.SIGN_IN });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      Alert.alert('Sign In Error', message);
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
        <Text style={styles.title}>{strings.app.name}</Text>
        <Text style={styles.tagline}>{strings.app.tagline}</Text>

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
          autoComplete="password"
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? strings.auth.signingIn : strings.auth.signIn}
          </Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.link}>
            {strings.auth.noAccount}{' '}
            <Text style={styles.linkBold}>{strings.auth.signUp}</Text>
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
    marginBottom: theme.spacing.xs,
  },
  tagline: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xxl,
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
