import React from 'react';
import {View, Text, TouchableOpacity, Alert, StyleSheet} from 'react-native';
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
  /**
   * Whether picks are currently open for this week. When false, the card is
   * always locked regardless of kickoff time. Defaults to true for backwards
   * compatibility (live/settling views still show interactive-looking cards).
   */
  picksAreOpen?: boolean;
  /**
   * Earliest kickoff (ms) of any live/final game this week. When set, any
   * scheduled game at or after this time is wave-locked — even if lock_at is null.
   */
  liveAnchorTime?: number | null;
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
  isSelected: boolean;
  hasSelection: boolean;
  isLocked: boolean;
  isFinal: boolean;
  isLive: boolean;
  lockAtPassed: boolean;
  onPress: () => void;
}

function TeamRow({
  teamName,
  record,
  isSelected,
  hasSelection,
  isLocked,
  isFinal,
  isLive,
  lockAtPassed,
  onPress,
}: TeamRowProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const isDimmed = hasSelection && !isSelected;

  const handlePress = () => {
    if (!isLocked) {
      onPress();
      return;
    }
    // Don't show lock explanation for games that are live or final
    if (isFinal || isLive) return;

    Alert.alert(
      'Game Locked',
      'Games lock in two waves:\n\n\u2022 Any game before the 1pm (ET) window locks at its own kickoff.\n\n\u2022 All remaining games lock together at the 1pm (ET) kickoff.',
      [{text: 'Got it'}],
    );
  };

  return (
    <TouchableOpacity
      style={styles.teamButton}
      onPress={handlePress}
      activeOpacity={isLocked ? 1 : 0.6}>
      <View style={[styles.teamNameBox, isSelected && (isLocked ? styles.teamNameBoxSelectedLocked : styles.teamNameBoxSelected)]}>
        <Text
          style={[
            styles.teamName,
            isSelected && styles.teamNameSelected,
            isDimmed && styles.teamNameDimmed,
          ]}
          numberOfLines={1}>
          {teamName.toUpperCase()}
        </Text>
        {record ? <Text style={[styles.recordText, isDimmed && styles.teamNameDimmed]}>{record}</Text> : null}
      </View>
    </TouchableOpacity>
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
  picksAreOpen = true,
  liveAnchorTime,
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
  // Two-wave locking: games before Sunday 1pm ET lock at kickoff; all others
  // lock at the Sunday 1pm anchor. lock_at is set by nfl-open-picks and
  // enforced server-side by the enforce_pick_lock trigger. Client mirrors
  // that check here for display.
  const lockAtPassed = !!game.lock_at && new Date(game.lock_at) <= new Date();
  // Wave-lock fallback: if this game has no lock_at (simulator) and a game at
  // or before this kickoff is already live/final, lock this game too.
  // Only applies when lock_at is missing — when lock_at is set, it's authoritative.
  const waveLocked = !game.lock_at && liveAnchorTime != null && kickoffDate.getTime() <= liveAnchorTime;
  const isLocked = !picksAreOpen || isFinal || isLive || lockAtPassed || waveLocked;
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
            <Text style={[styles.kickoffText, isLocked && styles.kickoffTextLocked]}>{formatKickoff(kickoffDate)}</Text>
            {isLocked && <Lock size={12} color={'#FFFFFF'} />}
          </View>
        ) : null}

        {isLive ? (
          <View style={styles.liveRow}>
            <Text style={styles.liveText}>LIVE</Text>
            {isLocked && <Lock size={14} color={colors.primary} />}
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
          <View style={styles.teamsWithScores}>
            {/* Names column (tappable rows) */}
            <View style={styles.teamNamesCol}>
              <TeamRow
                teamName={awayTeamName}
                record={game.away_record}
                isSelected={pickedTeam === game.away_team}
                hasSelection={pickedTeam != null}
                isLocked={isLocked}
                isFinal={isFinal}
                isLive={isLive}
                lockAtPassed={lockAtPassed}
                onPress={() => selectTeam(game.away_team)}
              />
              <TeamRow
                teamName={homeTeamName}
                record={game.home_record}
                isSelected={pickedTeam === game.home_team}
                hasSelection={pickedTeam != null}
                isLocked={isLocked}
                isFinal={isFinal}
                isLive={isLive}
                lockAtPassed={lockAtPassed}
                onPress={() => selectTeam(game.home_team)}
              />
            </View>

            {/* Scores + clock — fixed-width container so scores stay aligned between LIVE and FINAL */}
            {(isLive || isFinal) && (
              <View style={styles.scoreClockContainer}>
                <View style={styles.scoresCol}>
                  <Text style={[
                    styles.inlineScore,
                    isFinal && game.away_score != null && game.home_score != null && game.away_score > game.home_score && styles.inlineScoreWinner,
                  ]}>
                    {game.away_score ?? '—'}
                  </Text>
                  <Text style={[
                    styles.inlineScore,
                    isFinal && game.home_score != null && game.away_score != null && game.home_score > game.away_score && styles.inlineScoreWinner,
                  ]}>
                    {game.home_score ?? '—'}
                  </Text>
                </View>
                {isLive && (game.current_period || game.game_clock) && (
                  <Text style={styles.liveClockInline}>
                    {game.current_period ? `Q${game.current_period}` : ''}
                    {game.game_clock ? ` ${game.game_clock}` : ''}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Flame icon — outline when inactive, filled orange when HotPick */}
        <View style={styles.flameColumn}>
          {isFinal && existingPick?.points != null && (
            <Text style={[
              styles.pointsEarned,
              existingPick.points > 0 && styles.pointsEarnedPositive,
              existingPick.points < 0 && styles.pointsEarnedNegative,
            ]}>
              {existingPick.points > 0 ? `+${existingPick.points}` : `${existingPick.points}`}
            </Text>
          )}
          <TouchableOpacity
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
    opacity: 0.7,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
    marginLeft: 56, // align over left edge of team pills (rankColumn 44 + gap 12)
  },
  kickoffText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  kickoffTextLocked: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveText: {
    fontSize: 14,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#1B9A06',
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
  pointsEarned: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  pointsEarnedPositive: {
    color: '#1B9A06',
  },
  pointsEarnedNegative: {
    color: colors.error,
  },

  // Main row
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: 4,
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
  },
  teamsWithScores: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamNamesCol: {
    flex: 1,
  },
  scoreClockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 95,
    gap: 6,
  },
  scoresCol: {
    gap: 2,
    alignItems: 'flex-end',
  },
  teamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  teamNameBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    flexShrink: 1,
  },
  teamNameBoxSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
  },
  teamNameBoxSelectedLocked: {
    borderColor: colors.textPrimary,
    backgroundColor: 'transparent',
  },
  teamName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    flexShrink: 1,
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
    marginLeft: 10,
  },
  inlineScore: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  inlineScoreWinner: {
    color: '#1B9A06',
  },

  // @ separator row between teams
  teamsSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 18,
  },
  atSymbol: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  liveClockInline: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // Flame
  flameColumn: {
    width: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    flexDirection: 'column',
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
