import React, {useState} from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';
import {signInWithApple, signInWithGoogle} from '@shell/services/socialAuth';
import {runPostAuthFlow} from '@shell/services/postAuthFlow';

export function WelcomeScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const [loading, setLoading] = useState<string | null>(null);
  const [tosAccepted, setTosAccepted] = useState(false);

  const requireTos = () => {
    if (!tosAccepted) {
      Alert.alert(
        'Terms Required',
        'Please agree to the Terms of Service and Privacy Policy to continue.',
      );
      return false;
    }
    return true;
  };

  const handleApple = async () => {
    if (!requireTos()) return;
    setLoading('apple');
    try {
      const {user, providerName} = await signInWithApple();
      await runPostAuthFlow({user, navigation, providerName});
    } catch (err: any) {
      // User cancelled — Apple throws error code 1001
      if (err?.code === '1001' || err?.message?.includes('canceled')) {
        // silently ignore cancel
      } else {
        Alert.alert('Sign In Failed', err?.message ?? 'Something went wrong.');
      }
    } finally {
      setLoading(null);
    }
  };

  const handleGoogle = async () => {
    if (!requireTos()) return;
    setLoading('google');
    try {
      const {user, providerName} = await signInWithGoogle();
      await runPostAuthFlow({user, navigation, providerName});
    } catch (err: any) {
      // User cancelled — Google throws statusCode 12501
      if (
        err?.code === 'SIGN_IN_CANCELLED' ||
        err?.code === '12501' ||
        err?.message?.includes('canceled')
      ) {
        // silently ignore cancel
      } else {
        Alert.alert('Sign In Failed', err?.message ?? 'Something went wrong.');
      }
    } finally {
      setLoading(null);
    }
  };

  const handleEmail = () => {
    if (!requireTos()) return;
    navigation.navigate('EmailEntry');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../../../assets/hotpick-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.tagline}>
          Your Picks. On the Record.
        </Text>

        {/* Auth buttons */}
        <View style={styles.buttonsContainer}>
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[styles.authButton, styles.appleButton]}
              onPress={handleApple}
              disabled={loading !== null}>
              {loading === 'apple' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.authButtonText, styles.appleButtonText]}>
                  Continue with Apple
                </Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.authButton, styles.googleButton]}
            onPress={handleGoogle}
            disabled={loading !== null}>
            {loading === 'google' ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={[styles.authButtonText, styles.googleButtonText]}>
                Continue with Google
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.authButton, styles.emailButton]}
            onPress={handleEmail}
            disabled={loading !== null}>
            <Text style={[styles.authButtonText, styles.emailButtonText]}>
              Continue with Email
            </Text>
          </TouchableOpacity>
        </View>

        {/* TOS checkbox */}
        <TouchableOpacity
          style={styles.tosRow}
          onPress={() => setTosAccepted(!tosAccepted)}
          activeOpacity={0.7}>
          <View style={[
            styles.checkbox,
            {borderColor: tosAccepted ? colors.primary : colors.textSecondary},
            tosAccepted && {backgroundColor: colors.primary},
          ]}>
            {tosAccepted && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.tosText}>
            I agree to the{' '}
            <Text
              style={styles.tosLink}
              onPress={() => navigation.navigate('TermsOfService')}>
              Terms of Service
            </Text> and{' '}
            <Text
              style={styles.tosLink}
              onPress={() => navigation.navigate('PrivacyPolicy')}>
              Privacy Policy
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: '10%',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  logo: {
    width: 320,
    height: 320,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '700',
    fontStyle: 'italic',
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
    textAlign: 'center',
  },
  buttonsContainer: {
    width: '100%',
    gap: spacing.sm,
  },
  authButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  appleButton: {
    backgroundColor: '#000000',
  },
  appleButtonText: {
    color: '#FFFFFF',
  },
  googleButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleButtonText: {
    color: colors.textPrimary,
  },
  emailButton: {
    backgroundColor: colors.primary,
  },
  emailButtonText: {
    color: '#FFFFFF',
  },
  authButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tosRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  tosText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    flex: 1,
  },
  tosLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
