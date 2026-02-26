import React, {useRef, useEffect, useMemo} from 'react';
import {ScrollView, TouchableOpacity, Text, StyleSheet} from 'react-native';
import {useTheme} from '@shell/theme';

interface WeekSelectorProps {
  totalWeeks: number;
  currentWeek: number;
  onSelectWeek: (week: number) => void;
  accentColor: string;
  playoffStartWeek?: number;
}

const CHIP_WIDTH = 52;

/**
 * WeekSelector — Horizontal scrollable week picker.
 * Pill-shaped chips; current week highlighted with accent color.
 * Weeks >= playoffStartWeek get a "PO" prefix.
 */
export function WeekSelector({
  totalWeeks,
  currentWeek,
  onSelectWeek,
  accentColor,
  playoffStartWeek,
}: WeekSelectorProps) {
  const {colors, spacing, borderRadius} = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const CHIP_GAP = spacing.xs;

  // Auto-scroll to current week on mount
  useEffect(() => {
    const offset = (currentWeek - 1) * (CHIP_WIDTH + CHIP_GAP);
    scrollRef.current?.scrollTo({x: offset - 40, animated: false});
  }, []);

  const weeks = Array.from({length: totalWeeks}, (_, i) => i + 1);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: CHIP_GAP,
    },
    chip: {
      width: CHIP_WIDTH,
      height: 36,
      borderRadius: borderRadius.full,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    chipTextSelected: {
      color: colors.textOnPrimary,
    },
  }), [colors, spacing, borderRadius]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      {weeks.map(week => {
        const isSelected = week === currentWeek;
        const isPlayoff = playoffStartWeek != null && week >= playoffStartWeek;
        const label = isPlayoff
          ? `PO${week - (playoffStartWeek! - 1)}`
          : `W${week}`;

        return (
          <TouchableOpacity
            key={week}
            style={[
              styles.chip,
              isSelected && {backgroundColor: accentColor},
            ]}
            onPress={() => onSelectWeek(week)}>
            <Text
              style={[
                styles.chipText,
                isSelected && styles.chipTextSelected,
              ]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
