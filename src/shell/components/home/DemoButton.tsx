// DemoButton — the "See how it works" demo CTA, extracted from OffCycleActions so
// it renders standalone on the off-season AND pre-season home for ALL users
// (Slice 7c: the old "new-users-only" gate is retired). Wired to useLaunchDemo,
// the demo-launch behavior.
//
// HotPick-themed via useTheme (Hard Rule #9).

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {ArrowRight, Play} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';

// Shared demo launcher — enters the nfl_demo sandbox (snapshotting the prior
// active selection), resets to a clean slate (fresh games + no picks, even if a
// prior run left completed games cached), then lands on the Picks tab. Spec:
// docs/DEMO_WEEK_SPEC.md §7.1.
function useLaunchDemo() {
  const navigation = useNavigation<any>();
  const enterDemo = useGlobalStore(s => s.enterDemo);
  const resetDemoGames = useSeasonStore(s => s.resetDemoGames);
  return async () => {
    // Independent: enterDemo resets DB picks + swaps active competition;
    // resetDemoGames reloads the (self-contained) demo games. Run together.
    await Promise.all([enterDemo(), resetDemoGames()]);
    navigation.navigate('PicksTab');
  };
}

export function DemoButton() {
  const {colors} = useTheme();
  const launchDemo = useLaunchDemo();

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={launchDemo}
        style={({pressed}) => [
          styles.btn,
          {borderColor: colors.primary, opacity: pressed ? 0.85 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel="Play a quick demo week to see how it works">
        <View style={styles.iconWrap}>
          <Play size={20} color={colors.primary} strokeWidth={2.25} fill={colors.primary} />
        </View>
        <View style={styles.labelWrap}>
          <Text style={[bodyType.bold, styles.title, {color: colors.textPrimary}]}>
            See how it works
          </Text>
          <Text style={[bodyType.regular, styles.subtitle, {color: colors.primary}]}>
            Get an overview of the rules and a quick demo.
          </Text>
        </View>
        <ArrowRight size={18} color={colors.textPrimary} strokeWidth={2.25} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    gap: spacing.md,
    backgroundColor: 'transparent',
  },
  iconWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: {flex: 1, gap: 1},
  title: {fontSize: 16, letterSpacing: 0.2},
  subtitle: {fontSize: 13, lineHeight: 17},
});
