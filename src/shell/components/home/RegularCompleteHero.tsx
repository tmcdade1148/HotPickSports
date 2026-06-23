// src/shell/components/home/RegularCompleteHero.tsx
// Spec §6.4.3 — regular_complete_bridge row.
//
// Phase: REGULAR_COMPLETE (between Week 18 finalization and PLAYOFFS open).
// Publicly acknowledges the regular-season WINNERS — the pool's top-3
// finishers — before the playoff scoreboard resets, then frames the reset.
// The podium reads the regular-season final standings (always phase=REGULAR),
// not the live leaderboard, which flips to playoff scope here.

import React, {useEffect} from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import {getContextGreeting} from './salutation';

const MEDALS = ['\u{1F947}', '\u{1F948}', '\u{1F949}']; // 🥇 🥈 🥉

export function RegularCompleteHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const currentPhase = useNFLStore(s => s.currentPhase);
  const userId       = useGlobalStore(s => s.user?.id);

  const podium     = useSeasonStore(s => s.regularSeasonPodium);
  const userPoints = useSeasonStore(s => s.regularSeasonUserPoints);
  const loadPodium = useSeasonStore(s => s.loadRegularSeasonPodium);

  useEffect(() => {
    if (userId) loadPodium(userId).catch(() => {});
  }, [userId, loadPodium]);

  const greeting = getContextGreeting(currentPhase, 'idle', 0, null);
  const winner = podium[0];
  const userIsWinner = !!winner && winner.user_id === userId;

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        {greeting}
      </Text>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textSecondary}]}>
        REGULAR SEASON COMPLETE
      </Text>

      {winner ? (
        <View style={[styles.card, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
          <Text style={[bodyType.bold, styles.cardLabel, {color: colors.textSecondary}]}>
            REGULAR SEASON {podium.length > 1 ? 'WINNERS' : 'WINNER'}
          </Text>

          {podium.map(entry => (
            <View key={entry.user_id} style={styles.podiumRow}>
              <Text style={styles.medal}>{MEDALS[entry.rank - 1] ?? `${entry.rank}.`}</Text>
              <Text
                style={[
                  entry.rank === 1 ? displayType.display : bodyType.bold,
                  styles.podiumName,
                  {color: colors.textPrimary, fontSize: entry.rank === 1 ? 22 : 16},
                ]}
                numberOfLines={1}>
                {entry.display_name}
              </Text>
              <Text style={[bodyType.bold, styles.podiumPts, {color: colors.primary}]}>
                {entry.total_points.toLocaleString()} pts
              </Text>
            </View>
          ))}

          {userPoints != null && !userIsWinner && (
            <Text style={[bodyType.regular, styles.youRow, {color: colors.textSecondary}]}>
              You finished with {userPoints.toLocaleString()} pts.
            </Text>
          )}

          <Text style={[bodyType.regular, styles.subtitle, {color: colors.textSecondary}]}>
            Playoff scoreboard resets — everyone starts fresh.
          </Text>
          <View style={[styles.tag, {backgroundColor: colors.primary + '22', borderColor: colors.primary}]}>
            <Text style={[bodyType.bold, styles.tagText, {color: colors.primary}]}>
              PLAYOFFS INCOMING
            </Text>
          </View>
        </View>
      ) : (
        // No regular-season scores resolved yet — keep the reset framing
        // without an empty podium.
        <View style={[styles.card, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
          <Text style={[bodyType.regular, styles.subtitle, {color: colors.textSecondary}]}>
            Regular season closed. Playoff scoreboard resets — everyone starts fresh.
          </Text>
          <View style={[styles.tag, {backgroundColor: colors.primary + '22', borderColor: colors.primary}]}>
            <Text style={[bodyType.bold, styles.tagText, {color: colors.primary}]}>
              PLAYOFFS INCOMING
            </Text>
          </View>
        </View>
      )}

      <Pressable
        onPress={() => navigation.navigate('LeaderboardTab')}
        style={({pressed}) => [
          styles.cta,
          {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel="See the regular season final standings">
        <Text style={[bodyType.bold, styles.ctaText, {color: colors.textPrimary}]}>
          See final standings
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
  cardLabel:  {fontSize: 11, letterSpacing: 2, marginBottom: spacing.xs},
  podiumRow:  {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  medal:      {fontSize: 20, width: 28, textAlign: 'center'},
  podiumName: {flex: 1, letterSpacing: -0.3},
  podiumPts:  {fontSize: 14},
  youRow:     {fontSize: 13, marginTop: spacing.xs},
  subtitle:   {fontSize: 14, lineHeight: 20, marginTop: spacing.xs},
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
