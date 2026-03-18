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

export function WelcomeScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const [loading, setLoading] = useState<string | null>(null);

  const handleApple = () => {
    // Apple Sign In requires @invertase/react-native-apple-authentication + Xcode config
    Alert.alert(
      'Coming Soon',
      'Apple Sign In will be available at launch. Use email for now.',
    );
  };

  const handleGoogle = () => {
    // Google Sign In requires @react-native-google-signin/google-signin + Cloud Console config
    Alert.alert(
      'Coming Soon',
      'Google Sign In will be available at launch. Use email for now.',
    );
  };

  const handleEmail = () => {
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
          Make your picks. Win bragging rights.
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

        {/* TOS */}
        <Text style={styles.tosText}>
          By continuing you agree to our{' '}
          <Text style={styles.tosLink}>Terms of Service</Text> and{' '}
          <Text
            style={styles.tosLink}
            onPress={() => navigation.navigate('PrivacyPolicy')}>
            Privacy Policy
          </Text>
        </Text>
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
  tosText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
  },
  tosLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
