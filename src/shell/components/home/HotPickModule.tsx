// HotPickModule — Home's HOTPICK module (Home Module Map v4, module 5).
//
// "The module is a GameChip wearing a flame." That is literally the structure:
// a title row carrying the flame + status, and the same GameChip the Picks
// screen renders. Nothing here is bespoke game markup.
//
// It is a SIBLING of the ACTION module (PicksOpenHero), rendered directly
// beneath it by StateHero — not nested inside it. ACTION owns the countdown,
// the CTA and the week progress; this module owns the HotPick and nothing
// else. There is deliberately no countdown here: the map's "One countdown,
// ever" is ACTION's, and the chip's PRE state already shows kickoff.
//
// Compliance the module inherits from the chip, by construction:
//   Rule 1  — the flame lives in the TITLE, never inside the chip.
//   Rule 2  — the box is unsigned and neutral until the server scores the pick.
//   Rule 3  — no green/red during live; the LIVE dot is the only motion.
//   Rule 9  — the result comes from the server (earned points + winner_team),
//             never a client score comparison.
//   Rule 10 — status is read through gameStatus.ts, case-insensitively.

import React, {useEffect, useRef} from 'react';
import {Text} from '@shared/components/AppText';
import {Animated, Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Flame} from 'lucide-react-native';
import {GameChip, fromGameScore} from '@shared/components/GameChip';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {isFinalStatus, isLiveStatus} from '@sports/nfl/utils/gameStatus';
import {useTheme} from '@shell/theme';
import {bodyType, spacing} from '@shared/theme';

export function HotPickModule() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const userHotPick = useNFLStore(s => s.userHotPick);
  const userHotPickGame = useNFLStore(s => s.userHotPickGame);
  const liveScores = useNFLStore(s => s.liveScores);
  const seasonTeams = useSeasonStore(s => s.config?.teams);

  // Live payload preferred over the season_games row — it's the fresher of the
  // two during play.
  const hotPickScore = userHotPickGame
    ? liveScores[userHotPickGame.game_id]
    : undefined;

  // STATUS ONLY, via gameStatus.ts (lowercases before comparing, so ESPN's
  // 'FINAL' and the simulator's 'final' resolve the same — rule 10).
  const hotPickStatus = hotPickScore?.status ?? userHotPickGame?.status;
  const isLive = isLiveStatus(hotPickStatus);
  const isFinal = isFinalStatus(hotPickStatus);

  // The LIVE dot is the only animated value on this card.
  const dotPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isLive) {
      dotPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, {toValue: 0.3, duration: 550, useNativeDriver: true}),
        Animated.timing(dotPulse, {toValue: 1, duration: 550, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, dotPulse]);

  // Nicknames from SeasonConfig.teams[].shortName — the same source the Picks
  // screen uses, so the two screens can't drift.
  const teamNickname = (code: string | null | undefined): string =>
    (code ? seasonTeams?.find(t => t.code === code)?.shortName : null) ?? code ?? '';

  const periodLabel = (() => {
    if (!isLive) return null;
    const period = hotPickScore?.currentPeriod ?? userHotPickGame?.current_period;
    const clock = hotPickScore?.gameClock ?? userHotPickGame?.game_clock;
    const parts: string[] = [];
    if (period != null) parts.push(`Q${period}`);
    if (clock) parts.push(clock);
    return parts.length > 0 ? parts.join(' · ') : null;
  })();

  const rank = userHotPickGame?.frozen_rank ?? userHotPickGame?.rank ?? null;

  // No HotPick, no game, or no real rank → no module. The chip's PTS box is
  // mandatory and a "0 PTS" box would be a lie.
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
        {isLive && (
          <>
            <Animated.View
              style={[styles.liveDot, {backgroundColor: colors.live, opacity: dotPulse}]}
            />
            <Text style={[bodyType.bold, styles.statusWord, {color: colors.gameWon}]}>
              LIVE
            </Text>
            {periodLabel && (
              <Text style={[bodyType.regular, styles.statusMeta, {color: colors.textSecondary}]}>
                {periodLabel}
              </Text>
            )}
          </>
        )}
        {isFinal && (
          <Text style={[bodyType.bold, styles.statusWord, {color: colors.gameLost}]}>
            • FINAL
          </Text>
        )}
      </View>

      {/* One contract: the season_games row overlaid with the fresher live
          payload. The result comes straight from the SERVER — earned points
          (season_picks.points) and winner_team — never a score comparison
          (rule 9). */}
      <GameChip
        game={{...userHotPickGame, ...fromGameScore(hotPickScore)}}
        points={rank}
        earnedPoints={userHotPick.points}
        winnerTeam={userHotPickGame.winner_team}
        pointsLabel="HotPick Points"
        pickedNameColor={colors.primary}
        boxTint={isFinal ? undefined : {background: colors.primary, text: colors.onPrimary}}
        showStatus={false}
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
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
  },
  statusWord: {
    fontSize: 13,
    letterSpacing: 0.8,
  },
  statusMeta: {
    fontSize: 12,
  },
});
