// Settling — a SLIM STRIP, not a card (ACTION between-weeks spec §7.1). Scores
// are calculating and this lasts minutes, so the row barely needs presence: a
// spinner + "Settling week N…" and a muted "final points shortly".
//
// NO net-points number (scores aren't final), NO sign colour, NO recap CTA — the
// result must appear NOWHERE during settling (the old card shouted it in red
// before it was even final). The WEEK eyebrow above reads "WEEK N" (label only,
// no value); the running season total lives in HISTORY below.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {bodyType, spacing} from '@shared/theme';

export function SettlingHero() {
  const {colors} = useTheme();
  const currentWeek = useNFLStore(s => s.currentWeek);

  return (
    <View style={styles.strip}>
      <View style={styles.left}>
        <ActivityIndicator size="small" color={colors.textSecondary} />
        <Text
          style={[bodyType.bold, styles.settling, {color: colors.textPrimary}]}
          numberOfLines={1}>
          Settling week {currentWeek}…
        </Text>
      </View>
      <Text
        style={[bodyType.regular, styles.sub, {color: colors.textTertiary}]}
        numberOfLines={1}>
        final points shortly
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  settling: {
    fontSize: 15,
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  sub: {
    fontSize: 12,
    fontStyle: 'italic',
    flexShrink: 0,
  },
});
