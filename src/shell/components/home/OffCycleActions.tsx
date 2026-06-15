// src/shell/components/home/OffCycleActions.tsx
// Action-button block that sits below the off-cycle hero per the
// OffseasonPreseasonHome spec (May 29, 2026):
//
//   Offseason  → Create (primary) + Join (neutral outline)
//   Preseason  → Create (primary) + Make picks (orange outline) + Join (neutral outline)
//
// Three visual tiers per spec §6:
//   • solid orange  — primary
//   • orange outline — live picks (preseason 'Make your picks')
//   • neutral grey outline — quiet
//
// Each button uses the same row shape: leading icon, two-line text
// (title + subtitle), trailing arrow.

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {ArrowRight, KeyRound, Play, Plus} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {ContestActionPill} from '@shell/components/ContestActionPill';

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

type Variant = 'primary' | 'orangeOutline' | 'neutralOutline';

interface ActionBtnProps {
  title: string;
  subtitle: string;
  variant: Variant;
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}

function ActionBtn({title, subtitle, variant, icon, onPress, accessibilityLabel}: ActionBtnProps) {
  const {colors} = useTheme();

  const tone = (() => {
    switch (variant) {
      case 'primary':
        return {
          bg: colors.primary,
          border: colors.primary,
          textPrimary: colors.onPrimary,
          textSecondary: colors.onPrimary,
        };
      case 'orangeOutline':
        return {
          bg: 'transparent',
          border: colors.primary,
          textPrimary: colors.textPrimary,
          textSecondary: colors.primary,
        };
      case 'neutralOutline':
      default:
        return {
          bg: 'transparent',
          border: colors.border,
          textPrimary: colors.textPrimary,
          textSecondary: colors.textSecondary,
        };
    }
  })();

  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [
        styles.btn,
        {
          backgroundColor: tone.bg,
          borderColor: tone.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}>
      <View style={styles.iconWrap}>{icon}</View>
      <View style={styles.labelWrap}>
        <Text style={[bodyType.bold, styles.titleText, {color: tone.textPrimary}]}>{title}</Text>
        <Text style={[bodyType.regular, styles.subText, {color: tone.textSecondary}]}>
          {subtitle}
        </Text>
      </View>
      <ArrowRight size={18} color={tone.textPrimary} strokeWidth={2.25} />
    </Pressable>
  );
}

// Off-season and pre-season action stacks are identical except for the Join
// subtitle. (Public users get the demo here in both states, not live preseason
// picks — spec §1: new users never write preseason picks on nfl_2026, so
// there's nothing to purge before the REGULAR flip.)
function OffCycleActionStack({joinSubtitle}: {joinSubtitle: string}) {
  const navigation = useNavigation<any>();
  const {colors} = useTheme();
  const launchDemo = useLaunchDemo();

  return (
    <View style={styles.stack}>
      <ActionBtn
        variant="orangeOutline"
        title="See how it works"
        subtitle="play a quick demo week"
        icon={<Play size={20} color={colors.primary} strokeWidth={2.25} fill={colors.primary} />}
        onPress={launchDemo}
        accessibilityLabel="Play a quick demo week to see how it works"
      />
      <View style={styles.pillRow}>
        <ContestActionPill
          Icon={KeyRound}
          label="Join a Contest"
          sublabel={joinSubtitle}
          onPress={() => navigation.navigate('JoinPool')}
          accessibilityLabel="Join a Contest with an invite code"
        />
        <ContestActionPill
          Icon={Plus}
          label="Create a Contest"
          sublabel="and invite friends"
          onPress={() => navigation.navigate('CreatePool')}
          accessibilityLabel="Create a new Contest and invite friends"
        />
      </View>
    </View>
  );
}

export function OffSeasonActions() {
  return <OffCycleActionStack joinSubtitle="with a code, any time" />;
}

export function PreSeasonActions() {
  return <OffCycleActionStack joinSubtitle="with a code, any time, even mid-season" />;
}

// Lighter off-cycle actions for a RETURNING user (one who already has Contests
// for the upcoming season — shown above this in the YOUR CONTESTS stack). They
// don't need the big "Create a Contest" primary CTA, just a compact
// create/join-another row. The "See how it works" demo is new-users-only, so
// it's intentionally omitted here.
export function ReturningOffCycleActions() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.stack}>
      <View style={styles.pillRow}>
        <ContestActionPill
          Icon={KeyRound}
          label="Join a Contest"
          sublabel="with a code"
          onPress={() => navigation.navigate('JoinPool')}
          accessibilityLabel="Join a Contest with an invite code"
        />
        <ContestActionPill
          Icon={Plus}
          label="Create a Contest"
          sublabel="and invite friends"
          onPress={() => navigation.navigate('CreatePool')}
          accessibilityLabel="Create a Contest and invite friends"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    gap: spacing.md,
  },
  iconWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: {flex: 1, gap: 1},
  titleText: {fontSize: 16, letterSpacing: 0.2},
  subText:   {fontSize: 13, lineHeight: 17},
  // Row holding the Join/Create pills (stack already pads horizontally).
  pillRow: {flexDirection: 'row', gap: 10},
});
