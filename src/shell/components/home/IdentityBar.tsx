// src/shell/components/home/IdentityBar.tsx
// Spec: 260513_HotPick_HomeRedesign_Spec.docx §6.4.2
//
// Identity Bar — top of Home Screen. Replaces the HotPick wordmark.
// Visible in all 10 Home states.
//
// Layout (per spec):
//   Left  — poolie_name in DISPLAY typography, primary color, large anchor.
//   Right — two stacked rows:
//             1. Week label (mono, muted): "WEEK 8" / "PRESEASON" / ...
//             2. Season points total (mono, ink color)
//
// Data:
//   profiles.poolie_name           ← globalStore.userProfile
//   competition_config.current_*   ← nflStore.{currentPhase, currentWeek}
//   season_user_totals SUM         ← seasonStore.getUserScore(uid)?.total_points
//
// Per spec Red Flag: the client never sums week_points. The aggregation
// happens inside seasonStore.fetchLeaderboard reducer, which reads
// pre-computed per-week season_user_totals rows. We only READ the
// total_points field here — never compute.

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {displayType, bodyType, monoType, spacing} from '@shared/theme';
import {getPeriodLabel} from './periodLabel';

export function IdentityBar() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const poolieName = useGlobalStore(s => s.userProfile?.poolie_name ?? '');
  const userId     = useGlobalStore(s => s.user?.id);

  const currentPhase     = useNFLStore(s => s.currentPhase);
  const currentWeek      = useNFLStore(s => s.currentWeek);
  const playoffStartWeek = useSeasonStore(s => s.config?.playoffStartWeek);

  // Per spec Red Flag — never sum here. The leaderboard reducer in seasonStore
  // pre-aggregates total_points from server-computed week_points + playoff_points.
  const seasonTotal = useSeasonStore(
    s => (userId ? s.getUserScore(userId)?.total_points : undefined) ?? 0,
  );

  const periodLabel = getPeriodLabel(currentPhase, currentWeek, playoffStartWeek);
  const formattedTotal = seasonTotal.toLocaleString();

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => navigation.navigate('Profile')}
        hitSlop={8}
        style={styles.namePress}
        accessibilityRole="button"
        accessibilityLabel={`Profile of ${poolieName || 'player'}`}>
        <Text
          style={[
            displayType.display,
            {fontSize: displayType.size.h1, color: colors.primary},
          ]}
          numberOfLines={1}>
          {poolieName || '—'}
        </Text>
      </Pressable>

      <View style={styles.right}>
        <Text
          style={[
            bodyType.bold,
            monoType.regular,
            styles.weekLabel,
            {color: colors.textSecondary},
          ]}
          numberOfLines={1}>
          {periodLabel}
        </Text>
        <Text
          style={[
            bodyType.bold,
            monoType.regular,
            styles.totalText,
            {color: colors.ink},
          ]}
          numberOfLines={1}>
          {formattedTotal} pts
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  namePress: {
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
  },
  right: {
    alignItems: 'flex-end',
    marginLeft: spacing.md,
  },
  weekLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
  },
  totalText: {
    fontSize: 16,
    marginTop: 2,
  },
});
