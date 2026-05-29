// src/shell/components/home/CrossContestStrip.tsx
// Tinted card that reinforces the pick-once-play-everywhere mechanic.
// Sits below the off-cycle hero on both OffSeasonHero and
// PreSeasonGamesHero per the OffseasonPreseasonHome spec (May 29, 2026).
//
// Background: brand orange tinted (~8% opacity) over the page surface
// so it reads as a soft callout, not a separate component.

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {hexToRgba} from '@shared/utils/color';

export function CrossContestStrip() {
  const {colors} = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        {backgroundColor: hexToRgba(colors.primary, 0.08)},
      ]}>
      <Text style={[bodyType.bold, styles.title, {color: colors.primary}]}>
        One set of picks. Every Contest at once.
      </Text>
      <Text style={[bodyType.regular, styles.body, {color: colors.primary}]}>
        The same picks play in every Contest you're in, all at the same time.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    gap: 4,
  },
  title: {fontSize: 14, letterSpacing: 0.2},
  body:  {fontSize: 13, lineHeight: 18, opacity: 0.85},
});
