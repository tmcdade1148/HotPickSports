// PlayerSlateAccordion — the revealed slate under a Ladder (Week tab) row.
//
// ONE LINE per game, kept deliberately spare (Tom, Jul 2026). Each row conveys
// exactly four things and nothing else:
//   • the game            — both teams by nickname
//   • who they picked      — the picked team is emphasised, the opponent muted
//   • which was the HotPick — a flame directly left of the HotPick team, which
//                             renders ALL-CAPS + bold
//   • the HotPick points   — the rank, shown once on the HotPick row
//
// No boxes, no ✓/✗ marks. Win/loss is carried only as a subtle tint on the
// picked team (server is_correct — rule 9, never derived from scores), and the
// HotPick points gain a sign ONLY at FINAL (rule 2). Presentational only: it
// renders whatever get_player_week_picks returned; it never re-computes privacy
// or lock state.

import React from 'react';
import {View, ActivityIndicator, StyleSheet} from 'react-native';
import {Text} from '@shared/components/AppText';
import {useTheme} from '@shell/theme';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import type {DbSeasonGame} from '@shared/types/database';

export interface PlayerSlatePick {
  game_id: string;
  picked_team: string;
  is_hotpick: boolean;
  /** Server-computed result (season_picks.is_correct): true=win, false=loss,
   *  null=pending. READ only — the client never derives win/loss. */
  is_correct: boolean | null;
}

export interface PlayerSlateState {
  status: 'loading' | 'ready' | 'error';
  picks: PlayerSlatePick[];
}

interface Props {
  /** The week's full game list (from allWeekGames[week]). */
  games: DbSeasonGame[];
  /** The RPC result for this member+week, or undefined before the tap fires. */
  slate: PlayerSlateState | undefined;
  /** True when the pool is NOT private. Chooses empty-state copy only. */
  isNonPrivate: boolean;
  /** Team code → nickname source (SeasonConfig.teams). Falls back to the code. */
  teams?: Array<{code: string; shortName?: string; name?: string}>;
}

export function PlayerSlateAccordion({games, slate, isNonPrivate, teams}: Props) {
  const {colors} = useTheme();
  const styles = createStyles(colors);

  const nick = (code: string): string =>
    teams?.find(t => t.code === code)?.shortName ?? code;

  if (!slate || slate.status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (slate.status === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Couldn't load this slate.</Text>
      </View>
    );
  }

  const pickByGame: Record<string, PlayerSlatePick> = {};
  for (const p of slate.picks) pickByGame[p.game_id] = p;

  if (slate.picks.length === 0 && isNonPrivate) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>
          Full slates are shown only in private contests.
        </Text>
      </View>
    );
  }

  if (games.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Slate unavailable.</Text>
      </View>
    );
  }

  // Rank order (1→16), matching the Picks screen and the raw slate order.
  const ordered = [...games].sort(
    (a, b) =>
      (a.frozen_rank ?? a.rank ?? 999) - (b.frozen_rank ?? b.rank ?? 999),
  );

  // One team's rendered name within a matchup. The picked team is bold and
  // brighter (that IS "who they picked"); the opponent is muted. The HotPick
  // team additionally goes ALL-CAPS with a flame to its immediate left. Colour
  // reflects the server result only once the pick is decided.
  const teamEl = (
    code: string,
    pick: PlayerSlatePick | undefined,
    keyPrefix: string,
  ) => {
    const isPicked = pick?.picked_team === code;
    const isHot = isPicked && pick?.is_hotpick === true;
    const resultColor =
      !isPicked || pick?.is_correct == null
        ? null
        : pick.is_correct
          ? colors.gameWon
          : colors.gameLost;
    const color = isPicked ? (resultColor ?? colors.textPrimary) : colors.textTertiary;
    const label = isHot ? nick(code).toUpperCase() : nick(code);
    return (
      <View style={styles.teamWrap} key={keyPrefix}>
        {isHot ? <Text style={[styles.flame, {color: colors.primary}]}>🔥</Text> : null}
        <Text
          style={[
            isPicked ? bodyType.bold : bodyType.regular,
            styles.team,
            isHot && styles.teamHot,
            {color},
          ]}
          numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {ordered.map(g => {
        const pick = pickByGame[g.game_id];
        const away = g.away_team ?? '';
        const home = g.home_team ?? '';
        const isHotRow = pick?.is_hotpick === true;
        const rank = g.frozen_rank ?? g.rank ?? null;

        // HotPick points: unsigned rank while pending (rule 2), signed +
        // coloured once the server decides it.
        let ptsEl: React.ReactNode = null;
        if (isHotRow && rank != null) {
          if (pick?.is_correct === true) {
            ptsEl = <Text style={[bodyType.bold, styles.pts, {color: colors.gameWon}]}>{`+${rank}`}</Text>;
          } else if (pick?.is_correct === false) {
            ptsEl = <Text style={[bodyType.bold, styles.pts, {color: colors.gameLost}]}>{`−${rank}`}</Text>;
          } else {
            ptsEl = <Text style={[bodyType.bold, styles.pts, {color: colors.textSecondary}]}>{`${rank}`}</Text>;
          }
        }

        return (
          <View key={g.game_id} style={styles.gameRow}>
            <View style={styles.matchup}>
              {teamEl(away, pick, 'a')}
              <Text style={[styles.at, {color: colors.textTertiary}]}>@</Text>
              {teamEl(home, pick, 'h')}
              {!pick ? <Text style={[styles.noPick, {color: colors.textTertiary}]}>· no pick</Text> : null}
            </View>
            {ptsEl}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      // Tuck flush under the row (which carries marginBottom: spacing.sm) so
      // the revealed slate reads as that row expanding, not a floating panel.
      marginTop: -spacing.sm,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      backgroundColor: colors.background,
      borderBottomLeftRadius: borderRadius.md,
      borderBottomRightRadius: borderRadius.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    gameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 2,
    },
    matchup: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
    },
    teamWrap: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    flame: {fontSize: 11, marginRight: 2},
    team: {fontSize: 13},
    teamHot: {letterSpacing: 0.3},
    at: {fontSize: 11, marginHorizontal: 5},
    noPick: {fontSize: 11, fontStyle: 'italic', marginLeft: 6},
    pts: {fontSize: 13, marginLeft: 8},
    muted: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing.sm,
    },
  });
