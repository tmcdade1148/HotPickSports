// src/shell/components/home/ZeroPoolsHero.tsx
// Spec §6.4.3 — zero_pools row.
//
// Welcome hero shown when the user has no visible pools. Overrides every
// other state per §6.1 — even mid-season, a user without a visible pool
// sees this rather than a generic in-cycle hero.
//
// Two CTAs side-by-side:
//   • "Enter invite code"  (primary)   → JoinPool flow
//   • "Create a pool"       (secondary) → CreatePool flow

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';

export function ZeroPoolsHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const setExplore = useGlobalStore(s => s.setZeroPoolsExploreMode);

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        Welcome.
      </Text>
      <Text
        style={[
          displayType.display,
          {fontSize: displayType.size.h1, color: colors.textPrimary},
        ]}>
        GET IN A CONTEST.
      </Text>
      <Text style={[bodyType.regular, styles.sub, {color: colors.textSecondary}]}>
        A Contest is a friendly competition between people who already know
        each other. To get into one, you'll need an invite code from the
        person organizing it (the Gaffer).
      </Text>

      <View style={styles.ctaRow}>
        <Pressable
          onPress={() => navigation.navigate('JoinPool')}
          style={({pressed}) => [
            styles.ctaPrimary,
            {backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1},
          ]}
          accessibilityRole="button"
          accessibilityLabel="Enter an invite code to join a Contest">
          <Text style={[bodyType.bold, styles.ctaPrimaryText, {color: colors.onPrimary}]}>Have an invite code?</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('CreatePool')}
          style={({pressed}) => [
            styles.ctaSecondary,
            {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create a new Contest you'll organize">
          <Text style={[bodyType.bold, styles.ctaSecondaryText, {color: colors.textPrimary}]}>
            Create a Contest
          </Text>
        </Pressable>
      </View>

      {/* Soft escape — lets a brand-new user dismiss the hero and
          browse YOUR CLUBS without committing to joining or creating
          a Contest yet. Flips the session-scoped explore flag in
          globalStore; HomeScreen reads it to hide the hero and reveal
          the partner stack. */}
      <Pressable
        onPress={() => setExplore(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Skip and look around the app first">
        <Text style={[bodyType.regular, styles.exploreLink, {color: colors.textSecondary}]}>
          or pop in and look around →
        </Text>
      </Pressable>

      <Text style={[bodyType.regular, styles.privacy, {color: colors.textTertiary}]}>
        All Contests on HotPick are private. There's no public matchmaking —
        this is built for groups who already know each other.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  salutation: {fontSize: 13},
  sub: {fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: spacing.md},
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ctaPrimary: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  ctaPrimaryText:   {fontSize: 14, letterSpacing: 0.5, textTransform: 'uppercase'},
  ctaSecondary: {
    flex: 1,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  ctaSecondaryText: {fontSize: 14, letterSpacing: 0.5},
  exploreLink: {
    fontSize: 13,
    textDecorationLine: 'underline',
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
  privacy: {
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
    marginTop: spacing.md,
  },
});
