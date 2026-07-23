// HotPickModule — Home's HOTPICK module (Home Module Map v4, module 5).
//
// "The module is a GameChip wearing a flame." A title row carrying the flame +
// "Your HotPick", and the same GameChip the Picks screen renders — now showing
// its OWN status line (LIVE/FINAL + clock) inside the chip, and carrying the
// orange HotPick border. Nothing here is bespoke game markup.
//
// It is a SIBLING of the ACTION module (PicksOpenHero), rendered directly
// beneath it by StateHero — not nested inside it. ACTION owns the countdown,
// the CTA and the week progress; this module owns the HotPick and nothing else.
// There is deliberately no countdown here: the map's "One countdown, ever" is
// ACTION's, and the chip's PRE state already shows kickoff.
//
// Compliance the module inherits from the chip, by construction:
//   Rule 1  — the flame lives in the TITLE, never inside the chip.
//   Rule 2  — the box is unsigned and neutral until the server scores the pick.
//   Rule 3  — no green/red during live; the chip's LIVE dot is the only motion.
//   Rule 9  — the result comes from the server (earned points + winner_team),
//             never a client score comparison.
//   Rule 10 — status is read through gameStatus.ts, case-insensitively.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Flame} from 'lucide-react-native';
import {GameChip, fromGameScore} from '@shared/components/GameChip';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {isFinalStatus} from '@sports/nfl/utils/gameStatus';
import {useTheme} from '@shell/theme';
import {bodyType, spacing} from '@shared/theme';

export function HotPickModule() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const userHotPick = useNFLStore(s => s.userHotPick);
  const userHotPickGame = useNFLStore(s => s.userHotPickGame);
  const liveScores = useNFLStore(s => s.liveScores);
  const seasonTeams = useSeasonStore(s => s.config?.teams);

  // Live payload preferred over the season_games row — fresher during play. The
  // chip reads its LIVE/FINAL status and clock straight from this merged game.
  const hotPickScore = userHotPickGame
    ? liveScores[userHotPickGame.game_id]
    : undefined;

  // FINAL drives the panel tint (neutral at FINAL so the resolve reads). The
  // chip owns the status line + dot now, so that's all we need here (rule 10).
  const hotPickStatus = hotPickScore?.status ?? userHotPickGame?.status;
  const isFinal = isFinalStatus(hotPickStatus);

  // Nicknames from SeasonConfig.teams[].shortName — the same source the Picks
  // screen uses, so the two screens can't drift.
  const teamNickname = (code: string | null | undefined): string =>
    (code ? seasonTeams?.find(t => t.code === code)?.shortName : null) ?? code ?? '';

  const rank = userHotPickGame?.frozen_rank ?? userHotPickGame?.rank ?? null;

  // No HotPick, no game, or no real rank → no module. The chip's box is
  // mandatory and a "0 pts" box would be a lie.
  if (!userHotPick || !userHotPickGame || rank == null) return null;

  const awayName = teamNickname(userHotPickGame.away_team);
  const homeName = teamNickname(userHotPickGame.home_team);

  return (
    <Pressable
      onPress={() => navigation.navigate('PicksTab')}
      style={({pressed}) => [styles.module, {opacity: pressed ? 0.85 : 1}]}
      accessibilityRole="button"
      accessibilityLabel={`Your HotPick: ${userHotPick.picked_team ?? ''} in ${awayName} at ${homeName}`}>
      <View style={styles.titleRow}>
        <Flame size={14} color={colors.primary} strokeWidth={2.5} />
        <Text style={[bodyType.bold, styles.title, {color: colors.primary}]}>
          Your HotPick
        </Text>
      </View>

      {/* The season_games row overlaid with the fresher live payload. The chip
          renders its own LIVE/FINAL status + clock inside itself, and the orange
          HotPick border. Result comes from the SERVER — earned points +
          winner_team, never a score comparison (rule 9). */}
      <GameChip
        game={{...userHotPickGame, ...fromGameScore(hotPickScore)}}
        points={rank}
        earnedPoints={userHotPick.points}
        winnerTeam={userHotPickGame.winner_team}
        pointsLabel="HotPick Point"
        scoresRightInset={spacing.md}
        pickedNameColor={colors.primary}
        outlineColor={colors.primary}
        boxTint={isFinal ? undefined : {background: colors.primary, text: colors.onPrimary}}
        pickedSide={
          userHotPick.picked_team === userHotPickGame.home_team
            ? 'home'
            : userHotPick.picked_team === userHotPickGame.away_team
              ? 'away'
              : null
        }
        awayName={awayName}
        homeName={homeName}
        awayRecord={userHotPickGame.away_record}
        homeRecord={userHotPickGame.home_record}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  module: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  title: {
    fontSize: 13,
  },
});
