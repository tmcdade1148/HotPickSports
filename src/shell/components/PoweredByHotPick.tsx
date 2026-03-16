import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useBrand, useTheme} from '@shell/theme';

/**
 * "Powered by HotPick" credit line.
 *
 * Renders automatically on branded pool screens when is_branded === true.
 * Part of the pool header template — not opt-in per screen.
 * Cannot be omitted. No prop to hide it. Not conditional on anything.
 *
 * Minimum font size: 11pt. Always visible against partner background.
 * Uses "Powered by HotPick Sports" (product name).
 */
export function PoweredByHotPick() {
  const {isBranded} = useBrand();
  const {colors} = useTheme();

  if (!isBranded) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.text, {color: colors.textSecondary}]}>
        Powered by <Text style={styles.bold}>HotPick Sports</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  text: {
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  bold: {
    fontWeight: '700',
  },
});
