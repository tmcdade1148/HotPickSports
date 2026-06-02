import React, {useRef, useEffect} from 'react';
import {ScrollView, TouchableOpacity, Text, View, StyleSheet} from 'react-native';
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
  /** Short labels for playoff week chips, keyed by week number (e.g. {19: 'WC'}). */
  playoffWeekLabels?: Record<number, string>;
}

const CHIP_WIDTH = 52;
const CHIP_GAP = spacing.xs;
const SEPARATOR_WIDTH = 18;

/**
 * WeekSelector — Horizontal scrollable week picker.
 * Pill-shaped chips; current week highlighted with accent color.
 *
 * Regular-season weeks (1..totalWeeks) render as `W{n}`. Once the season
 * reaches the playoffs, playoff weeks are appended after a slash separator —
 * but only weeks that have already been reached (week <= active week), so the
 * pills accrue as the playoffs progress. Playoff labels come from
 * `playoffWeekLabels` (e.g. WC / DR / CC / SB for the NFL).
 */
export function WeekSelector({
  totalWeeks,
  currentWeek,
  activeWeek,
  onSelectWeek,
  accentColor,
  playoffStartWeek,
  playoffWeekLabels,
}: WeekSelectorProps) {
  // activeWeek = the real week from DB. currentWeek = the viewed week.
  const realWeek = activeWeek ?? currentWeek;
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const scrollRef = useRef<ScrollView>(null);

  const regularWeeks = Array.from({length: totalWeeks}, (_, i) => i + 1);

  // Playoff weeks: only those already reached, so they appear as the
  // playoffs progress rather than all at once.
  const playoffWeeks = playoffWeekLabels
    ? Object.keys(playoffWeekLabels)
        .map(Number)
        .filter(w => w <= realWeek)
        .sort((a, b) => a - b)
    : [];

  // Auto-scroll to the current week on mount. Account for the separator when
  // the current week is in the playoffs.
  useEffect(() => {
    const pastSeparator = currentWeek > totalWeeks ? SEPARATOR_WIDTH + CHIP_GAP : 0;
    const offset = (currentWeek - 1) * (CHIP_WIDTH + CHIP_GAP) + pastSeparator;
    scrollRef.current?.scrollTo({x: offset - 40, animated: false});
  }, []);

  const renderChip = (week: number, label: string) => {
    const isActiveWeek = week === realWeek; // the DB current week
    const isViewedWeek = week === currentWeek && week !== realWeek; // user browsed here
    const isPast = week < realWeek && !isViewedWeek;
    const isFuture = week > realWeek && !isViewedWeek;

    return (
      <TouchableOpacity
        key={week}
        style={[
          styles.chip,
          realWeek === 0 && {opacity: 0.4},
          // Active/live week: full HotPick blue. Past weeks: faded blue.
          // The week the user has browsed to (viewed): faded orange.
          isActiveWeek && {backgroundColor: colors.accentTeal, borderColor: colors.accentTeal, opacity: 1},
          isViewedWeek && {backgroundColor: colors.secondary + '59', borderColor: colors.secondary},
          isPast && {backgroundColor: colors.accentTeal + '40', borderColor: colors.accentTeal + '66'},
          isFuture && {backgroundColor: colors.surface, borderColor: colors.border + '80'},
        ]}
        disabled={realWeek === 0}
        onPress={() => onSelectWeek(week)}
        activeOpacity={realWeek === 0 ? 1 : 0.7}>
        <Text
          style={[
            styles.chipText,
            isActiveWeek && styles.chipTextSelected,
            isViewedWeek && {color: colors.ink, fontWeight: '700'},
            isPast && {color: colors.textPrimary},
            isFuture && {color: colors.textSecondary + '80'},
          ]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      // flexGrow:0 stops the horizontal ScrollView's outer view from
      // claiming remaining vertical space in its parent column. Without
      // this, the chips render at the top of an oversized container and
      // a visible gap appears below them on the Picks screen.
      style={styles.scroll}
      contentContainerStyle={styles.container}>
      {regularWeeks.map(week => renderChip(week, `W${week}`))}

      {playoffWeeks.length > 0 && (
        <View style={styles.separator}>
          <Text style={styles.separatorText}>/</Text>
        </View>
      )}

      {playoffWeeks.map(week => renderChip(week, playoffWeekLabels![week]))}
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
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
    // Light text for contrast on the dark teal active-week fill.
    color: colors.onPrimary,
  },
  separator: {
    width: SEPARATOR_WIDTH,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separatorText: {
    fontSize: 22,
    fontWeight: '300',
    color: colors.textSecondary + '99',
  },
});
