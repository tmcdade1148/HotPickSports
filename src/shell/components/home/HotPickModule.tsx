// HotPickModule — Home's HOTPICK module (Home Module Map v4, module 5).
//
// "The module is a GameChip wearing a flame." A HOTPICK eyebrow — rendered
// through ModuleSection so it matches CONTESTS / LEAGUES exactly (same casing,
// weight, type) with the BRANDED flame TRAILING the word — over the same
// GameChip the Picks screen renders. The chip shows its OWN status line
// (LIVE/FINAL + clock) and the orange HotPick border. Nothing here is bespoke
// game markup.
//
// The trailing mark is ChipFlameColor, NOT GamesTagFlame: same branded artwork,
// but ChipFlameColor themes its base bar via barColor (we pass textPrimary) so
// it survives dark mode. GamesTagFlame bakes a #000000 base bar that vanishes on
// the near-black Home background in the dark theme — right on the orange Picks
// CTA, wrong here.
//
// TWO placements, one owner of the HotPick presentation:
//   • Default (sibling)  — the locked / live rows. StateHero renders it directly
//     beneath the ACTION module; it wears the ModuleSection eyebrow and returns
//     null when there's no HotPick. UNCHANGED.
//   • embedded (picks_open) — pulled UP INSIDE the ACTION card (spec §6.4). No
//     ModuleSection eyebrow and no outer margin: a lean HOTPICK caption + the
//     chip, aligned to the card padding. With `beckon`, an empty HotPick shows a
//     dashed beckon sized to the filled chip so tagging it causes no reflow.
//
// Compliance the module inherits from the chip, by construction:
//   Rule 1  — the flame lives in the eyebrow/caption, never inside the chip.
//   Rule 2  — the box is unsigned and neutral until the server scores the pick.
//   Rule 3  — no green/red during live; the chip's LIVE dot is the only motion.
//   Rule 9  — the result comes from the server (earned points + winner_team),
//             never a client score comparison.
//   Rule 10 — status is read through gameStatus.ts, case-insensitively.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {ChipFlameColor} from '@shared/components/ChipFlameColor';
import {GameChip, fromGameScore} from '@shared/components/GameChip';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {isFinalStatus} from '@sports/nfl/utils/gameStatus';
import {useTheme} from '@shell/theme';
import {borderRadius, displayType, sectionHeaderType, spacing} from '@shared/theme';
import {ModuleSection} from './ModuleSection';

// The empty beckon must occupy the same footprint as the filled chip so
// designating a HotPick never reflows the picks_open surface (spec §6.4, trap
// #4). The filled chip (team names at 1.5×, a kickoff line) renders ~80pt tall;
// device-verify this against the real chip and nudge if it jumps.
const HOTPICK_SLOT_MIN_HEIGHT = 80;

export interface HotPickModuleProps {
  /** picks_open surface: render lean and IN the ACTION card — a small HOTPICK
   *  caption + the chip, no ModuleSection eyebrow and no outer margin, aligned
   *  to the card padding. Default false → standalone sibling module (the locked
   *  / live rows, unchanged). */
  embedded?: boolean;
  /** With no HotPick yet, render the dashed beckon instead of null. Only used by
   *  the embedded picks_open surface — the sibling module stays absent on a
   *  locked/live week with no HotPick. Default false. */
  beckon?: boolean;
  /** Beckon copy escalation — true when the HotPick is the only thing left. */
  beckonUrgent?: boolean;
}

