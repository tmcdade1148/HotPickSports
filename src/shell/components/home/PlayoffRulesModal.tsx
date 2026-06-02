// src/shell/components/home/PlayoffRulesModal.tsx
// Explains how the playoffs work, opened from the ⓘ on the PlayoffBanner.
// Rules sourced from REFERENCE.md §3 (playoff reset) + scoring rules.
//
// Tie-breaker ladder (confirmed with Tom): playoff points → Super Bowl margin
// (Price Is Right, closest without going over) → most correct playoff picks →
// most correct playoff HotPicks → co-champions. The actual tie-break
// computation ships with Super Bowl scoring (REFERENCE §3, Nov 2026); this
// popup just states the rule.

import React from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {X} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PlayoffRulesModal({visible, onClose}: Props) {
  const {colors} = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, {backgroundColor: colors.surface, borderColor: colors.border}]}
          onPress={() => {}}>
          <View style={styles.header}>
            <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
              HOW THE PLAYOFFS WORK
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <Rule
              colors={colors}
              heading="Fresh start"
              text="The playoffs reset the scoreboard. Everyone’s regular-season points go back to zero, and playoff points build up on their own. Your regular-season finish is saved in your history."
            />
            <Rule
              colors={colors}
              heading="You play every round"
              text="You keep making picks through all four rounds — Wild Card, Divisional, Conference Championships, and the Super Bowl. No need to re-join; you’re in automatically."
            />
            <Rule
              colors={colors}
              heading="Scoring"
              text="Each correct pick is worth +1. Your HotPick is worth its rank: + the rank if it wins, − the rank if it loses. Higher-ranked games are bigger swings."
            />
            {/* Tie-breaker ladder — applied in order until the tie is broken. */}
            <View
              style={[
                styles.tieBlock,
                {backgroundColor: colors.primary + '11', borderColor: colors.primary},
              ]}>
              <Text style={[bodyType.bold, styles.ruleHeading, {color: colors.primary}]}>
                Tie-breaker
              </Text>
              <Text style={[bodyType.regular, styles.ruleText, {color: colors.textSecondary}]}>
                If players finish the playoffs level on points, the tie breaks in this order:
              </Text>
              {[
                'Super Bowl margin — closest to the final winning margin without going over (Price Is Right style).',
                'Most correct picks in the playoffs (HotPick or not).',
                'Most correct HotPicks in the playoffs.',
              ].map((step, i) => (
                <View key={i} style={styles.tieStep}>
                  <Text style={[bodyType.bold, styles.tieNum, {color: colors.primary}]}>{i + 1}.</Text>
                  <Text style={[bodyType.regular, styles.tieStepText, {color: colors.textSecondary}]}>
                    {step}
                  </Text>
                </View>
              ))}
              <Text style={[bodyType.regular, styles.tieCochamp, {color: colors.textPrimary}]}>
                Still even? Co-champions — the title is shared.
              </Text>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Rule({
  colors,
  heading,
  text,
  highlight,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  heading: string;
  text: string;
  highlight?: boolean;
}) {
  return (
    <View
      style={[
        styles.rule,
        highlight && {
          backgroundColor: colors.primary + '11',
          borderColor: colors.primary,
          borderWidth: 1,
          borderRadius: borderRadius.md,
          padding: spacing.sm,
        },
      ]}>
      <Text style={[bodyType.bold, styles.ruleHeading, {color: highlight ? colors.primary : colors.textPrimary}]}>
        {heading}
      </Text>
      <Text style={[bodyType.regular, styles.ruleText, {color: colors.textSecondary}]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    borderRadius: borderRadius.lg + 4,
    borderWidth: 1,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {fontSize: 16, letterSpacing: 0.5, flex: 1},
  body: {padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md},
  rule: {gap: 4},
  ruleHeading: {fontSize: 13, letterSpacing: 0.3},
  ruleText: {fontSize: 14, lineHeight: 20},
  tieBlock: {
    gap: 6,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  tieStep: {flexDirection: 'row', gap: 6, paddingRight: spacing.xs},
  tieNum: {fontSize: 14, lineHeight: 20},
  tieStepText: {flex: 1, fontSize: 14, lineHeight: 20},
  tieCochamp: {fontSize: 14, lineHeight: 20, marginTop: 2},
});
