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
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {supabase} from '@shared/config/supabase';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isValid =
    password.length >= MIN_PASSWORD_LENGTH && password === confirm;

  const handleReset = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setLoading(true);

    const {error: updateError} = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    Alert.alert(
      'Password Updated',
      'Your password has been reset. You can now sign in with your new password.',
      [{text: 'OK', onPress: () => navigation.replace('Welcome')}],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.formContent}>
          <Text style={styles.title}>Set new password</Text>
          <Text style={styles.subtitle}>
            Enter your new password below. Must be at least{' '}
            {MIN_PASSWORD_LENGTH} characters.
          </Text>

          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="New password"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={text => {
              setPassword(text);
              if (error) setError('');
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            editable={!loading}
            textContentType="newPassword"
          />

          <TextInput
            style={[
              styles.input,
              styles.inputSpaced,
              error && confirm.length > 0 ? styles.inputError : null,
            ]}
            placeholder="Confirm new password"
            placeholderTextColor={colors.textSecondary}
            value={confirm}
            onChangeText={text => {
              setConfirm(text);
              if (error) setError('');
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={handleReset}
            textContentType="newPassword"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[
              styles.button,
              (!isValid || loading) && styles.buttonDisabled,
            ]}
            onPress={handleReset}
            disabled={!isValid || loading}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Reset Password</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    inner: {
      flex: 1,
    },
    formContent: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xxl,
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
  });
