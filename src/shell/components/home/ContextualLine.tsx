// src/shell/components/home/ContextualLine.tsx
// Home Module Map v4, module 3 — THE CONTEXTUAL LINE.
//
// "One line. Nudge, news, or taunt. No flame, ever." (map §3)
//
// ONE producer. This replaces the two the map named — getContextGreeting
// (salutation.ts, rendered inside four bridge heroes) and buildContextualMessage
// (private to PicksOpenHero, hidden the moment the week locked). Both are deleted
// in the same commit; this component is the single source, rendered ONCE by
// HomeScreen directly above the hero, reading its copy from the state table
// (HOME_ROWS[row].contextual).
//
// Deterministic per-hour: the line is picked with the current hour as the seed,
// so it doesn't flicker on re-render but evolves through the day — the same
// behaviour getContextGreeting had.
//
// Rows whose contextual pool is empty (off-season, preseason, complete) render
// nothing — matching the states that showed no line before 7a.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing} from '@shared/theme';
import {HOME_ROWS, type HomeRow} from './homeRows';

/** Deterministic per-hour pick — no flicker within an hour, evolves across the day. */
function pickForHour(pool: readonly string[]): string | null {
  if (pool.length === 0) return null;
  const hour = new Date().getHours();
  return pool[hour % pool.length];
}

export function ContextualLine({row}: {row: HomeRow}) {
  const {colors} = useTheme();
  const line = pickForHour(HOME_ROWS[row].contextual);
  if (!line) return null;

  return (
    <View style={styles.wrap}>
      <Text
        style={[bodyType.regular, styles.line, {color: colors.textSecondary}]}
        numberOfLines={2}>
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  line: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
});
