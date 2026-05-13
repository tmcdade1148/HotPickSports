// src/shell/components/home/GamesLiveHero.tsx
// Spec §6.4.3 — games_live row.
//
// Eyebrow: "LIVE."
// Hero: HotPick game with live score (Realtime via nflStore.liveScores).
// Point-impact ticker: "+N if this holds" / "−N if this holds".
// CTA: "Open Games tab."

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {HotPickCinematic} from './HotPickCinematic';
import {getTeamColors} from './teamColors';
import {getContextGreeting} from './salutation';

export function GamesLiveHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const userHotPick     = useNFLStore(s => s.userHotPick);
  const userHotPickGame = useNFLStore(s => s.userHotPickGame);
  const liveScores      = useNFLStore(s => s.liveScores);
  const currentPhase    = useNFLStore(s => s.currentPhase);

  const greeting = getContextGreeting(currentPhase, 'live', 1, null);

  const gameId = userHotPickGame?.game_id;
  const score  = gameId ? liveScores[gameId] : undefined;
  const away   = userHotPickGame?.away_team ?? '';
  const home   = userHotPickGame?.home_team ?? '';
  const awayMeta = getTeamColors(away);
  const homeMeta = getTeamColors(home);

  // Point-impact: +rank if user's pick is currently winning, −rank if losing.
  // frozen_rank lives on the GAME (set by nfl-rank-games Edge Function),
  // not the user's pick — per REFERENCE.md §7.
  const rank = userHotPickGame?.frozen_rank ?? 0;
  const picked = userHotPick?.picked_team;
  let impact: number | null = null;
  if (score && picked) {
    const pickedScore = picked === home ? score.homeScore : score.awayScore;
    const otherScore  = picked === home ? score.awayScore : score.homeScore;
    impact = pickedScore > otherScore ? rank : pickedScore < otherScore ? -rank : null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        {greeting}
      </Text>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.primary}]}>
        LIVE
      </Text>

      {userHotPickGame && (
        <HotPickCinematic
          mode="live"
          awayTeam={away}
          awayCity={awayMeta.city}
          awayColor={awayMeta.primary}
          homeTeam={home}
          homeCity={homeMeta.city}
          homeColor={homeMeta.primary}
          pickedTeam={picked ?? undefined}
          frozenRank={rank}
          liveScore={score ? {
            away: score.awayScore,
            home: score.homeScore,
            periodLabel: formatPeriod(score),
          } : undefined}
        />
      )}

      {impact !== null && (
        <Text style={[monoType.regular, styles.impact, {color: impact > 0 ? colors.success : colors.error}]}>
          {impact > 0 ? '+' : ''}{impact} if this holds
        </Text>
      )}

      <Pressable
        onPress={() => navigation.navigate('Games')}
        style={({pressed}) => [
          styles.cta,
          {backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel="Open the Games tab">
        <Text style={[bodyType.bold, styles.ctaText]}>Open Games tab</Text>
      </Pressable>
    </View>
  );
}

function formatPeriod(score: {currentPeriod: number | null; gameClock: string | null}): string {
  const periodStr = score.currentPeriod != null ? `Q${score.currentPeriod}` : '';
  const clock     = score.gameClock ?? '';
  if (periodStr && clock) return `${periodStr} · ${clock}`;
  return periodStr || clock || 'LIVE';
}

const styles = StyleSheet.create({
  wrap:       {paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md},
  salutation: {fontSize: 13},
  eyebrow:    {fontSize: 11, letterSpacing: 2},
  impact:     {fontSize: 13, letterSpacing: 0.5, textAlign: 'left'},
  cta: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  ctaText: {fontSize: 16, color: '#FFFFFF', letterSpacing: 0.5, textTransform: 'uppercase'},
});
