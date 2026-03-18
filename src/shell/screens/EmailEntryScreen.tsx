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
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDefaultEvent} from '@sports/registry';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type Mode = 'sign_in' | 'sign_up';

export function EmailEntryScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);

  const setUser = useGlobalStore(s => s.setUser);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const acceptTos = useGlobalStore(s => s.acceptTos);
  const ensureGlobalPoolMembership = useGlobalStore(s => s.ensureGlobalPoolMembership);
  const fetchProfile = useGlobalStore(s => s.fetchProfile);
  const fetchUserPools = useGlobalStore(s => s.fetchUserPools);
  const fetchSmackUnreadCounts = useGlobalStore(s => s.fetchSmackUnreadCounts);
  const subscribeSmackUnread = useGlobalStore(s => s.subscribeSmackUnread);

  const [mode, setMode] = useState<Mode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isValidEmail = EMAIL_REGEX.test(email.trim());
  const isValidPassword = password.length >= MIN_PASSWORD_LENGTH;
  const passwordsMatch = password === confirmPassword;

  const canSubmit =
    mode === 'sign_in'
      ? isValidEmail && password.length > 0
      : isValidEmail && isValidPassword && passwordsMatch;

  const clearError = () => {
    if (error) setError('');
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const trimmedEmail = email.trim().toLowerCase();
    setError('');
    setLoading(true);

    if (mode === 'sign_up') {
      const {data, error: signUpError} = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });

      setLoading(false);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.user) {
        setUser(data.user);
        const defaultEvent = getDefaultEvent();
        setActiveSport(defaultEvent);
        await acceptTos(data.user.id);
        await ensureGlobalPoolMembership();
        navigation.replace('ProfileSetup');
      }
    } else {
      const {data, error: signInError} =
        await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

      setLoading(false);

      if (signInError) {
        if (signInError.message === 'Invalid login credentials') {
          setError('Incorrect email or password.');
        } else {
          setError(signInError.message);
        }
        return;
      }

      if (data.user) {
        setUser(data.user);
        const defaultEvent = getDefaultEvent();
        setActiveSport(defaultEvent);

        await ensureGlobalPoolMembership();
        const profile = await fetchProfile(data.user.id);

        if (!profile || !profile.first_name) {
          navigation.replace('ProfileSetup');
          return;
        }

        // Load pools and select active pool — same logic as LoadingScreen
        await fetchUserPools(data.user.id, defaultEvent.competition);
        const pools = useGlobalStore.getState().userPools;

        if (pools.length > 0) {
          let defaultId: string | null = null;
          let activeId: string | null = null;
          try {
            defaultId = await AsyncStorage.getItem(
              `hotpick_default_pool_${defaultEvent.competition}`,
            );
            activeId = await AsyncStorage.getItem(
              `hotpick_active_pool_${defaultEvent.competition}`,
            );
          } catch {
            // proceed with fallbacks
          }

          const defaultPool = defaultId
            ? pools.find(p => p.id === defaultId)
            : null;
          const activePool = activeId
            ? pools.find(p => p.id === activeId)
            : null;
          const globalPool = pools.find(p => p.is_global);
          const startPoolId =
            defaultPool?.id ?? activePool?.id ?? globalPool?.id ?? pools[0].id;

          setActivePoolId(startPoolId);

          if (defaultId) {
            useGlobalStore
              .getState()
              .loadDefaultPoolId(defaultEvent.competition);
          }

          const poolIds = pools.map(p => p.id);
          await fetchSmackUnreadCounts(data.user.id, poolIds);
        }

        subscribeSmackUnread();
        navigation.replace('Home');
      }
    }
  };

  const toggleMode = () => {
    setMode(m => (m === 'sign_in' ? 'sign_up' : 'sign_in'));
    setError('');
    setConfirmPassword('');
  };

  const handleForgotPassword = () => {
    navigation.navigate('ForgotPassword', {email: email.trim().toLowerCase()});
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>
            {mode === 'sign_in' ? 'Sign in' : 'Create account'}
          </Text>
          <Text style={styles.subtitle}>
            {mode === 'sign_in'
              ? 'Welcome back. Enter your email and password.'
              : 'Enter your email and choose a password.'}
          </Text>

          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="Email"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={text => {
              setEmail(text);
              clearError();
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            autoFocus
            editable={!loading}
            returnKeyType="next"
            textContentType="emailAddress"
          />

          <TextInput
            style={[styles.input, styles.inputSpaced]}
            placeholder="Password"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={text => {
              setPassword(text);
              clearError();
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            returnKeyType={mode === 'sign_up' ? 'next' : 'go'}
            onSubmitEditing={mode === 'sign_in' ? handleSubmit : undefined}
            textContentType={
              mode === 'sign_up' ? 'newPassword' : 'password'
            }
          />

          {mode === 'sign_up' && (
            <TextInput
              style={[styles.input, styles.inputSpaced]}
              placeholder="Confirm password"
              placeholderTextColor={colors.textSecondary}
              value={confirmPassword}
              onChangeText={text => {
                setConfirmPassword(text);
                clearError();
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              textContentType="newPassword"
            />
          )}

          {mode === 'sign_up' && password.length > 0 && !isValidPassword && (
            <Text style={styles.hint}>
              Password must be at least {MIN_PASSWORD_LENGTH} characters.
            </Text>
          )}

          {mode === 'sign_up' &&
            confirmPassword.length > 0 &&
            !passwordsMatch && (
              <Text style={styles.hint}>Passwords do not match.</Text>
            )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[
              styles.button,
              (!canSubmit || loading) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit || loading}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'sign_in' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {mode === 'sign_in' && (
            <TouchableOpacity
              style={styles.forgotButton}
              onPress={handleForgotPassword}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.toggleButton} onPress={toggleMode}>
            <Text style={styles.toggleText}>
              {mode === 'sign_in'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </Text>
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
  inner: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  backButton: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backText: {
    fontSize: 16,
    color: colors.primary,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  inputSpaced: {
    marginTop: spacing.sm,
  },
  inputError: {
    borderColor: colors.error,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  forgotButton: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  forgotText: {
    fontSize: 14,
    color: colors.primary,
  },
  toggleButton: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  toggleText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
