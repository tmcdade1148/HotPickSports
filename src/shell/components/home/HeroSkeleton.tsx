// src/shell/components/home/HeroSkeleton.tsx
// Loading placeholder for the Home hero block. Renders the same card shell
// as the real heroes (margins, padding, radius, border) with shimmering
// blocks roughly tracing a hero's layout — week strip, a message line, the
// module block, and a CTA bar. Shown by HomeScreen until configLoaded is
// true, so the hero area never flashes the default-state (Week 1) hero on a
// cold launch. Pulse mirrors IdentityBar's loop.

import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import type {DimensionValue} from 'react-native';
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

  // A shimmering bar. A plain function (not a JSX component) so its views
  // aren't re-mounted on every render. `w` is px or a percent string.
  const bar = (key: string, w: DimensionValue, h: number, mb = 0) => (
    <Animated.View
      key={key}
      style={[
        styles.block,
        {width: w, height: h, borderRadius: h > 40 ? borderRadius.md : h / 2, marginBottom: mb, opacity: pulse},
      ]}
    />
  );

  return (
    <View
      style={[styles.card, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {/* Week strip — a short row of small chips. */}
      <View style={styles.stripRow}>{[0, 1, 2, 3].map(i => bar(`strip-${i}`, 26, 12))}</View>

      {/* Context message line. */}
      {bar('message', '62%', 12, spacing.md)}

      {/* Module block (timer / HotPick card area). */}
      {bar('module', '100%', 72, spacing.md)}

      {/* CTA bar. */}
      {bar('cta', '100%', 46)}
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
