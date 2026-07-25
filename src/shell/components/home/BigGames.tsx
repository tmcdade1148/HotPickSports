// BigGames — "Big Games to Watch" (ACTION module spec 2, Part B).
//
// The 3 highest-rank games that are NOT the Player's HotPick, as stacked
// mini-scoreboards. Renders in two contexts off ONE component:
//   • nudge (picks_open)      — heading "BIG GAMES THIS WEEK", records + kickoff,
//                               NO scores (games haven't started).
//   • scoreboard (locked/live)— heading "BIG GAMES", live/final SCORES, records
//                               dropped. Replaces the (now-gone) big CTA.
//
// Data is ALREADY on the client — no new query, subscription, or store field:
//   • seasonStore.games is ALREADY sorted by frozen_rank ascending, so
//     "first 3 after excluding the HotPick" = the 3 highest-rank non-HotPick
//     games. Do NOT re-sort or re-query.
//   • nflStore.liveScores is store-wide and live-subscribed; merge per tile the
//     same way HotPickModule does (fromGameScore over the season_games row).
//
// Compliance (spec §7 framing): "watch these" only. NEVER a projection of the
// Player's hypothetical points on these games, never a HotPick-vs-game
// comparison — regret framing is a violation. Game scores only.
//   Rule 9  — winner comes from the SERVER (winner_team), never a score compare.
//   Rule 3  — no green/red on LIVE scores; only the LIVE dot moves.
//   Rule 10 — status via gameStatus.ts (case-insensitive).
//   Rule 9 colours, Hard Rule #9 — every colour is a token.

