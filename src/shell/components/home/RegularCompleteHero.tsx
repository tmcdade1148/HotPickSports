// src/shell/components/home/RegularCompleteHero.tsx
// Spec §6.4.3 — regular_complete_bridge row.
//
// Phase: REGULAR_COMPLETE (between Week 18 finalization and PLAYOFFS open).
// Surfaces the playoff-reset framing per the plan: pool leaderboards reset
// when entering PLAYOFFS, so users see explicit "regular season closed,
// playoffs incoming" copy here.

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import {getContextGreeting} from './salutation';

export function RegularCompleteHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const currentPhase = useNFLStore(s => s.currentPhase);
  const userId       = useGlobalStore(s => s.user?.id);
  const seasonTotal  = useSeasonStore(
    s => (userId ? s.getUserScore(userId)?.total_points : undefined) ?? 0,
  );
  const greeting = getContextGreeting(currentPhase, 'idle', 0, null);

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        {greeting}
      </Text>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textSecondary}]}>
        REGULAR SEASON COMPLETE
      </Text>

      <View style={[styles.card, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
        <Text
          style={[
            displayType.display,
            {fontSize: displayType.size.h1, color: colors.textPrimary, lineHeight: displayType.size.h1 * 0.95},
          ]}>
          {seasonTotal.toLocaleString()} PTS
        </Text>
        <Text style={[bodyType.regular, styles.subtitle, {color: colors.textSecondary}]}>
          Regular season closed. Playoff scoreboard resets — everyone starts fresh.
        </Text>
        <View style={[styles.tag, {backgroundColor: colors.primary + '22', borderColor: colors.primary}]}>
          <Text style={[bodyType.bold, styles.tagText, {color: colors.primary}]}>
            PLAYOFFS INCOMING
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => navigation.navigate('LeaderboardTab')}
        style={({pressed}) => [
          styles.cta,
          {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel="See your regular season recap">
        <Text style={[bodyType.bold, styles.ctaText, {color: colors.textPrimary}]}>
          See regular season recap
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:       {paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md},
  salutation: {fontSize: 13},
  eyebrow:    {fontSize: 11, letterSpacing: 2},
  card: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg + 4,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  subtitle: {fontSize: 14, lineHeight: 20},
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
  },
  tagText: {fontSize: 10, letterSpacing: 1.4},
  cta: {
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  ctaText: {fontSize: 14, letterSpacing: 0.5},
});
