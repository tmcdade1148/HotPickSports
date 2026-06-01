// Demo onboarding modals (spec: docs/DEMO_WEEK_SPEC.md §7).
//   DemoIntroModal — scoring explainer shown on entering the demo, including a
//     mock of the HotPick points badge so the number's meaning is clear.
//   DemoScoreModal — plain-language score breakdown shown after settling, with
//     a link to the demo Ladder.
// Both are HotPick-themed (Hard Rule #25) and use the lexicon (Hard Rule §22).

import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {BarChart3, Flame} from 'lucide-react-native';
import {useTheme} from '@shell/theme';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';
import {LEXICON} from '@shared/lexicon';

// ── HotPick points badge — mirrors the rank circle on SeasonMatchCard ──
function HotPickBadge({rank}: {rank: number}) {
  const {colors} = useTheme();
  return (
    <View style={{alignItems: 'center', width: 60}}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{fontSize: 18, fontWeight: '900', color: colors.onPrimary}}>{rank}</Text>
      </View>
      <Text style={{fontSize: 9, fontWeight: '800', color: colors.primary, marginTop: 3, letterSpacing: 0.3}}>
        HotPick
      </Text>
      <Text style={{fontSize: 9, fontWeight: '800', color: colors.primary, marginTop: -1, letterSpacing: 0.3}}>
        Points
      </Text>
    </View>
  );
}

function ModalShell({children}: {children: React.ReactNode}) {
  const {colors} = useTheme();
  return (
    <View style={styles.backdrop}>
      <View style={[styles.card, {backgroundColor: colors.background, borderColor: colors.border}]}>
        {children}
      </View>
    </View>
  );
}

export function DemoIntroModal({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const {colors} = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalShell>
        <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
          HOW SCORING WORKS
        </Text>

        <View style={styles.ruleRow}>
          <View style={[styles.bullet, {backgroundColor: colors.secondary}]} />
          <Text style={[bodyType.regular, styles.ruleText, {color: colors.textPrimary}]}>
            Pick the winner of each game. Every correct pick is{' '}
            <Text style={{fontWeight: '800'}}>+1 point</Text>. A wrong pick is 0 — never negative.
          </Text>
        </View>

        <View style={styles.ruleRow}>
          <Flame size={18} color={colors.primary} fill={colors.primary} style={{marginTop: 1}} />
          <Text style={[bodyType.regular, styles.ruleText, {color: colors.textPrimary}]}>
            Tap the flame to make one game your{' '}
            <Text style={{fontWeight: '800'}}>HotPick</Text>. The number in the badge is how
            many points that game is worth.
          </Text>
        </View>

        <View style={[styles.badgeRow, {backgroundColor: colors.surface, borderColor: colors.border}]}>
          <HotPickBadge rank={12} />
          <View style={{flex: 1}}>
            <Text style={[bodyType.regular, {color: colors.textPrimary, fontSize: 14, lineHeight: 19}]}>
              Get your HotPick right and you win{' '}
              <Text style={{fontWeight: '800', color: colors.success}}>+12</Text>. Get it wrong
              and you lose{' '}
              <Text style={{fontWeight: '800', color: colors.error}}>−12</Text>. Higher badge =
              bigger swing.
            </Text>
          </View>
        </View>

        <Pressable
          onPress={onClose}
          style={({pressed}) => [styles.primaryBtn, {backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1}]}
          accessibilityRole="button"
          accessibilityLabel="Got it, start picking">
          <Text style={[bodyType.bold, styles.primaryLabel, {color: colors.onPrimary}]}>
            Got it — let's pick
          </Text>
        </Pressable>
      </ModalShell>
    </Modal>
  );
}

interface DemoScoreResult {
  weekPoints: number;
  correctPicks: number;
  totalPicks: number;
  hotpickRank: number | null;
  hotpickCorrect: boolean | null;
}

export function DemoScoreModal({
  visible,
  result,
  onClose,
  onViewLadder,
}: {
  visible: boolean;
  result: DemoScoreResult | null;
  onClose: () => void;
  onViewLadder: () => void;
}) {
  const {colors} = useTheme();
  if (!result) return null;

  const {weekPoints, correctPicks, totalPicks, hotpickRank, hotpickCorrect} = result;
  const hotpickCounted = hotpickCorrect === true ? 1 : 0;
  const regularWins = Math.max(0, correctPicks - hotpickCounted);
  const regularPicks = Math.max(0, totalPicks - 1); // all picks minus the HotPick

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalShell>
        <Text style={[bodyType.bold, styles.kicker, {color: colors.textSecondary}]}>
          YOUR DEMO WEEK
        </Text>
        <Text
          style={[
            displayType.display,
            styles.bigScore,
            {color: weekPoints >= 0 ? colors.success : colors.error},
          ]}>
          {weekPoints >= 0 ? '+' : ''}{weekPoints}
          <Text style={{fontSize: 20, color: colors.textSecondary}}> pts</Text>
        </Text>

        <Text style={[bodyType.regular, styles.scoreLine, {color: colors.textPrimary}]}>
          You won <Text style={{fontWeight: '800'}}>{regularWins}</Text> of your {regularPicks}{' '}
          regular picks (+{regularWins}).
        </Text>

        {hotpickRank != null && hotpickCorrect !== null && (
          <Text style={[bodyType.regular, styles.scoreLine, {color: colors.textPrimary}]}>
            {hotpickCorrect ? (
              <>
                Your rank-{hotpickRank} HotPick <Text style={{fontWeight: '800', color: colors.success}}>hit (+{hotpickRank})</Text>.
              </>
            ) : (
              <>
                Your rank-{hotpickRank} HotPick <Text style={{fontWeight: '800', color: colors.error}}>missed (−{hotpickRank})</Text>.
              </>
            )}
          </Text>
        )}

        <Text style={[bodyType.bold, styles.netLine, {color: colors.textPrimary}]}>
          Net: {weekPoints >= 0 ? '+' : ''}{weekPoints} for the week.
        </Text>

        <Pressable
          onPress={onViewLadder}
          style={({pressed}) => [styles.primaryBtn, {backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1}]}
          accessibilityRole="button"
          accessibilityLabel={`View the ${LEXICON.ladder.short}`}>
          <BarChart3 size={18} color={colors.onPrimary} strokeWidth={2.25} />
          <Text style={[bodyType.bold, styles.primaryLabel, {color: colors.onPrimary, marginLeft: 6}]}>
            View {LEXICON.ladder.long}
          </Text>
        </Pressable>
        <Pressable
          onPress={onClose}
          style={({pressed}) => [styles.textBtn, {opacity: pressed ? 0.6 : 1}]}
          accessibilityRole="button"
          accessibilityLabel="Close and review the games">
          <Text style={[bodyType.regular, {color: colors.textSecondary, fontSize: 14}]}>
            Review the games
          </Text>
        </Pressable>
      </ModalShell>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  title: {fontSize: 20, letterSpacing: 0.5, marginBottom: spacing.md},
  ruleRow: {flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, alignItems: 'flex-start'},
  bullet: {width: 8, height: 8, borderRadius: 4, marginTop: 6},
  ruleText: {flex: 1, fontSize: 15, lineHeight: 21},
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  kicker: {fontSize: 11, letterSpacing: 1.5},
  bigScore: {fontSize: 52, marginTop: 2, marginBottom: spacing.sm},
  scoreLine: {fontSize: 15, lineHeight: 22},
  netLine: {fontSize: 16, marginTop: spacing.sm, marginBottom: spacing.lg},
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  primaryLabel: {fontSize: 16},
  textBtn: {alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs},
});
