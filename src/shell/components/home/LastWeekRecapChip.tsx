// src/shell/components/home/LastWeekRecapChip.tsx
// Spec §6.4.4 — single-line chip showing prior week's HotPick result.
//
// Visible: picks_open and picks_locked only (returns each new week).
// Hidden: when the user has no prior-week HotPick (e.g. Week 1, late join).
//
// Format: "Week [N-1]'s HotPick: [team] [✓ or ✗] [±N]"
// Tap   : navigate to Week [N-1] recap in History tab.
//
// Data is loaded into globalStore.lastWeekHotPick by the parent screen
// (HomeScreen calls loadLastWeekHotPick on mount + when currentWeek changes).
// This component is render-only.

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {bodyType, monoType, spacing, borderRadius} from '@shared/theme';

export function LastWeekRecapChip() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const recap       = useGlobalStore(s => s.lastWeekHotPick);
  const currentWeek = useNFLStore(s => s.currentWeek);

  // Hide when no prior HotPick to show.
  if (!recap || currentWeek <= 1) return null;

  const priorWeek = currentWeek - 1;
  const glyph     = recap.isCorrect ? '✓' : '✗';
  const glyphColor = recap.isCorrect ? colors.success : colors.error;
  const pointsStr = recap.points > 0 ? `+${recap.points}` : `${recap.points}`;

  return (
    <Pressable
      onPress={() => navigation.navigate('History', {week: priorWeek})}
      style={({pressed}) => [
        styles.chip,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Week ${priorWeek} HotPick recap: ${recap.team}, ${recap.isCorrect ? 'correct' : 'incorrect'}, ${pointsStr} points`}>
      <Text style={[bodyType.regular, styles.label, {color: colors.textSecondary}]}>
        Week {priorWeek}'s HotPick
      </Text>
      <View style={styles.right}>
        <Text style={[bodyType.bold, styles.team, {color: colors.textPrimary}]}>
          {recap.team}
        </Text>
        <Text style={[styles.glyph, {color: glyphColor}]}>{glyph}</Text>
        <Text style={[monoType.regular, styles.points, {color: glyphColor}]}>
          {pointsStr}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label:  {fontSize: 12, letterSpacing: 0.4},
  right:  {flexDirection: 'row', alignItems: 'center', gap: 8},
  team:   {fontSize: 13, letterSpacing: 0.5},
  glyph:  {fontSize: 14, fontWeight: '900'},
  points: {fontSize: 13, fontWeight: '700'},
});
