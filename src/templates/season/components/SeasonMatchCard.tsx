import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {Flame, Lock} from 'lucide-react-native';
import type {SeasonConfig} from '@shared/types/templates';
import type {DbSeasonGame} from '@shared/types/database';
import {spacing} from '@shared/theme';
import {useSeasonStore} from '../stores/seasonStore';
import {useTheme, useBrand} from '@shell/theme';

interface PickSplitData {
  teamAPickCount: number;
  teamBPickCount: number;
  totalPicks: number;
  hotpickTotal: number;
  hotpickTeamACount: number;
  hotpickTeamBCount: number;
}

interface SeasonMatchCardProps {
  game: DbSeasonGame;
  config: SeasonConfig;
  userId: string;
  /** Pool pick split stats — revealed at kickoff only */
  pickSplit?: PickSplitData | null;
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
  const {colors} = useTheme();
  const styles = createStyles(colors);
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
  pickSplit,
}: SeasonMatchCardProps) {
  const {colors} = useTheme();
  const brand = useBrand();
  const styles = createStyles(colors);
  const rankColor = brand.isBranded ? colors.highlight : colors.primary;
  const existingPick = useSeasonStore(s => s.getPickForGame(game.game_id));
  const savePick = useSeasonStore(s => s.savePick);
  const setHotPick = useSeasonStore(s => s.setHotPick);
  const isSaving = useSeasonStore(s => s.isSaving);

  const pickedTeam = existingPick?.picked_team ?? null;
  const isHotPick = existingPick?.is_hotpick ?? false;

  // Status — handle both uppercase (DB/ESPN) and lowercase
  const status = (game.status ?? '').toUpperCase();
  const isFinal =
    status === 'FINAL' || status === 'STATUS_FINAL' || status === 'COMPLETED';
  const isLive = status === 'IN_PROGRESS' || status === 'LIVE';
  const kickoffDate = new Date(game.kickoff_at);
  const kickoffPassed = kickoffDate.getTime() <= Date.now();
  const isLocked = isFinal || isLive || kickoffPassed;
  const rank = game.frozen_rank ?? game.rank ?? 0;

  // Flame is tappable if this game has a pick and isn't already the hotpick
  const canSetHotPick = pickedTeam != null && !isHotPick;

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

  const handleFlamePress = () => {
    if (!pickedTeam || isLocked || isSaving || isHotPick) return;
    setHotPick({userId, gameId: game.game_id});
  };

  // HotPick points label in header
  const pointsLabel =
    isHotPick && !isFinal ? `+/-${rank} pts` : null;

  return (
    <View style={[styles.container, isLocked && !isLive && styles.containerLocked]}>
      {/* ── Header: day/time | status | lock | points ── */}
      <View style={styles.header}>
        {!isFinal && !isLive ? (
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
            <Text style={styles.kickoffText}>{formatKickoff(kickoffDate)}</Text>
            {isLocked && <Lock size={12} color={colors.textSecondary} />}
          </View>
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
              {backgroundColor: rankColor},
              isHotPick && styles.rankCircleHotPick && {backgroundColor: rankColor},
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
          onPress={handleFlamePress}
          disabled={isLocked || isSaving || !canSetHotPick}
          activeOpacity={0.6}>
          <Flame
            size={48}
            color={isHotPick ? '#FF8C00' : '#555555'}
            fill={isHotPick ? '#FF8C00' : 'none'}
            strokeWidth={isHotPick ? 2.5 : 1.2}
          />
        </TouchableOpacity>
      </View>

      {/* ── Pick Split Bar — revealed at kickoff ── */}
      {(isLive || isFinal) && pickSplit && pickSplit.totalPicks > 0 && (
        <View style={styles.pickSplitContainer}>
          {/* Percentage bar */}
          <View style={styles.pickSplitBar}>
            <View
              style={[
                styles.pickSplitFillA,
                {
                  flex: pickSplit.teamAPickCount || 1,
                  backgroundColor: pickedTeam === game.home_team ? colors.primary : colors.textSecondary,
                },
              ]}
            />
            <View
              style={[
                styles.pickSplitFillB,
                {
                  flex: pickSplit.teamBPickCount || 1,
                  backgroundColor: pickedTeam === game.away_team ? colors.primary : colors.textSecondary,
                },
              ]}
            />
          </View>
          {/* Labels */}
          <View style={styles.pickSplitLabels}>
            <Text style={[styles.pickSplitPct, pickedTeam === game.home_team && {color: colors.primary}]}>
              {Math.round((pickSplit.teamAPickCount / pickSplit.totalPicks) * 100)}%
            </Text>
            <Text style={styles.pickSplitPct}>
              {Math.round((pickSplit.teamBPickCount / pickSplit.totalPicks) * 100)}%
            </Text>
          </View>
          {/* HotPick concentration */}
          {pickSplit.hotpickTotal > 0 && (
            <Text style={styles.hotpickConcentration}>
              {'\uD83D\uDD25'} {pickSplit.hotpickTotal} HotPick{pickSplit.hotpickTotal !== 1 ? 's' : ''}: {homeTeamName} {pickSplit.hotpickTeamACount} / {pickSplit.hotpickTeamBCount} {awayTeamName}
            </Text>
          )}
        </View>
      )}

    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    paddingHorizontal: 12,
  },
  containerLocked: {
    opacity: 0.5,
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
    color: colors.textPrimary,
  },
  clockText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
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
    backgroundColor: colors.primary,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  rankLabel: {
    fontSize: 8,
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
    color: colors.textPrimary,
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
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  scoreWinner: {
    color: colors.textPrimary,
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
  // Pick split bar
  pickSplitContainer: {
    marginLeft: 56,
    marginRight: 52,
    marginTop: 4,
    marginBottom: 4,
  },
  pickSplitBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 2,
  },
  pickSplitFillA: {
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    opacity: 0.6,
  },
  pickSplitFillB: {
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    opacity: 0.6,
  },
  pickSplitLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pickSplitPct: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  hotpickConcentration: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Separator
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
});
