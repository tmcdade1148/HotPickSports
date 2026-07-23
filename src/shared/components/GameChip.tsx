// GameChip — ONE read-only component for rendering a single game.
// Home Module Map slice 3, updated by the Game Chip Redesign (v1.2, 2026-07-22).
// Three states: PRE / LIVE / FINAL.
//
// This chip DISPLAYS a game. It never inputs, never computes, never fetches.
// Anything interactive (tap-to-pick, set-HotPick) belongs to the wrapper — see
// SeasonMatchCard. The flame and lock icons are the wrapper's too; this file has
// neither.
//
// The rules this component makes structural rather than remembered:
//
//   Rule 9  — win/loss and points come from the SERVER, never a client
//             comparison. The box resolves ONLY on `isFinal && earnedPoints !==
//             null`, and a score greens ONLY on `isFinal && winnerTeam !== null`.
//             isFinal is the OUTER gate: the scored-picks table can drift (a
//             FINAL-set points value while is_correct is still null, or a stray
//             points on a non-final row), so isFinal stops any stray points /
//             winner value rendering a result before the game is truly final.
//             In the FINAL-but-not-yet-scored window earnedPoints/winnerTeam are
//             still null, so the chip shows the neutral stake and no green. There
//             is deliberately NO away_score/home_score comparison in this file.
//   Rule 10 — status is read through gameStatus.ts, which lowercases before
//             comparing. ESPN writes 'FINAL', the simulator writes 'final'; both
//             land in the same branch here.
//   Rule 1  — no flame. Ever. The flame/lock live in SeasonMatchCard's column.
//   Rule 2  — the left box is unsigned and neutral until the game is FINAL and
//             the server has scored the pick (isFinal && earnedPoints !== null).
//             It shows the STAKE (rank or 1) until then, so a signed or coloured
//             number cannot appear during PRE/LIVE.
//   Rule 3  — nothing goes green/red before FINAL, and the only thing that moves
//             is the LIVE dot's opacity. Scores render during LIVE but stay
//             uncoloured (winnerTeam is null until FINAL). (The dot pulses per
//             Tom's explicit call, 2026-07-18.)
//
// FINAL result signals: the winning team's score is greened (from winner_team),
// and the box shows the server's earned points, signed and coloured by its sign.
// No ✓/✗ marks — colour IS the signal. A standard win's +1 is green; a HotPick
// miss's −rank is the only red a chip can show.

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
   * Server-computed earned points (`season_picks.points`). REQUIRED — not
   * optional — so rule 9 holds by construction: the box cannot show a result
   * the server didn't supply. `null` = no pick or not yet scored, and renders
   * the neutral STAKE (see `points`) instead of a signed/coloured value.
   */
  earnedPoints: number | null;
  /**
   * Winning team code (`season_games.winner_team`). REQUIRED. A score greens
   * only when this is non-null and matches that side — never from an
   * away_score/home_score comparison (rule 9). `null` before FINAL+scored.
   */
  winnerTeam: string | null;
  /**
   * Which side the Player picked, so the chip knows which name to emphasise.
   * `null` = no pick, so neither side is emphasised.
   */
  pickedSide: 'home' | 'away' | null;
  /** Display nicknames. Fall back to the raw team codes on the game. */
  awayName?: string;
  homeName?: string;
  /** Team records, e.g. "10-2". Rendered as small muted text beside the name. */
  awayRecord?: string | null;
  homeRecord?: string | null;
  /**
   * The number in the left box BEFORE the server scores the pick — the STAKE.
   * REQUIRED — the box renders on every instance. On a standard Picks game this
   * is 1; on a HotPick it is the game's rank (`frozen_rank ?? rank`).
   */
  points: number;
  /**
   * The label under the box value, supplied by the wrapper ("HotPick Points" or
   * "PT"). REQUIRED. The chip renders it verbatim and never derives it — it
   * carries the label, not the HotPick STATUS, so no later branch here can
   * reach for "is this a HotPick" and pull wrapper logic back into the chip.
   */
  pointsLabel: string;
  /**
   * Presentation-only box tint {background, text}. Supplied by the wrapper
   * (orange + on-primary for a HotPick box; omitted for a standard box, which
   * falls back to the neutral surface). The chip applies the colours it is
   * handed and decides nothing - it carries the box's COLOURS, not the HotPick
   * status. The FINAL resolve still colours the number green/red over this
   * background; `text` is the pre-resolve (neutral) number + label colour.
   */
  boxTint?: {background: string; text: string};
  /**
   * Whether the chip renders its OWN status row (LIVE + period/clock, FINAL).
   * Default true, because on Picks and the Ladder nothing sits above the chip
   * to say what state the game is in.
   *
   * Home's HOTPICK module passes false: its title line already carries the
   * status, and two status lines on one card is a duplicate.
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
  earnedPoints,
  winnerTeam,
  pickedSide,
  awayName,
  homeName,
  awayRecord,
  homeRecord,
  points,
  pointsLabel,
  boxTint,
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

  // Left box (rule 2 / rule 9). Resolves ONLY on isFinal && earnedPoints !== null.
  // isFinal is the outer guard: scored-picks state can drift (points set while a
  // game isn't truly final / is_correct still null), so it stops a stray points
  // value rendering a signed/coloured result before FINAL. In the FINAL-but-not-
  // yet-scored window earnedPoints is still null, so the box shows the neutral
  // stake. The `−` is a true minus, matching the app.
  const boxValue =
    isFinal && earnedPoints !== null
      ? earnedPoints > 0
        ? `+${earnedPoints}`
        : earnedPoints < 0
          ? `−${Math.abs(earnedPoints)}`
          : '0'
      : String(points);
  const boxColor =
    isFinal && earnedPoints !== null
      ? earnedPoints > 0
        ? colors.gameWon
        : earnedPoints < 0
          ? colors.gameLost
          : colors.textPrimary
      : boxTint?.text ?? colors.textPrimary;

  // Score colour (rule 3 / rule 9). Only the WINNER's score greens, and only at
  // FINAL (isFinal && winnerTeam !== null) — never from a score comparison, and
  // never red. The isFinal gate matches the box, so a stray winner value can't
  // green a score before the game is final.
  const awayScoreColor =
    isFinal && winnerTeam !== null && game.away_team === winnerTeam
      ? colors.gameWon
      : colors.textPrimary;
  const homeScoreColor =
    isFinal && winnerTeam !== null && game.home_team === winnerTeam
      ? colors.gameWon
      : colors.textPrimary;

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

  // Picked team stands out by SIZE + WEIGHT + TINT, so the distinction survives
  // greyscale and doesn't depend on colour alone (spec §6.2). With no pick,
  // neither side is emphasised and both render primary.
  const emphasis = (isPicked: boolean) =>
    pickedSide === null || isPicked
      ? {font: bodyType.bold, color: colors.textPrimary, size: 16}
      : {font: bodyType.regular, color: colors.textSecondary, size: 13};
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
    // The chip IS the whole card: one outlined pill holding [box] | divider |
    // [game block]. Reproduced identically wherever a game renders, so callers
    // should not wrap it in a second card.
    <View style={[styles.pill, {borderColor: colors.border, backgroundColor: colors.surface}]}>
      {/* Left box — permanent, on every instance. Neutral stake until FINAL +
          scored; then signed + coloured. The label ("HotPick Points" or "PT") is
          passed in by the wrapper — the chip renders it verbatim and carries no
          HotPick status. No flame here: the flame/lock live in SeasonMatchCard's
          column (rule 1). */}
      <View style={[styles.ptsBox, {backgroundColor: boxTint?.background ?? colors.surfaceElevated}]}>
        <Text style={[bodyType.bold, styles.ptsValue, {color: boxColor}]}>
          {boxValue}
        </Text>
        <Text style={[bodyType.bold, styles.ptsLabel, {color: boxTint?.text ?? colors.textSecondary}]}>
          {pointsLabel}
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
          gap to the right of the longest name rather than flushed to the edge.
          Each name carries its record inline as small muted text; the home team
          drops the old "@" prefix (spec §6.2). */}
      {/* PRE kickoff renders ABOVE the matchup (no scores in this state). */}
      {!showScores ? (
        <Text style={[bodyType.regular, styles.kickoff, {color: colors.textSecondary}]}>
          {formatKickoff(game.kickoff_at)}
        </Text>
      ) : null}

      <View style={styles.matchupRow}>
        <View style={styles.namesCol}>
          <View style={styles.nameRow}>
            <Text
              style={[awayEmphasis.font, styles.teamName, {color: awayEmphasis.color, fontSize: awayEmphasis.size}]}
              numberOfLines={1}>
              {away.toUpperCase()}
            </Text>
            {awayRecord ? (
              <Text style={[bodyType.regular, styles.record, {color: colors.textSecondary}]}>
                {awayRecord}
              </Text>
            ) : null}
          </View>
          <View style={styles.nameRow}>
            <Text
              style={[homeEmphasis.font, styles.teamName, {color: homeEmphasis.color, fontSize: homeEmphasis.size}]}
              numberOfLines={1}>
              {home.toUpperCase()}
            </Text>
            {homeRecord ? (
              <Text style={[bodyType.regular, styles.record, {color: colors.textSecondary}]}>
                {homeRecord}
              </Text>
            ) : null}
          </View>
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
    textAlign: 'center',
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  teamName: {
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },
  record: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
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
