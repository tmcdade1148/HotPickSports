import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {supabase} from '@shared/config/supabase';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_SECONDS = 60;

export function ForgotPasswordScreen({navigation, route}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const initialEmail: string = route.params?.email ?? '';
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const isValidEmail = EMAIL_REGEX.test(email.trim());

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(c => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSendReset = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setError('');
    setLoading(true);

    const {error: resetError} = await supabase.auth.resetPasswordForEmail(
      trimmedEmail,
      {redirectTo: 'hotpick://auth/reset'},
    );

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSent(true);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Back to Sign In</Text>
        </TouchableOpacity>

        <View style={styles.content}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a password reset link to
          </Text>
          <Text style={styles.email}>{email.trim().toLowerCase()}</Text>
          <Text style={styles.instruction}>
            Follow the link in your email to reset your password, then come
            back here to sign in.
          </Text>

          <TouchableOpacity
            style={[
              styles.resendButton,
              (resendCooldown > 0 || loading) && styles.resendDisabled,
            ]}
            onPress={handleSendReset}
            disabled={resendCooldown > 0 || loading}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.resendText}>
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend email'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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

        <View style={styles.formContent}>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>
            Enter your email and we'll send you a link to reset your password.
          </Text>

          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="Email"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={text => {
              setEmail(text);
              if (error) setError('');
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            autoFocus={!initialEmail}
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={handleSendReset}
            textContentType="emailAddress"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[
              styles.button,
              (!isValidEmail || loading) && styles.buttonDisabled,
            ]}
            onPress={handleSendReset}
            disabled={!isValidEmail || loading}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>
        </View>
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
  backButton: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backText: {
    fontSize: 16,
    color: colors.primary,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  formContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
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
  email: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  instruction: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
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
  inputError: {
    borderColor: colors.error,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    marginTop: spacing.xs,
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
  resendButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  resendDisabled: {
    opacity: 0.5,
  },
  resendText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
});
