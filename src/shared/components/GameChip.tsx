// GameChip — ONE read-only component for rendering a single game.
// Slice 3 of the Home Module Map (v4). Three states: PRE / LIVE / FINAL.
//
// This chip DISPLAYS a game. It never inputs, never computes, never fetches.
// Anything interactive (tap-to-pick, set-HotPick, locking) belongs to the
// wrapper around it — see SeasonMatchCard. Anything that adds a flame or a
// points box is the Slice 5 HOTPICK module, also a wrapper. Not this file.
//
// The rules this component makes structural rather than remembered:
//
//   Rule 9  — win/loss comes from the server. `isCorrect` is a REQUIRED prop,
//             so a FINAL result cannot render without the server's value. There
//             is deliberately no score comparison anywhere in this file; the
//             chip is incapable of deriving a result client-side.
//   Rule 10 — status is read through gameStatus.ts, which lowercases before
//             comparing. ESPN writes 'FINAL', the simulator writes 'final';
//             both land in the same branch here.
//   Rule 1  — no flame. Ever. Not even greyed out.
//   Rule 2  — no points, signed or unsigned. The chip has no PTS box, so it
//             cannot show a signed number before FINAL.
//   Rule 3  — nothing goes green/red during LIVE, and the only thing that moves
//             is the LIVE dot's opacity. Scores, colours and points hold still.
//             (The dot pulses per Tom's explicit call, 2026-07-18, overriding
//             the map's line 127 "steady, not pulsing" — the map is stale on
//             this point. The rest of rule 3 is untouched.)
//
// The FINAL result signal is the PICKED team's score, coloured. No ✓/✗ marks —
// the colour IS the signal.

