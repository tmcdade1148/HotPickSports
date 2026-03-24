import React from 'react';
import {View, Image, Text, StyleSheet} from 'react-native';
import {useBrand, useTheme} from '@shell/theme';

/**
 * "Powered by HotPick" credit line with wordmark.
 *
 * Renders automatically on branded pool screens when is_branded === true.
 * Part of the pool header template — not opt-in per screen.
 * Cannot be omitted. No prop to hide it. Not conditional on anything.
 *
 * Uses "Powered by" text + HotPick wordmark image.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const wordmarkLight = require('../../assets/hotpick-wordmark-lt.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const wordmarkDark = require('../../assets/hotpick-wordmark-dk.png');

/**
 * Determine if a hex color is "dark" (luminance < 0.5).
 */
function isDarkColor(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 0.5;
}

export function PoweredByHotPick() {
  const {isBranded} = useBrand();
  const {colors} = useTheme();

  if (!isBranded) {
    return null;
  }

  // Light bg → light wordmark, dark bg → dark wordmark
  const wordmarkSource = isDarkColor(colors.background) ? wordmarkDark : wordmarkLight;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.poweredText, {color: colors.textSecondary}]}>
          Powered by
        </Text>
        <Image
          source={wordmarkSource}
          style={styles.wordmark}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  poweredText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  wordmark: {
    height: 28,
    width: 150,
    marginLeft: -30,
  },
});
