// GameChip — the ONE renderer for a game row, picks-open through FINAL.
// Unified Game Chip (spec v2.1, 2026-07-23): the editable card and the locked
// chip are the same component now. An `editable` flag turns the team rows and
// the flame into tap targets; otherwise the identical layout renders read-only.
// SeasonMatchCard owns pick/HotPick state and passes DOWN presentation values +
// handlers — this file renders them and decides nothing.
//
// The chip stays DUMB. It never learns what "HotPick" means. It receives:
//   - panel tint (boxTint), name colour (pickedNameColor), flame variant, lock,
//     outline colour — all computed by the wrapper from the state matrix.
//   - the resolve inputs (earnedPoints, winnerTeam) and renders them through the
//     gates below, never deriving a result itself.
//
// Rules made structural rather than remembered:
//   Rule 9  — win/loss and points come from the SERVER. The box resolves ONLY on
//             `isFinal && earnedPoints !== null`; a score greens ONLY on
//             `isFinal && winnerTeam !== null`. No away_score/home_score
//             comparison exists in this file.
//   Rule 10 — status via gameStatus.ts (lowercases before comparing).
//   LIVE compliance gate — during LIVE the box shows the neutral stake: no sign,
//             no green/red. Enforced by the isFinal gate above (isFinal is false
//             during LIVE, so the box can only show `points`).
//
// Two colour SYSTEMS, never crossed:
//   - RESULT colour = the box number. gameWon for a gain, gameLost ONLY for a
//     HotPick miss. Panels and scores never go red.
//   - STATUS colour = the LIVE/FINAL label. gameWon = in progress, gameLost =
//     ended (red on wins too — it describes game state, not outcome).

import React, {useEffect, useRef} from 'react';
import {Text} from '@shared/components/AppText';
import {Animated, StyleSheet, TouchableOpacity, View} from 'react-native';
import type {TextStyle} from 'react-native';
import {useTheme} from '@shell/theme';
import {bodyType, borderRadius, displayType, spacing} from '@shared/theme';
import {isFinalStatus, isLiveStatus} from '@sports/nfl/utils/gameStatus';
import {ChipFlameColor} from '@shared/components/ChipFlameColor';
import {ChipFlameDeselected} from '@shared/components/ChipFlameDeselected';
import {ChipLock} from '@shared/components/ChipLock';

/**
 * Normalized game shape — snake_case, matching `DbSeasonGame`. Live-score
 * payloads arrive camelCase from nflStore; fold one in via `fromGameScore`.
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

  // ── Interactivity ────────────────────────────────────────────────────────
  /** When true, team rows and the flame become tap targets. Default false. */
  editable?: boolean;
  /** Team tap → select. Called with the team CODE. Editable only. */
  onSelectTeam?: (teamCode: string) => void;
  /** Flame tap → designate HotPick. The guard lives in the wrapper. Editable only. */
  onPressFlame?: () => void;

  // ── Presentation (wrapper-computed; the chip never branches on HotPick) ────
  /** Which side the Player picked — drives which name is emphasised. */
  pickedSide: 'home' | 'away' | null;
  /** Colour for the PICKED name (teal / orange). Opponent stays muted; with no
   *  pick both names render neutral. */
  pickedNameColor?: string;
  /** Panel {background,text}. Orange for a HotPick-carrying chip; omit = neutral. */
  boxTint?: {background: string; text: string};
  /** Pill border colour override (orange for a HotPick chip). Omit = grey hairline. */
  outlineColor?: string;
  /** Flame artwork in the right slot. Default 'none'. */
  flame?: 'none' | 'deselected' | 'lit';
  /** Overlay/show a lock in the flame slot (read-only states). Default false. */
  lock?: boolean;

  // ── Panel content ─────────────────────────────────────────────────────────
  /** Top number before the server scores the pick — the STAKE (rank or 1). */
  points: number;
  /** Label under the number ("HotPick Points" / "PT"). Hidden when stacked. */
  pointsLabel: string;
  /** When set, the panel stacks: number over a rule over this (the frozen rank). */
  stackedRank?: number | null;
  /** Server earned points (`season_picks.points`). null until scored. Rule 9. */
  earnedPoints: number | null;
  /** Winning team code (`season_games.winner_team`). null until FINAL. Rule 9. */
  winnerTeam: string | null;

  // ── Display ───────────────────────────────────────────────────────────────
  awayName?: string;
  homeName?: string;
  awayRecord?: string | null;
  homeRecord?: string | null;
  /** Extra right inset (px) on the score column, so a specific surface can pull
   *  its scores left. Home's HotPick card passes it; the Picks screen omits it. */
  scoresRightInset?: number;
  /** Whether the chip renders its own status row. Default true. Home's HotPick
   *  card passes false (its title carries the status). */
  showStatus?: boolean;
}

