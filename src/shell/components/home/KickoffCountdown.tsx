// src/shell/components/home/KickoffCountdown.tsx
// The big off-cycle countdown — a single large number showing the largest
// meaningful unit (days → hours inside the last day → minutes inside the last
// hour), with a unit-aware label.
//
// Two target modes (map's ACTION column, rows 1–2):
//   'kickoff'   → days until kickoff (season_opener_date). Rows 1 (off_far) and
//                 3 (preseason). Label from sportIdentity (sport-agnostic).
//   'picksOpen' → days until PICKS open (season_picks_open_at). Row 2 (off_near),
//                 the ≤7-days-out window. Label: "DAYS UNTIL PICKS OPEN".

import React from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, monoType, spacing} from '@shared/theme';
import {useCountdown} from './useCountdown';

export function KickoffCountdown({target: mode = 'kickoff'}: {target?: 'kickoff' | 'picksOpen'}) {
  const {colors} = useTheme();
  const picksOpenAt    = useNFLStore(s => s.picksOpenAt);
  const seasonOpenerAt = useNFLStore(s => s.seasonOpenerAt);
  const activeSport    = useGlobalStore(s => s.activeSport);
  const identity       = activeSport?.sportIdentity;

  // picksOpen mode counts down to picks opening; kickoff mode to the opener
  // (falling back to picksOpenAt only when the opener date isn't set).
  const target = mode === 'picksOpen' ? picksOpenAt : (seasonOpenerAt ?? picksOpenAt);
  const {unitValue, unit} = useCountdown(target);

  // The base label reads "DAYS UNTIL …"; swap its leading unit word to match the
  // unit shown (e.g. "HOURS UNTIL …" inside the last day). No-op for days, or
  // when the label doesn't start with a unit word. Kickoff mode keeps the
  // sport-agnostic sportIdentity label; picks-open mode uses the map's row-2 copy.
  const unitWord = unit === 'day' ? 'DAYS' : unit === 'hour' ? 'HOURS' : 'MINUTES';
  const baseLabel = mode === 'picksOpen'
    ? 'DAYS UNTIL PICKS OPEN'
    : (identity?.offseasonCountdownLabel ?? 'DAYS UNTIL KICKOFF');
  const cdLabel = baseLabel.replace(/^(DAYS|HOURS|MINUTES)\b/i, unitWord);

  return (
    <View style={styles.countdownBlock}>
      <Text
        style={[displayType.display, monoType.regular, styles.bigNumber, {color: colors.textPrimary}]}>
        {unitValue}
      </Text>
      <Text style={[bodyType.bold, styles.countdownLabel, {color: colors.primary}]}>
        {cdLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  countdownBlock: {alignItems: 'center', marginTop: spacing.sm, gap: spacing.xs},
  bigNumber: {fontSize: 96, lineHeight: 100, letterSpacing: -2},
  countdownLabel: {fontSize: 11, letterSpacing: 1.8, marginTop: spacing.xs},
});
