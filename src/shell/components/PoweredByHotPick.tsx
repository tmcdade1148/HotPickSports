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
export function PoweredByHotPick() {
  const {isBranded} = useBrand();
  const {colors} = useTheme();

  if (!isBranded) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.poweredText, {color: colors.textSecondary}]}>
          Powered by
        </Text>
        <Image
          source={require('../../assets/hotpick-wordmark-w.png')}
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
    paddingVertical: 10,
    paddingBottom: 16,
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
    marginLeft: -12,
  },
});
