// src/shell/components/home/LastWeekRecapChip.tsx
// Spec §6.4.4 — single-line chip showing prior week's HotPick result.
//
// Reference (May 13 2026 v2):
//   ┌──────────────────────────────────────────────┐
//   │ [✓]  WEEK 7 HOTPICK                       › │
//   │      Panthers +8 · +13 bonus                 │
//   └──────────────────────────────────────────────┘
//
// Left  — round icon tile (success green ✓ if hit, error red ✗ if miss)
// Mid   — eyebrow "WEEK [N-1] HOTPICK" + bold result line
// Right — chevron ›
// Tap   → History screen for week N-1
//
// Hidden when no prior HotPick exists or currentWeek <= 1.

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {ChevronRight} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {bodyType, spacing, borderRadius} from '@shared/theme';

export function LastWeekRecapChip() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const recap       = useGlobalStore(s => s.lastWeekHotPick);
  const currentWeek = useNFLStore(s => s.currentWeek);

  if (!recap || currentWeek <= 1) return null;

  const priorWeek = currentWeek - 1;
  const positive  = recap.isCorrect;
  const tileColor = positive ? colors.success : colors.error;
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
      accessibilityLabel={`Week ${priorWeek} HotPick recap: ${recap.team}, ${positive ? 'hit' : 'miss'}, ${pointsStr} points`}>
      <View style={[styles.tile, {backgroundColor: tileColor + '22', borderColor: tileColor + '66'}]}>
        <Text style={[styles.tileGlyph, {color: tileColor}]}>
          {positive ? '✓' : '✗'}
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textTertiary}]}>
          WEEK {priorWeek} HOTPICK
        </Text>
        <Text style={[bodyType.bold, styles.result, {color: colors.textPrimary}]} numberOfLines={1}>
          {recap.team} {positive ? '+' : '−'}
          {Math.abs(recap.points)}{' · '}
          <Text style={{color: tileColor, fontFamily: 'Manrope-Bold'}}>
            {pointsStr} bonus
          </Text>
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGlyph: {
    fontSize: 22,
    fontFamily: 'Manrope-Bold',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: {fontSize: 10, letterSpacing: 1.6},
  result:  {fontSize: 14},
});
