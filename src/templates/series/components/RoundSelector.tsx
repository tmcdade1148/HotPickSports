import React, {useRef, useEffect} from 'react';
import {ScrollView, TouchableOpacity, Text, StyleSheet} from 'react-native';
import type {SeriesRoundConfig} from '@shared/types/templates';
import {colors, spacing, borderRadius} from '@shared/theme';

interface RoundSelectorProps {
  rounds: SeriesRoundConfig[];
  currentRound: number;
  onSelectRound: (index: number) => void;
  accentColor: string;
}

const CHIP_MIN_WIDTH = 80;
const CHIP_GAP = spacing.xs;

/**
 * RoundSelector — Horizontal scrollable round picker for playoff brackets.
 * Pill-shaped chips; current round highlighted with accent color.
 * MegaPick rounds get a special border accent.
 */
export function RoundSelector({
  rounds,
  currentRound,
  onSelectRound,
  accentColor,
}: RoundSelectorProps) {
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll to current round on mount
  useEffect(() => {
    const offset = currentRound * (CHIP_MIN_WIDTH + CHIP_GAP);
    scrollRef.current?.scrollTo({x: Math.max(0, offset - 20), animated: false});
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      {rounds.map((round, index) => {
        const isSelected = index === currentRound;
        const isMega = round.isMegaPick === true;

        return (
          <TouchableOpacity
            key={round.key}
            style={[
              styles.chip,
              isSelected && {backgroundColor: accentColor},
              isMega && !isSelected && styles.megaChip,
            ]}
            onPress={() => onSelectRound(index)}>
            <Text
              style={[
                styles.chipText,
                isSelected && styles.chipTextSelected,
                isMega && !isSelected && styles.megaChipText,
              ]}
              numberOfLines={1}>
              {round.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: CHIP_GAP,
  },
  chip: {
    minWidth: CHIP_MIN_WIDTH,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  megaChip: {
    borderColor: colors.warning,
    borderWidth: 2,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  megaChipText: {
    color: colors.warning,
  },
});
