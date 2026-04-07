import React, {useRef, useEffect} from 'react';
import {ScrollView, TouchableOpacity, Text, StyleSheet} from 'react-native';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

interface WeekSelectorProps {
  totalWeeks: number;
  currentWeek: number;
  /** The actual active week from competition_config — doesn't change when user browses */
  activeWeek?: number;
  onSelectWeek: (week: number) => void;
  accentColor: string;
  playoffStartWeek?: number;
}

const CHIP_WIDTH = 52;
const CHIP_GAP = spacing.xs;

/**
 * WeekSelector — Horizontal scrollable week picker.
 * Pill-shaped chips; current week highlighted with accent color.
 * Weeks >= playoffStartWeek get a "PO" prefix.
 */
export function WeekSelector({
  totalWeeks,
  currentWeek,
  activeWeek,
  onSelectWeek,
  accentColor,
  playoffStartWeek,
}: WeekSelectorProps) {
  // activeWeek = the real week from DB. currentWeek = the viewed week.
  const realWeek = activeWeek ?? currentWeek;
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll to current week on mount
  useEffect(() => {
    const offset = (currentWeek - 1) * (CHIP_WIDTH + CHIP_GAP);
    scrollRef.current?.scrollTo({x: offset - 40, animated: false});
  }, []);

  const weeks = Array.from({length: totalWeeks}, (_, i) => i + 1);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      {weeks.map(week => {
        const isActiveWeek = week === realWeek; // the DB current week
        const isViewedWeek = week === currentWeek && week !== realWeek; // user browsed here
        const isPast = week < realWeek && !isViewedWeek;
        const isFuture = week > realWeek && !isViewedWeek;
        const isPlayoff = playoffStartWeek != null && week >= playoffStartWeek;
        const label = isPlayoff
          ? `PO${week - (playoffStartWeek! - 1)}`
          : `W${week}`;

        return (
          <TouchableOpacity
            key={week}
            style={[
              styles.chip,
              realWeek === 0 && {opacity: 0.4},
              isActiveWeek && {backgroundColor: colors.highlight, opacity: 1},
              isViewedWeek && {backgroundColor: colors.highlight + '66'},
              isPast && {backgroundColor: colors.highlight + '4D'},
              isFuture && {backgroundColor: colors.surface, borderColor: colors.border + '80'},
            ]}
            disabled={realWeek === 0}
            onPress={() => onSelectWeek(week)}
            activeOpacity={realWeek === 0 ? 1 : 0.7}>
            <Text
              style={[
                styles.chipText,
                isActiveWeek && styles.chipTextSelected,
                isViewedWeek && {color: '#333333', fontWeight: '700'},
                isPast && {color: colors.textPrimary},
                isFuture && {color: colors.textSecondary + '80'},
              ]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
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
    color: '#181818',
  },
});
