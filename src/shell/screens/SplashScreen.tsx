/**
 * Animated splash screen — plays once on every cold launch.
 *
 * Two-layer architecture:
 * - Layer 1 (native): static splash shown by react-native-bootsplash while JS loads
 * - Layer 2 (this component): JS animation that takes over once JS is ready
 *
 * The native splash must visually match frame 0 of this animation (centered logo
 * on #0A0F1E background) so the handoff is seamless.
 *
 * Partner hook: reads isBranded from useBrand(). At NFL Season 2 launch,
 * isBranded is always false — partner block never renders. When Branch.io
 * ships and a partner pool is activated, the partner block becomes visible
 * with zero code changes.
 *
 * Animation sequence (~1,750ms non-branded, ~2,250ms branded):
 * 1. Logo spring-in (0ms, 600ms)
 * 2. Wordmark slide-up (400ms delay, 300ms)
 * 3. Hold (350ms)
 * 4a. Partner block fade-in (1050ms, 300ms) — branded only
 * 4b. Partner hold (200ms) — branded only
 * 5. Screen fade-out (300ms) → onComplete()
 */

import React, {useEffect} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import {useBrand} from '@shell/theme';

// ── Timing constants (ms) ──────────────────────────────────────
const T = {
  LOGO_DURATION: 600,
  WORDMARK_DELAY: 400,
  WORDMARK_DURATION: 300,
  HOLD: 350,
  PARTNER_DELAY: 1050, // wordmarkDelay + wordmarkDuration + hold
  PARTNER_DURATION: 300,
  PARTNER_HOLD: 200,
  EXIT_DELAY_DEFAULT: 1050, // PARTNER_DELAY (no partner block)
  EXIT_DELAY_BRANDED: 1550, // PARTNER_DELAY + PARTNER_DURATION + PARTNER_HOLD
  EXIT_DURATION: 300,
} as const;

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({onComplete}: SplashScreenProps) {
  const {isBranded, partnerName, logo} = useBrand();
  const logoUrl = logo?.mark || logo?.full || '';

  // Logo
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.85);

  // Wordmark
  const wordmarkOpacity = useSharedValue(0);
  const wordmarkTranslateY = useSharedValue(8);

  // Partner block (isBranded only)
  const partnerOpacity = useSharedValue(0);

  // Screen exit
  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    // Step 1: Logo spring-in
    logoOpacity.value = withTiming(1, {duration: T.LOGO_DURATION});
    logoScale.value = withSpring(1, {damping: 14, stiffness: 120});

    // Step 2: Wordmark slide-up
    wordmarkOpacity.value = withDelay(
      T.WORDMARK_DELAY,
      withTiming(1, {duration: T.WORDMARK_DURATION}),
    );
    wordmarkTranslateY.value = withDelay(
      T.WORDMARK_DELAY,
      withTiming(0, {
        duration: T.WORDMARK_DURATION,
        easing: Easing.out(Easing.quad),
      }),
    );

    // Step 4a: Partner block (only if branded)
    if (isBranded) {
      partnerOpacity.value = withDelay(
        T.PARTNER_DELAY,
        withTiming(1, {duration: T.PARTNER_DURATION}),
      );
    }

    // Step 5: Screen exit
    const exitDelay = isBranded
      ? T.EXIT_DELAY_BRANDED
      : T.EXIT_DELAY_DEFAULT;

    screenOpacity.value = withDelay(
      exitDelay,
      withTiming(0, {duration: T.EXIT_DURATION}, finished => {
        if (finished) {
          runOnJS(onComplete)();
        }
      }),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Animated styles ──────────────────────────────────────────

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{scale: logoScale.value}],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{translateY: wordmarkTranslateY.value}],
  }));

  const partnerStyle = useAnimatedStyle(() => ({
    opacity: partnerOpacity.value,
  }));

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, screenStyle]}>
      <View style={styles.centerBlock}>
        {/* Logo — replace with Image when asset is ready */}
        <Animated.View style={[styles.logoContainer, logoStyle]}>
          <Text style={styles.logoText}>🔥</Text>
        </Animated.View>

        {/* Wordmark */}
        <Animated.View style={[styles.wordmarkContainer, wordmarkStyle]}>
          <Text style={styles.wordmarkPrimary}>HotPick</Text>
          <Text style={styles.wordmarkSecondary}>Sports</Text>
        </Animated.View>

        {/* Partner block — future use, no-op at launch */}
        {isBranded && (
          <Animated.View style={[styles.partnerBlock, partnerStyle]}>
            {logoUrl ? (
              <Animated.Image
                source={{uri: logoUrl}}
                style={styles.partnerLogo}
                resizeMode="contain"
              />
            ) : (
              <Text style={styles.partnerName}>{partnerName}</Text>
            )}
          </Animated.View>
        )}
      </View>

      {/* Powered by — only shown in branded pools */}
      {isBranded && (
        <Animated.Text style={[styles.poweredBy, partnerStyle]}>
          Powered by HotPick™ Sports
        </Animated.Text>
      )}
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────
// Background #0A0F1E is hardcoded to match the native splash exactly.
// This is a spec-defined exception to the theme system rule (CLAUDE.md Rule 1).
// Changing this value without updating the native splash asset will cause
// a visible flash on the native→JS handoff.

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 72,
  },
  wordmarkContainer: {
    alignItems: 'center',
  },
  wordmarkPrimary: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  wordmarkSecondary: {
    fontSize: 18,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.7)',
    marginTop: -2,
    letterSpacing: 2,
  },
  partnerBlock: {
    marginTop: 48,
    alignItems: 'center',
  },
  partnerLogo: {
    width: 160,
    height: 56,
  },
  partnerName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  poweredBy: {
    position: 'absolute',
    bottom: 48,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    letterSpacing: 0.8,
  },
});
