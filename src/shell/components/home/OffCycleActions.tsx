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

export function OffSeasonActions() {
  const navigation = useNavigation<any>();
  const {colors} = useTheme();

  return (
    <View style={styles.stack}>
      <ActionBtn
        variant="primary"
        title="Create a Contest"
        subtitle="and invite your friends"
        icon={<Plus size={20} color={colors.onPrimary} strokeWidth={2.25} />}
        onPress={() => navigation.navigate('CreatePool')}
        accessibilityLabel="Create a new Contest and invite friends"
      />
      <ActionBtn
        variant="neutralOutline"
        title="Join a Contest"
        subtitle="with a code, any time"
        icon={<KeyRound size={20} color={colors.textPrimary} strokeWidth={2.25} />}
        onPress={() => navigation.navigate('JoinPool')}
        accessibilityLabel="Join a Contest with an invite code"
      />
    </View>
  );
}

export function PreSeasonActions() {
  const navigation = useNavigation<any>();
  const {colors} = useTheme();

  return (
    <View style={styles.stack}>
      <ActionBtn
        variant="primary"
        title="Create a Contest"
        subtitle="and invite your friends"
        icon={<Plus size={20} color={colors.onPrimary} strokeWidth={2.25} />}
        onPress={() => navigation.navigate('CreatePool')}
        accessibilityLabel="Create a new Contest and invite friends"
      />
      <ActionBtn
        variant="orangeOutline"
        title="Make your picks"
        subtitle="preseason games are live"
        icon={<Play size={20} color={colors.primary} strokeWidth={2.25} fill={colors.primary} />}
        onPress={() => navigation.navigate('PicksTab')}
        accessibilityLabel="Make your preseason picks"
      />
      <ActionBtn
        variant="neutralOutline"
        title="Join a Contest"
        subtitle="with a code, any time, even mid-season"
        icon={<KeyRound size={20} color={colors.textPrimary} strokeWidth={2.25} />}
        onPress={() => navigation.navigate('JoinPool')}
        accessibilityLabel="Join a Contest with an invite code"
      />
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
});
