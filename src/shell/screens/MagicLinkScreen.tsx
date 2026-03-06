import React, {useEffect, useState, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {colors, spacing, borderRadius} from '@shared/theme';

const RESEND_COOLDOWN_SECONDS = 60;

export function MagicLinkScreen({navigation, route}: any) {
  const email: string = route.params?.email ?? '';
  const setUser = useGlobalStore(s => s.setUser);
  const fetchProfile = useGlobalStore(s => s.fetchProfile);
  const acceptTos = useGlobalStore(s => s.acceptTos);

  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const didNavigate = useRef(false);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(c => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Listen for auth state change — auto-advance when magic link is tapped
  useEffect(() => {
    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user && !didNavigate.current) {
        didNavigate.current = true;
        setAuthenticated(true);
        setUser(session.user);

        // Accept TOS
        await acceptTos(session.user.id);

        // Fetch profile to determine next screen
        const profile = await fetchProfile(session.user.id);

        if (!profile || !profile.first_name) {
          navigation.replace('ProfileSetup');
        } else {
          navigation.replace('Home');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigation, setUser, fetchProfile, acceptTos]);

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);

    await supabase.auth.signInWithOtp({email});

    setResending(false);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  };

  if (authenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Setting up your account...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{'<MAIL>'}</Text>
        </View>

        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a magic link to
        </Text>
        <Text style={styles.email}>{email}</Text>
        <Text style={styles.instruction}>
          Tap the link in your email to sign in. It may take a moment to arrive.
        </Text>

        <TouchableOpacity
          style={[
            styles.resendButton,
            (resendCooldown > 0 || resending) && styles.resendDisabled,
          ]}
          onPress={handleResend}
          disabled={resendCooldown > 0 || resending}>
          {resending ? (
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  icon: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  email: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
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
  loadingText: {
    marginTop: spacing.md,
    fontSize: 16,
    color: colors.textSecondary,
  },
});