import React, {useEffect, useRef} from 'react';
import {Text} from '@shared/components/AppText';
import {Animated, StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {fromGameScore, formatKickoff} from '@shared/components/GameChip';
import {isLiveStatus, isFinalStatus} from '@sports/nfl/utils/gameStatus';
import {bodyType, displayType, monoType, spacing, borderRadius} from '@shared/theme';
import type {DbSeasonGame} from '@shared/types/database';
import {ModuleSection} from './ModuleSection';

export type BigGamesVariant = 'nudge' | 'scoreboard';

export function BigGames({variant}: {variant: BigGamesVariant}) {
  const seasonGames = useSeasonStore(s => s.games);
  const userHotPickGame = useNFLStore(s => s.userHotPickGame);

  // Already rank-sorted ASCENDING (query orders by frozen_rank asc). HIGHER
  // frozen_rank = more competitive = a game to watch, so take the LAST 3 (the 3
  // highest ranks, e.g. 14/15/16) after dropping the HotPick game. No re-sort;
  // no reactive swap if the Player later HotPicks one of the three (kept simple).
  const hotPickId = userHotPickGame?.game_id;
  const games = seasonGames.filter(g => g.game_id !== hotPickId).slice(-3);

  if (games.length === 0) return null;

  return (
    <ModuleSection label="GAMES TO WATCH">
      <View style={styles.row}>
        {games.map(g => (
          <BigGameTile key={g.game_id} game={g} variant={variant} />
        ))}
      </View>
    </ModuleSection>
  );
}

function BigGameTile({game, variant}: {game: DbSeasonGame; variant: BigGamesVariant}) {
  const {colors} = useTheme();

  // Live payload merged over the season_games row — fresher during play.
  const score = useNFLStore(s => s.liveScores[game.game_id]);
  const merged = {...game, ...fromGameScore(score)};

  const isLive = isLiveStatus(merged.status);
  const isFinal = !isLive && isFinalStatus(merged.status);
  // Scores only on the locked/live scoreboard, and only once a game is in play.
  // The nudge never shows scores; records show instead.
  const showScores = variant === 'scoreboard' && (isLive || isFinal);

  // Rank is the game's FROZEN rank (not its list position) and shows ONLY once
  // locked — pre-lock, a rank number invites "two weak teams ranked high"
  // confusion (spec §3). frozen_rank only, no live-rank fallback: a null here
  // would surface as "—" rather than be masked (ranks must be frozen by lock).
  const showRank = variant === 'scoreboard';
  const rank = game.frozen_rank;

  // Header strip — orange by default, GREEN while this tile is live.
  const headerBg = isLive ? colors.gameWon : colors.primary;
  const kickoff = formatKickoff(game.kickoff_at).replace(', ', ' ').toUpperCase();
  const periodLabel =
    isLive
      ? [
          merged.current_period != null ? `Q${merged.current_period}` : null,
          merged.game_clock || null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;
  // Status + clock live in the header, the clock right of LIVE (spec §4) — no
  // sub-line. Nudge/scheduled show the kickoff instead.
  const statusText = isLive
    ? periodLabel
      ? `LIVE  ${periodLabel}`
      : 'LIVE'
    : isFinal
      ? 'FINAL'
      : kickoff;

  // FINAL border greens (Rule 9 winner from the server); otherwise a hairline.
  const borderColor = isFinal ? colors.gameWon : colors.border;

  // One team row. Value column is fixed-width + tabular so both align.
  const renderTeam = (teamCode: string, scoreVal: number | null | undefined, record: string | null) => {
    // Score colour: winner greens ONLY at FINAL (server winner_team, never a
    // score compare); loser muted; live/scheduled stay neutral.
    const scoreColor =
      isFinal && game.winner_team != null
        ? game.winner_team === teamCode
          ? colors.gameWon
          : colors.textTertiary
        : colors.textPrimary;
    return (
      <View style={styles.teamRow}>
        <Text style={[displayType.display, styles.code, {color: colors.textPrimary}]} numberOfLines={1}>
          {teamCode}
        </Text>
        {showScores ? (
          <Text style={[bodyType.bold, styles.value, {color: scoreColor}]} numberOfLines={1}>
            {scoreVal ?? '—'}
          </Text>
        ) : (
          <Text style={[bodyType.regular, styles.record, {color: colors.textSecondary}]} numberOfLines={1}>
            {record ?? ''}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.tile, {backgroundColor: colors.surface, borderColor, borderWidth: isFinal ? 2 : StyleSheet.hairlineWidth}]}>
      <View
        style={[
          styles.header,
          {backgroundColor: headerBg, justifyContent: showRank ? 'space-between' : 'center'},
        ]}>
        {showRank && (
          <Text style={[displayType.display, styles.rank, {color: colors.onPrimary}]} numberOfLines={1}>
            {rank ?? '—'}
          </Text>
        )}
        <View style={styles.statusWrap}>
          {isLive && <LiveDot color={colors.onPrimary} />}
          <Text
            style={[bodyType.bold, styles.status, {color: colors.onPrimary}]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}>
            {statusText}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {renderTeam(game.away_team, merged.away_score, game.away_record)}
        {renderTeam(game.home_team, merged.home_score, game.home_record)}
      </View>
    </View>
  );
}

// The pulsing LIVE dot — the only motion, mirroring the GameChip live dot.
function LiveDot({color}: {color: string}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 0.3, duration: 550, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 1, duration: 550, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[styles.liveDot, {backgroundColor: color, opacity: pulse}]} />;
}

const styles = StyleSheet.create({
  // Aligns to the other Home modules' content inset (matches HotPickModule's
  // chipWrap); ModuleSection only pads the eyebrow row.
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: spacing.lg,
    gap: 8,
  },
  tile: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  rank: {
    fontSize: 15,
    letterSpacing: 0,
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  status: {
    fontSize: 10,
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  body: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 6,
  },
  code: {
    fontSize: 14,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  // Fixed-width, tabular so both scores line up in a column.
  value: {
    ...monoType.regular,
    fontSize: 15,
    minWidth: 22,
    textAlign: 'right',
  },
  record: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 22,
    textAlign: 'right',
  },
});
