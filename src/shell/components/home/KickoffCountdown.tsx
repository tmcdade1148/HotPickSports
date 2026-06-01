// src/shell/components/home/KickoffCountdown.tsx
// The big regular-season kickoff countdown — a single large number showing the
// largest meaningful unit (days → hours inside the last day → minutes inside
// the last hour), with a unit-aware label. Shown on BOTH the off-season and
// pre-season home heroes so the kickoff countdown carries straight across both
// off-cycle phases. Targets season_opener_date (via nflStore).

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, monoType, spacing} from '@shared/theme';
import {useCountdown} from './useCountdown';

export function KickoffCountdown() {
  const {colors} = useTheme();
  const picksOpenAt    = useNFLStore(s => s.picksOpenAt);
  const seasonOpenerAt = useNFLStore(s => s.seasonOpenerAt);
  const activeSport    = useGlobalStore(s => s.activeSport);
  const identity       = activeSport?.sportIdentity;

  const target = seasonOpenerAt ?? picksOpenAt;
  const {unitValue, unit} = useCountdown(target);

  // The config label normally reads "DAYS UNTIL …"; swap its leading unit word
  // to match the unit shown (e.g. "HOURS UNTIL …" inside the last day). No-op
  // for days, or when the label doesn't start with a unit word.
  const unitWord = unit === 'day' ? 'DAYS' : unit === 'hour' ? 'HOURS' : 'MINUTES';
  const cdLabel = (identity?.offseasonCountdownLabel ?? 'DAYS UNTIL KICKOFF')
    .replace(/^(DAYS|HOURS|MINUTES)\b/i, unitWord);

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
