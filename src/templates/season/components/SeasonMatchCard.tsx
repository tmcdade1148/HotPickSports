import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {Flame} from 'lucide-react-native';
import type {SeasonConfig} from '@shared/types/templates';
import type {DbSeasonGame} from '@shared/types/database';
import {colors, spacing} from '@shared/theme';
import {useSeasonStore} from '../stores/seasonStore';

interface SeasonMatchCardProps {
  game: DbSeasonGame;
  config: SeasonConfig;
  userId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format kickoff into "Thu, 8:20 PM" */
function formatKickoff(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = days[date.getDay()];
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const minStr = minutes < 10 ? `0${minutes}` : String(minutes);
  return `${day}, ${hours}:${minStr} ${ampm}`;
}

// ---------------------------------------------------------------------------
// TeamRow — a single tappable team line
// ---------------------------------------------------------------------------

interface TeamRowProps {
  teamName: string;
  record: string | null | undefined;
  score: number | null | undefined;
  opponentScore: number | null | undefined;
  isSelected: boolean;
  hasSelection: boolean; // whether ANY team is selected on this game
  isFinal: boolean;
  isLocked: boolean;
  onPress: () => void;
}

function TeamRow({
  teamName,
  record,
  score,
  opponentScore,
  isSelected,
  hasSelection,
  isFinal,
  isLocked,
  onPress,
}: TeamRowProps) {
  const isWinner =
    isFinal && score != null && opponentScore != null && score > opponentScore;

  // Dimmed when another team is selected and this one isn't
  const isDimmed = hasSelection && !isSelected;

  return (
    <View style={styles.teamRow}>
      <TouchableOpacity
        style={[styles.teamButton, isSelected && styles.teamButtonSelected]}
        onPress={onPress}
        disabled={isLocked}
        activeOpacity={0.6}>
        <Text
          style={[
            styles.teamName,
            isSelected && styles.teamNameSelected,
            isDimmed && styles.teamNameDimmed,
          ]}
          numberOfLines={1}>
          {teamName.toUpperCase()}
        </Text>
        {record ? <Text style={styles.recordText}>{record}</Text> : null}
      </TouchableOpacity>

      {/* Score column — visible during live/final */}
      <View style={styles.scoreColumn}>
        {score != null ? (
          <View style={styles.scoreInner}>
            <Text style={[styles.scoreText, isWinner && styles.scoreWinner]}>
              {score}
            </Text>
            {isWinner ? <Text style={styles.winnerTriangle}>◀</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SeasonMatchCard — main component
// ---------------------------------------------------------------------------

/**
 * SeasonMatchCard — Row for a single weekly game.
 *
 * Layout matches the proven SwiftUI PickGamesRowView:
 * [Rank circle] [Away team row / Home team row] [Flame icon]
 *
 * Each team row is directly tappable to make a pick.
 * Flame icon designates the HotPick.
 */
export function SeasonMatchCard({
  game,
  config,
  userId,
}: SeasonMatchCardProps) {
  const existingPick = useSeasonStore(s => s.getPickForGame(game.game_id));
  const hotPickCount = useSeasonStore(s => s.getHotPickCount());
  const savePick = useSeasonStore(s => s.savePick);
  const isSaving = useSeasonStore(s => s.isSaving);

  const pickedTeam = existingPick?.picked_team ?? null;
  const isHotPick = existingPick?.is_hot_pick ?? false;

  // Status — handle both uppercase (DB/ESPN) and lowercase
  const status = (game.status ?? '').toUpperCase();
  const isFinal =
    status === 'FINAL' || status === 'STATUS_FINAL' || status === 'COMPLETED';
  const isLive = status === 'IN_PROGRESS' || status === 'LIVE';
  const isLocked = isFinal || isLive;

  const kickoffDate = new Date(game.kickoff_at);
  const rank = game.frozen_rank ?? game.rank ?? 0;

  const hotPicksRemaining = config.hotPicksPerWeek - hotPickCount;
  const canToggleHotPick = isHotPick || hotPicksRemaining > 0;

  const homeTeamName =
    config.teams.find(t => t.code === game.home_team)?.shortName ??
    game.home_team;
  const awayTeamName =
    config.teams.find(t => t.code === game.away_team)?.shortName ??
    game.away_team;

  const selectTeam = (team: string) => {
    if (isLocked || isSaving) return;
    savePick({userId, gameId: game.game_id, pickedTeam: team, isHotPick});
  };

  const toggleHotPick = () => {
    if (!pickedTeam || isLocked || isSaving) return;
    if (!canToggleHotPick && !isHotPick) return;
    savePick({
      userId,
      gameId: game.game_id,
      pickedTeam,
      isHotPick: !isHotPick,
    });
  };

  // HotPick points label in header
  const pointsLabel =
    isHotPick && !isFinal ? `+/-${rank} pts` : null;

  return (
    <View style={styles.container}>
      {/* ── Header: day/time | status | points ── */}
      <View style={styles.header}>
        {!isFinal && !isLive ? (
          <Text style={styles.kickoffText}>{formatKickoff(kickoffDate)}</Text>
        ) : null}

        {isLive ? (
          <View style={styles.liveRow}>
            <Text style={styles.liveText}>LIVE</Text>
            {game.current_period ? (
              <Text style={styles.periodText}>Q{game.current_period}</Text>
            ) : null}
            {game.game_clock ? (
              <Text style={styles.clockText}>{game.game_clock}</Text>
            ) : null}
          </View>
        ) : null}

        {isFinal ? <Text style={styles.finalText}>FINAL</Text> : null}

        <View style={styles.headerSpacer} />

        {pointsLabel ? (
          <Text style={styles.hotPickPointsHeader}>{pointsLabel}</Text>
        ) : null}
      </View>

      {/* ── Main row: rank circle | teams | flame ── */}
      <View style={styles.mainRow}>
        {/* Rank circle */}
        <View style={styles.rankColumn}>
          <View
            style={[
              styles.rankCircle,
              isHotPick && styles.rankCircleHotPick,
            ]}>
            <Text style={styles.rankNumber}>{rank}</Text>
          </View>
          <Text style={styles.rankLabel}>HotPick</Text>
          <Text style={styles.rankLabel}>Points</Text>
        </View>

        {/* Team buttons — away on top, home on bottom */}
        <View style={styles.teamsColumn}>
          <TeamRow
            teamName={awayTeamName}
            record={game.away_record}
            score={isLive || isFinal ? game.away_score : null}
            opponentScore={isLive || isFinal ? game.home_score : null}
            isSelected={pickedTeam === game.away_team}
            hasSelection={pickedTeam != null}
            isFinal={isFinal}
            isLocked={isLocked}
            onPress={() => selectTeam(game.away_team)}
          />
          <TeamRow
            teamName={homeTeamName}
            record={game.home_record}
            score={isLive || isFinal ? game.home_score : null}
            opponentScore={isLive || isFinal ? game.away_score : null}
            isSelected={pickedTeam === game.home_team}
            hasSelection={pickedTeam != null}
            isFinal={isFinal}
            isLocked={isLocked}
            onPress={() => selectTeam(game.home_team)}
          />
        </View>

        {/* Flame icon — outline when inactive, filled orange when HotPick */}
        <TouchableOpacity
          style={styles.flameColumn}
          onPress={toggleHotPick}
          disabled={
            isLocked ||
            isSaving ||
            !pickedTeam ||
            (!canToggleHotPick && !isHotPick)
          }
          activeOpacity={0.6}>
          <Flame
            size={48}
            color={isHotPick ? '#FF8C00' : '#555555'}
            fill={isHotPick ? '#FF8C00' : 'none'}
            strokeWidth={isHotPick ? 2.5 : 1.2}
          />
        </TouchableOpacity>
      </View>

      {/* ── Separator ── */}
      <View style={styles.separator} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 1,
    marginLeft: 56, // align over left edge of team pills (rankColumn 44 + gap 12)
  },
  kickoffText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  liveText: {
    fontSize: 14,
    fontWeight: '900',
    fontStyle: 'italic',
    color: colors.success,
  },
  periodText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  clockText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  finalText: {
    fontSize: 14,
    fontWeight: '900',
    fontStyle: 'italic',
    color: colors.error,
  },
  headerSpacer: {
    flex: 1,
  },
  hotPickPointsHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFB800',
  },

  // Main row
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },

  // Rank circle
  rankColumn: {
    alignItems: 'center',
    width: 44,
  },
  rankCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankCircleHotPick: {
    backgroundColor: '#FF8C00',
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  rankLabel: {
    fontSize: 7,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Teams
  teamsColumn: {
    flex: 1,
    gap: 3,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
  },
  teamButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  teamButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
  },
  teamName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  teamNameSelected: {
    color: colors.primary,
  },
  teamNameDimmed: {
    opacity: 0.55,
  },
  recordText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 8,
  },

  // Scores
  scoreColumn: {
    width: 55,
    alignItems: 'flex-start',
    marginLeft: 8,
  },
  scoreInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  scoreWinner: {
    color: colors.text,
  },
  winnerTriangle: {
    fontSize: 16,
    color: colors.success,
  },

  // Flame
  flameColumn: {
    width: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  // Separator
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
});
