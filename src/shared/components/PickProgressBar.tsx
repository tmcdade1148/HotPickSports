// PickProgressBar — the ONE progress bar for "how many picks are in."
//
// Extracted from PicksProgressHeader (Picks screen) so the Picks screen AND the
// Home picks_open surface render the identical bar (spec §3.2). Props are just
// the two numbers; every colour is a token (Hard Rule #9).
//
// Colour: ORANGE fill (colors.primary) the whole way up, snapping to GREEN
// (colors.gameWon) at 100%. The old grey → YELLOW → green traffic-light is
// gone — there is no mid-state yellow any more.

import React from 'react';
import {View, StyleSheet} from 'react-native';
import {useTheme} from '@shell/theme';

interface PickProgressBarProps {
  picksSet: number;
  totalGames: number;
}

export function PickProgressBar({picksSet, totalGames}: PickProgressBarProps) {
  const {colors} = useTheme();

  const progress = totalGames > 0 ? picksSet / totalGames : 0;
  const complete = totalGames > 0 && picksSet >= totalGames;
  // Orange while filling, green once every pick is in. No yellow mid-state.
  const fillColor = complete ? colors.gameWon : colors.primary;

  return (
    <View style={[styles.track, {backgroundColor: colors.border}]}>
      <View
        style={[
          styles.fill,
          {width: `${Math.min(progress * 100, 100)}%`, backgroundColor: fillColor},
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