import React, {useEffect, useRef} from 'react';
import {Text} from '@shared/components/AppText';
import {Animated, StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme';
import {bodyType, borderRadius, spacing} from '@shared/theme';
import {isFinalStatus, isLiveStatus} from '@sports/nfl/utils/gameStatus';

/**
 * The normalized game shape the chip consumes — snake_case, matching
 * `DbSeasonGame`, because that is what most render sites already speak.
 * Live-score payloads arrive camelCase from nflStore; use `fromGameScore`
 * below to fold one into this shape rather than teaching the chip two shapes.
 */
export interface GameChipGame {
  away_team: string;
  home_team: string;
  away_score?: number | null;
  home_score?: number | null;
  status?: string | null;
  current_period?: number | null;
  game_clock?: string | null;
  kickoff_at: string;
}

export interface GameChipProps {
  game: GameChipGame;
  /**
   * Server-computed result (`season_picks.is_correct`). REQUIRED — not
   * optional — so rule 9 holds by construction: there is no way to render a
   * FINAL result without the server having supplied one. `null` means no pick
   * or not yet scored, and renders the scores uncoloured.
   */
  isCorrect: boolean | null;
  /**
   * Which side the Player picked, so the chip knows WHICH score to colour at
   * FINAL. The caller already knows this — the chip does no team-string
   * matching of its own. `null` = no pick, nothing gets coloured.
   */
  pickedSide: 'home' | 'away' | null;
  /** Display nicknames. Fall back to the raw team codes on the game. */
  awayName?: string;
  homeName?: string;
  /**
   * The number in the left PTS box. REQUIRED — the box renders on every
   * instance of the chip, so there is no such thing as a chip without a value.
   * On a regular Picks game this is the game's rank (`frozen_rank ?? rank`).
   */
  points: number;
  /**
   * Slice 5 seam. OFF by default, which is the only mode this slice ships.
   *
   * When a later caller (the HOTPICK module) turns this on, the box gains a
   * sign and a result colour — and BOTH are gated on FINAL, so a signed or
   * coloured value can never appear before the game resolves (rule 2 / rule 3).
   * The colour still comes from `isCorrect`, never from a score comparison
   * (rule 9). A regular Picks game leaves this off and stays neutral+unsigned.
   */
  signedAtFinal?: boolean;
  /**
   * Whether the chip renders its OWN status row (LIVE + period/clock, FINAL).
   * Default true, because on Picks and the Ladder nothing sits above the chip
   * to say what state the game is in.
   *
   * Home's HOTPICK module passes false: its title line already carries the
   * status, and two status lines on one card is a duplicate. Suppressing the
   * row changes nothing else — the FINAL score colour, the PTS box, and the
   * PRE kickoff line are all unaffected.
   */
  showStatus?: boolean;
}

/**
 * Adapter: nflStore's camelCase live-score payload → the chip's snake_case
 * fields. Spread the result over a base game to get one contract:
 *   <GameChip game={{...dbGame, ...fromGameScore(liveScores[id])}} ... />
 */
export function fromGameScore(score?: {
  homeScore: number;
  awayScore: number;
  status: string;
  currentPeriod: number | null;
  gameClock: string | null;
}): Partial<GameChipGame> {
  if (!score) return {};
  return {
    home_score: score.homeScore,
    away_score: score.awayScore,
    status: score.status,
    current_period: score.currentPeriod,
    game_clock: score.gameClock,
  };
}

/** "Thu, 8:20 PM" */
function formatKickoff(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let hours = date.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const minutes = date.getMinutes();
  const minStr = minutes < 10 ? `0${minutes}` : String(minutes);
  return `${days[date.getDay()]}, ${hours}:${minStr} ${ampm}`;
}

export function GameChip({
  game,
  isCorrect,
  pickedSide,
  awayName,
  homeName,
  points,
  signedAtFinal = false,
  showStatus = true,
}: GameChipProps) {
  const {colors} = useTheme();

  // Rule 10 — both predicates lowercase before comparing, so 'FINAL' (ESPN)
  // and 'final' (sim) resolve identically. Never compare game.status directly.
  const isFinal = isLiveStatus(game.status) ? false : isFinalStatus(game.status);
  const isLive = isLiveStatus(game.status);
  const showScores = isLive || isFinal;

  const away = awayName ?? game.away_team;
  const home = homeName ?? game.home_team;

  // FINAL only. `isCorrect` is the sole input — no score comparison (rule 9).
  // During LIVE this stays null, so nothing goes green or red (rule 3).
  const resultColor =
    isFinal && isCorrect !== null
      ? isCorrect
        ? colors.gameWon
        : colors.gameLost
      : null;

  const awayScoreColor =
    resultColor && pickedSide === 'away' ? resultColor : colors.textPrimary;
  const homeScoreColor =
    resultColor && pickedSide === 'home' ? resultColor : colors.textPrimary;

  // Left PTS box. `signedAtFinal` is off for every caller in this slice, so
  // both branches below collapse to "unsigned, neutral" today. The sign and
  // the colour are BOTH gated on `resultColor` — which only exists at FINAL —
  // so Slice 5 can flip the flag on without any risk of a signed or coloured
  // number appearing during PRE or LIVE.
  const boxIsResolved = signedAtFinal && resultColor !== null;
  const boxColor = boxIsResolved ? resultColor : colors.textPrimary;
  const boxValue =
    boxIsResolved && isCorrect !== null
      ? `${isCorrect ? '+' : '−'}${Math.abs(points)}`
      : String(points);

  // LIVE dot pulse — the ONLY animated value in this component. It drives the
  // dot's opacity and nothing else: it is not composed into any text, score,
  // or container style, so it cannot leak. Stops and resets whenever the game
  // isn't live, so a finished game never leaves a loop running.
  const dotPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isLive) {
      dotPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, {
          toValue: 0.3,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.timing(dotPulse, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, dotPulse]);

  // Picked team stands out; the opponent reads as clearly secondary — lighter
  // weight AND a muted colour, so the distinction survives greyscale and
  // doesn't depend on colour alone. With no pick on the game, neither side is
  // emphasised and both render primary.
  const emphasis = (isPicked: boolean) =>
    pickedSide === null || isPicked
      ? {font: bodyType.bold, color: colors.textPrimary}
      : {font: bodyType.regular, color: colors.textSecondary};
  const awayEmphasis = emphasis(pickedSide === 'away');
  const homeEmphasis = emphasis(pickedSide === 'home');

  const periodLabel = (() => {
    if (!isLive) return null;
    const parts: string[] = [];
    if (game.current_period != null) parts.push(`Q${game.current_period}`);
    if (game.game_clock) parts.push(game.game_clock);
    return parts.length > 0 ? parts.join(' · ') : null;
  })();

  return (
    // The chip IS the whole card: one outlined pill holding [PTS box] |
    // divider | [game block]. Reproduced identically wherever a game renders,
    // so callers should not wrap it in a second card.
    <View style={[styles.pill, {borderColor: colors.border, backgroundColor: colors.surface}]}>
      {/* Left PTS box — permanent, on every instance. Neutral and unsigned for
          a regular Picks game; Slice 5 opts into sign+colour via
          `signedAtFinal`. No flame here: the flame and the "YOUR HOTPICK"
          title sit ABOVE the chip, added by the HOTPICK module (rule 1). */}
      <View style={[styles.ptsBox, {backgroundColor: colors.surfaceElevated}]}>
        <Text style={[bodyType.bold, styles.ptsValue, {color: boxColor}]}>
          {boxValue}
        </Text>
        <Text style={[bodyType.bold, styles.ptsLabel, {color: colors.textSecondary}]}>
          PTS
        </Text>
      </View>

      <View style={[styles.divider, {backgroundColor: colors.border}]} />

      <View style={styles.gameBlock}>
      {/* Status line — the chip carries its OWN status, because on Picks and
          the Ladder there is no title above it to say what state this is. */}
      {showStatus && isLive ? (
        <View style={styles.statusRow}>
          {/* The one moving thing in the chip. `opacity` is the only animated
              style, and it is applied to this dot alone. */}
          <Animated.View
            style={[
              styles.liveDot,
              {backgroundColor: colors.live, opacity: dotPulse},
            ]}
          />
          <Text style={[bodyType.bold, styles.statusText, {color: colors.live}]}>
            LIVE
          </Text>
          {periodLabel ? (
            <Text style={[bodyType.regular, styles.statusMeta, {color: colors.textSecondary}]}>
              {periodLabel}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showStatus && isFinal ? (
        <View style={styles.statusRow}>
          <Text style={[bodyType.bold, styles.statusText, {color: colors.textSecondary}]}>
            FINAL
          </Text>
        </View>
      ) : null}

      {/* Matchup. The names column does NOT flex, so the scores sit a fixed
          gap to the right of the longest name rather than flushed to the edge. */}
      <View style={styles.matchupRow}>
        <View style={styles.namesCol}>
          <Text
            style={[awayEmphasis.font, styles.teamName, {color: awayEmphasis.color}]}
            numberOfLines={1}>
            {away.toUpperCase()}
          </Text>
          <Text
            style={[homeEmphasis.font, styles.teamName, {color: homeEmphasis.color}]}
            numberOfLines={1}>
            {`@ ${home}`.toUpperCase()}
          </Text>
        </View>

        {showScores ? (
          <View style={styles.scoresCol}>
            <Text style={[bodyType.bold, styles.score, {color: awayScoreColor}]}>
              {game.away_score ?? '—'}
            </Text>
            <Text style={[bodyType.bold, styles.score, {color: homeScoreColor}]}>
              {game.home_score ?? '—'}
            </Text>
          </View>
        ) : null}
      </View>

      {/* PRE — kickoff, no scores. */}
      {!showScores ? (
        <Text style={[bodyType.regular, styles.kickoff, {color: colors.textSecondary}]}>
          {formatKickoff(game.kickoff_at)}
        </Text>
      ) : null}
      </View>
    </View>
  );
}

// Every colour is applied inline from useTheme() at the call site, so these
// are layout-only and need no theme parameter.
const styles = StyleSheet.create({
  // The whole card — one outlined pill. Starting proportions; per-screen
  // polish deferred.
  pill: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  ptsBox: {
    width: 74,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  ptsValue: {
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  ptsLabel: {
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
  },
  gameBlock: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    letterSpacing: 1,
  },
  statusMeta: {
    fontSize: 11,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  namesCol: {
    // Deliberately no flex — so the scores sit a fixed gap to the right of the
    // longest team name instead of being pushed to the far edge.
    gap: 2,
  },
  teamName: {
    fontSize: 15,
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },
  scoresCol: {
    marginLeft: spacing.lg,
    alignItems: 'flex-start',
    gap: 2,
  },
  score: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  kickoff: {
    fontSize: 12,
    marginTop: 2,
  },
});