/**
 * Adapter: nflStore's camelCase live-score payload → the chip's snake_case
 * fields. Spread over a base game: `{...dbGame, ...fromGameScore(liveScores[id])}`.
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
  editable = false,
  onSelectTeam,
  onPressFlame,
  pickedSide,
  pickedNameColor,
  boxTint,
  outlineColor,
  flame = 'none',
  lock = false,
  points,
  pointsLabel,
  stackedRank,
  earnedPoints,
  winnerTeam,
  awayName,
  homeName,
  awayRecord,
  homeRecord,
  scoresRightInset = 0,
  showStatus = true,
}: GameChipProps) {
  const {colors} = useTheme();

  // Rule 10 — both predicates lowercase before comparing.
  const isFinal = isLiveStatus(game.status) ? false : isFinalStatus(game.status);
  const isLive = isLiveStatus(game.status);
  const showScores = isLive || isFinal;

  const away = awayName ?? game.away_team;
  const home = homeName ?? game.home_team;

  // A locked game with no pick: no point was or can be earned (earnedPoints
  // stays null, so the box never resolves). Show an em-dash for the value and
  // mute both names so unpicked games recede behind games in play. Display only —
  // the resolve gate below is untouched.
  const noPickLocked = !editable && pickedSide === null;

  // Box (rule 9 + LIVE gate). Resolves ONLY at FINAL with a scored value; until
  // then it shows the neutral stake, so a signed/coloured number is impossible
  // during PRE/LIVE and in the FINAL-but-not-yet-scored window.
  const boxValue =
    isFinal && earnedPoints !== null
      ? earnedPoints > 0
        ? `+${earnedPoints}`
        : earnedPoints < 0
          ? `−${Math.abs(earnedPoints)}`
          : '0'
      : noPickLocked
        ? '0'
        : String(points);
  const boxColor =
    isFinal && earnedPoints !== null
      ? earnedPoints > 0
        ? colors.gameWon
        : earnedPoints < 0
          ? colors.gameLost
          : colors.textPrimary
      : boxTint?.text ?? colors.textPrimary;

  // The "pts" label under the number: white on an orange panel; at FINAL it
  // follows the resolved number's colour (green hit / red miss); muted otherwise.
  const labelColor =
    boxTint?.text ??
    (isFinal && earnedPoints !== null ? boxColor : colors.textSecondary);

  // Written-out unit, pluralised off the DISPLAYED number's magnitude — singular
  // ONLY when |value| === 1, so 0 and −1 pluralise correctly (0 → "points",
  // −1 → "point"). `pointsLabel` is the singular base ("point" / "HotPick
  // Point"); the chip appends the s.
  const displayedValue =
    isFinal && earnedPoints !== null ? earnedPoints : noPickLocked ? 0 : points;
  const labelText = pointsLabel + (Math.abs(displayedValue) === 1 ? '' : 's');

  // Score colour (rule 9). Only the WINNER's score greens, and only at FINAL.
  const awayScoreColor =
    isFinal && winnerTeam !== null && game.away_team === winnerTeam
      ? colors.gameWon
      : colors.textPrimary;
  const homeScoreColor =
    isFinal && winnerTeam !== null && game.home_team === winnerTeam
      ? colors.gameWon
      : colors.textPrimary;

  // Name treatment: with no pick both render neutral, equal weight; otherwise the
  // picked name takes `pickedNameColor` heavy and the opponent goes muted+lighter.
  const nameStyle = (isPicked: boolean) => {
    if (pickedSide === null) {
      // Nothing picked: full-weight neutral while editable (both equal); muted
      // once locked, so an unpicked game recedes behind games you're in.
      return editable
        ? {font: displayType.display, color: colors.textPrimary, size: 16}
        : {font: {...displayType.display, fontWeight: '400' as const}, color: colors.textSecondary, size: 13};
    }
    return isPicked
      ? {font: displayType.display, color: pickedNameColor ?? colors.textPrimary, size: 16}
      : {font: {...displayType.display, fontWeight: '400' as const}, color: colors.textSecondary, size: 13};
  };
  const awayNm = nameStyle(pickedSide === 'away');
  const homeNm = nameStyle(pickedSide === 'home');

  // LIVE dot pulse — the only animated value; drives this dot's opacity alone.
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

  const periodLabel = (() => {
    if (!isLive) return null;
    const parts: string[] = [];
    if (game.current_period != null) parts.push(`Q${game.current_period}`);
    if (game.game_clock) parts.push(game.game_clock);
    return parts.length > 0 ? parts.join(' · ') : null;
  })();

  // One team's name line — a tap target when editable, a plain line otherwise
  // (spec §6.3: never render a disabled TouchableOpacity — omit it).
  const renderTeam = (
    label: string,
    code: string,
    record: string | null | undefined,
    nm: {font: TextStyle; color: string; size: number},
  ) => {
    const inner = (
      <View style={styles.nameRow}>
        <Text
          style={[nm.font, styles.teamName, {color: nm.color, fontSize: nm.size}]}
          numberOfLines={1}>
          {label.toUpperCase()}
        </Text>
        {record ? (
          <Text style={[bodyType.regular, styles.record, {color: colors.textSecondary}]}>
            {record}
          </Text>
        ) : null}
      </View>
    );
    return editable ? (
      <TouchableOpacity
        style={styles.nameTap}
        activeOpacity={0.6}
        onPress={() => onSelectTeam?.(code)}>
        {inner}
      </TouchableOpacity>
    ) : (
      inner
    );
  };

  // Flame slot — rendered only when there's a flame or a lock to show (Home's
  // HotPick card passes neither, so the slot collapses). Flame 50 in every
  // state so the chip doesn't jump at lock. Tap target only when editable.
  const flameContent =
    flame === 'lit' ? (
      <ChipFlameColor size={50} barColor={colors.textPrimary} />
    ) : flame === 'deselected' ? (
      <ChipFlameDeselected size={50} color={colors.textTertiary} />
    ) : null;
  const flameSlot =
    flame === 'none' && !lock ? null : editable ? (
      <TouchableOpacity style={styles.flameSlot} activeOpacity={0.6} onPress={onPressFlame}>
        {flameContent}
      </TouchableOpacity>
    ) : (
      <View style={styles.flameSlot}>{flameContent}</View>
    );

  return (
    // The chip IS the whole card: [panel] | divider | [game block] | [flame slot],
    // one outlined pill. The outline goes orange for a HotPick chip (wrapper).
    <View
      style={[
        styles.pill,
        {
          backgroundColor: colors.surface,
          borderColor: outlineColor ?? colors.border,
          borderWidth: outlineColor ? 2 : StyleSheet.hairlineWidth,
        },
      ]}>
      {/* Left panel — full-bleed, rounded to the pill corner. Neutral stake until
          FINAL + scored, then signed + coloured. Stacks the frozen rank beneath
          when `stackedRank` is set. White-on-orange when tinted. */}
      <View style={[styles.ptsBox, {backgroundColor: boxTint?.background ?? colors.surfaceElevated}]}>
        <Text style={[displayType.display, styles.ptsValue, {color: boxColor}]}>
          {boxValue}
        </Text>
        <Text style={[bodyType.bold, styles.ptsLabel, {color: labelColor}]}>
          {labelText}
        </Text>
        {stackedRank != null ? (
          <>
            <View style={[styles.panelDivider, {backgroundColor: boxTint?.text ?? colors.border}]} />
            <Text style={[displayType.display, styles.stackedRank, {color: boxTint?.text ?? colors.textSecondary}]}>
              {stackedRank}
            </Text>
          </>
        ) : null}
      </View>

      <View style={[styles.divider, {backgroundColor: colors.border}]} />

      <View style={styles.gameBlock}>
        {/* Status line (status colours, not result colours): kickoff muted, or
            LIVE green + clock, or FINAL red — red on wins too. */}
        {showStatus ? (
          isLive ? (
            <View style={styles.statusRow}>
              <Animated.View style={[styles.liveDot, {backgroundColor: colors.live, opacity: dotPulse}]} />
              <Text style={[styles.statusText, {color: colors.gameWon}]}>LIVE</Text>
              {periodLabel ? (
                <Text style={[bodyType.regular, styles.statusMeta, {color: colors.textSecondary}]}>
                  {periodLabel}
                </Text>
              ) : null}
            </View>
          ) : isFinal ? (
            <View style={styles.statusRow}>
              <Text style={[styles.statusText, {color: colors.gameLost}]}>FINAL</Text>
            </View>
          ) : (
            <Text style={[bodyType.regular, styles.kickoff, {color: colors.textSecondary}]}>
              {formatKickoff(game.kickoff_at)}
            </Text>
          )
        ) : null}

        {/* Matchup — names (tappable when editable) with records inline, no "@". */}
        <View style={styles.matchupRow}>
          <View style={styles.namesCol}>
            {renderTeam(away, game.away_team, awayRecord, awayNm)}
            {renderTeam(home, game.home_team, homeRecord, homeNm)}
          </View>

          {showScores ? (
            <View style={[styles.scoresCol, {marginRight: scoresRightInset}]}>
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

      {flameSlot}

      {/* Lock — a small badge in the top-right corner on locked chips. */}
      {lock ? (
        <View style={styles.cornerLock} pointerEvents="none">
          <ChipLock size={23} color={colors.textPrimary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'stretch',
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
    fontSize: 32,
    fontVariant: ['tabular-nums'],
  },
  ptsLabel: {
    fontSize: 10,
    letterSpacing: 1,
    marginTop: -4,
    textAlign: 'center',
  },
  panelDivider: {
    width: 44,
    height: 2,
    borderRadius: 1,
    marginVertical: 3,
  },
  stackedRank: {
    fontSize: 18,
    fontVariant: ['tabular-nums'],
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
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1,
  },
  statusMeta: {
    fontSize: 13,
  },
  kickoff: {
    fontSize: 14,
    marginBottom: 2,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  namesCol: {
    // Flex so the scores are pushed to the game block's right edge — every
    // chip's scores right-align to the same spot, not floated off the name.
    flex: 1,
    gap: 2,
  },
  nameTap: {
    paddingVertical: 2,
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
    // Right-justified: a 1-digit score sits over the ones place of a 2-digit
    // one (tabular-nums keeps the columns equal).
    marginLeft: spacing.md,
    alignItems: 'flex-end',
    gap: 2,
  },
  score: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  flameSlot: {
    width: 56,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerLock: {
    position: 'absolute',
    top: 5,
    right: 7,
  },
});
