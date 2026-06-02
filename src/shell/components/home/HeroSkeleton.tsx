// src/shell/components/home/HeroSkeleton.tsx
// Loading placeholder for the Home hero block. Renders the same card shell
// as the real heroes (margins, padding, radius, border) with shimmering
// blocks roughly tracing a hero's layout — week strip, a message line, the
// module block, and a CTA bar. Shown by HomeScreen until configLoaded is
// true, so the hero area never flashes the default-state (Week 1) hero on a
// cold launch. Pulse mirrors IdentityBar's loop.

import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {spacing, borderRadius} from '@shared/theme';

export function HeroSkeleton() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 0.4, duration: 800, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 1, duration: 800, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // A shimmering block. `w` accepts a number (px) or a percent string.
  const Block = ({w, h, mb}: {w: number | string; h: number; mb?: number}) => (
    <Animated.View
      style={[
        styles.block,
        {width: w as any, height: h, borderRadius: h > 40 ? borderRadius.md : h / 2, marginBottom: mb ?? 0, opacity: pulse},
      ]}
    />
  );

  return (
    <View
      style={[styles.card, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {/* Week strip — a short row of small chips. */}
      <View style={styles.stripRow}>
        <Block w={26} h={12} />
        <Block w={26} h={12} />
        <Block w={26} h={12} />
        <Block w={26} h={12} />
      </View>

      {/* Context message line. */}
      <Block w="62%" h={12} mb={spacing.md} />

      {/* Module block (timer / HotPick card area). */}
      <Block w="100%" h={72} mb={spacing.md} />

      {/* CTA bar. */}
      <Block w="100%" h={46} />
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    // Mirrors PicksOpenHero's `card` so the placeholder occupies the same
    // footprint — no layout jump when the real hero swaps in.
    card: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      padding: 18,
      borderRadius: borderRadius.lg + 2,
      borderWidth: 1,
    },
    stripRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    block: {
      backgroundColor: colors.border,
    },
  });