export function HotPickModule({
  embedded = false,
  beckon = false,
  beckonUrgent = false,
}: HotPickModuleProps) {
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

  // No HotPick, no game, or no real rank → the chip's box is mandatory and a
  // "0 pts" box would be a lie. Empty branches:
  //   • embedded + beckon + NO pick → the dashed beckon (picks_open surface).
  //   • a pick tagged but game/rank still loading → nothing (the Player HAS
  //     tagged it; don't flash the beckon back at them).
  //   • otherwise → null (the sibling module simply doesn't render).
  if (!userHotPick || !userHotPickGame || rank == null) {
    if (embedded && beckon && !userHotPick) {
      return embeddedFrame(
        colors,
        <Pressable
          onPress={() => navigation.navigate('PicksTab')}
          style={({pressed}) => [
            styles.beckon,
            {borderColor: colors.primary, opacity: pressed ? 0.7 : 1},
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            beckonUrgent ? 'One thing left — choose your HotPick' : 'Pick your HotPick'
          }>
          <Text style={[displayType.display, styles.beckonText, {color: colors.primary}]}>
            {beckonUrgent ? 'ONE THING LEFT' : 'PICK YOUR HOTPICK'}
          </Text>
        </Pressable>,
      );
    }
    return null;
  }

  const awayName = teamNickname(userHotPickGame.away_team);
  const homeName = teamNickname(userHotPickGame.home_team);

  // The tap target is the chip. The season_games row overlaid with the fresher
  // live payload; the chip renders its own LIVE/FINAL status + clock and the
  // orange HotPick border. Result comes from the SERVER — earned points +
  // winner_team, never a score comparison (rule 9).
  const chip = (
    <Pressable
      onPress={() => navigation.navigate('PicksTab')}
      style={({pressed}) => [
        embedded ? styles.chipWrapEmbedded : styles.chipWrap,
        {opacity: pressed ? 0.85 : 1},
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Your HotPick: ${userHotPick.picked_team ?? ''} in ${awayName} at ${homeName}`}>
      <GameChip
        game={{...userHotPickGame, ...fromGameScore(hotPickScore)}}
        points={rank}
        earnedPoints={userHotPick.points}
        winnerTeam={userHotPickGame.winner_team}
        pointsLabel="HotPick Point"
        scoresRightInset={spacing.md}
        // On Home the team names ARE the headline — 1.5× — and the day/time
        // line steps back a touch so they carry the chip.
        teamNameScale={1.5}
        kickoffFontSize={12}
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

  if (embedded) {
    return embeddedFrame(colors, chip);
  }

  return (
    <ModuleSection
      label="HOTPICK"
      // Branded flame, base bar themed via barColor so it reads on both light
      // and dark Home backgrounds (textPrimary: dark on light, white on dark).
      labelTrailing={<ChipFlameColor size={18} barColor={colors.textPrimary} />}>
      {chip}
    </ModuleSection>
  );
}

// The lean in-card frame (picks_open): a small HOTPICK caption + branded flame
// above the chip/beckon, aligned to the ACTION card padding (no outer margin, no
// ModuleSection eyebrow). One helper so the caption is identical over the chip
// and the beckon — only the box swaps, so the caption never shifts.
function embeddedFrame(colors: any, child: React.ReactNode) {
  return (
    <View style={styles.embeddedWrap}>
      <View style={styles.embeddedCaption}>
        <Text style={[styles.embeddedCaptionText, {color: colors.textTertiary}]}>
          HOTPICK
        </Text>
        <View style={styles.embeddedCaptionFlame}>
          <ChipFlameColor size={16} barColor={colors.textPrimary} />
        </View>
      </View>
      {child}
    </View>
  );
}

const styles = StyleSheet.create({
  // ModuleSection only pads the eyebrow row; children carry their own
  // horizontal inset, matching the Recap/History cards. (Sibling module.)
  chipWrap: {
    marginHorizontal: spacing.lg,
  },
  // Embedded in the ACTION card: the card padding is the inset, so no margin.
  chipWrapEmbedded: {},
  embeddedWrap: {
    marginTop: spacing.md,
  },
  embeddedCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  embeddedCaptionText: {
    ...sectionHeaderType,
    fontSize: 13,
    letterSpacing: 1,
  },
  embeddedCaptionFlame: {
    marginLeft: 6,
  },
  // Dashed beckon, sized to the filled chip so tagging the HotPick doesn't
  // reflow the surface (spec §6.4). Copy is a noun — "PICK YOUR HOTPICK" —
  // never "flame it" (trap #3).
  beckon: {
    minHeight: HOTPICK_SLOT_MIN_HEIGHT,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  beckonText: {
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
