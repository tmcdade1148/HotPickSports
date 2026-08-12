// PracticeBanner — the demo's safety line on the Season Picks screen.
//
// Spec: 260811_HotPick_DemoAccessAndSafety_Spec v1.4 §7.1 (Finding F).
//
// THE FAILURE THIS INTERCEPTS IS NOT ALARM, IT IS FALSE COMPLETION. A Player
// mid-real-week enters the demo, submits demo Picks, believes their real Picks
// are in, and skips the week. That Player does not want to exit — they want to
// submit — so an exit-only banner never reaches them. Hence the clause as well
// as the control.
//
// Before this, the ONLY signals during the picking phase were the header period
// pill (PRACTICE) and a WeekSelector showing one week instead of eighteen. The
// intro modal is titled HOW SCORING WORKS and never says the Picks aren't real;
// the words DEMO WEEK appear only AFTER submitting.
//
// PRACTICE, never DEMO — it is already the shipped word in the period pill, and
// two names for one state is worse than no name. Both read LEXICON.practice so
// they cannot drift.
//
// ONE LINE, THREE PARTS, NOT A SENTENCE. No full stop, no second sentence, no
// em dash. It must not wrap on an iPhone SE.
//
// Persistent: never scrolls away, never auto-hides, no dismiss control. The
// intro modal covers it while open, which is accepted — the modal has its own
// escape and the banner's job starts when the modal is dismissed, which is
// exactly when the picking phase begins.
//
// Informational, so surface/secondary — never the error or destructive colour
// (Hard Rule #9: every value from useTheme).

import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Text} from '@shared/components/AppText';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing} from '@shared/theme';
import {LEXICON} from '@shared/lexicon';
import {useExitDemo} from '@shell/hooks/useExitDemo';

export function PracticeBanner() {
  const {colors} = useTheme();
  const exitDemo = useExitDemo();

  return (
    <View
      style={[
        styles.bar,
        {backgroundColor: colors.surface, borderBottomColor: colors.border},
      ]}>
      <Text style={[bodyType.bold, styles.tag, {color: colors.secondary}]}>
        {LEXICON.practice}
      </Text>

      <Text
        style={[bodyType.regular, styles.clause, {color: colors.textSecondary}]}
        numberOfLines={1}>
        These aren't your real {LEXICON.picks}
      </Text>

      <Pressable
        onPress={exitDemo}
        hitSlop={10}
        style={({pressed}) => [styles.exit, {opacity: pressed ? 0.6 : 1}]}
        accessibilityRole="button"
        accessibilityLabel="Exit the practice week and go back to your real Contest">
        <Text style={[bodyType.bold, styles.exitLabel, {color: colors.secondary}]}>
          Exit
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  tag: {fontSize: 11, letterSpacing: 0.8},
  // flex + numberOfLines keeps the clause on one line on the narrowest
  // supported device; it truncates before it ever wraps the bar to two rows.
  clause: {flex: 1, fontSize: 12},
  exit: {paddingVertical: 2},
  exitLabel: {fontSize: 13, letterSpacing: 0.3},
});
