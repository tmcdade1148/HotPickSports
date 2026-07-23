import React from 'react';
import {Text} from '@shared/components/AppText';
import {View, TouchableOpacity, Alert, StyleSheet} from 'react-native';
import {ChipFlameColor} from '@shared/components/ChipFlameColor';
import {ChipFlameDeselected} from '@shared/components/ChipFlameDeselected';
import {ChipLock} from '@shared/components/ChipLock';
import {GameChip} from '@shared/components/GameChip';
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
   * Whether the WHOLE WEEK has locked (now >= MIN(kickoff_at)), matching the
   * server's enforce_pick_lock. Computed once via the shared weekLock helper and
   * passed in; when true every card in the week is read-only. Defaults false.
   */
  weekLocked?: boolean;
  /**
   * True once the user has designated a HotPick for the week. When set, the
   * rank badge on every card that ISN'T the chosen HotPick is dimmed, so the
   * one chosen HotPick stands out.
   */
  hotPickSelected?: boolean;
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
      'Picks Locked',
      'Picks lock for the whole week once the first game kicks off, so this week is now read-only.',
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
  weekLocked = false,
  hotPickSelected = false,
}: SeasonMatchCardProps) {
  const {colors} = useTheme();
  const brand = useBrand();
  const styles = createStyles(colors);
  const rankColor = brand.isBranded ? colors.accentTeal : colors.primary;
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
  // Whole-week locking (slice 1): the entire week is read-only once its FIRST
  // kickoff passes (now >= MIN(kickoff_at)), matching the server's
  // enforce_pick_lock trigger — NOT per-game. `weekLocked` carries that single
  // shared value (see utils/weekLock). isFinal/isLive stay as belt-and-suspenders
  // for realtime status flips. The old per-game `lock_at` term was slice-1
  // obsolete (the server no longer locks per game) and is removed.
  const isLocked = !picksAreOpen || weekLocked || isFinal || isLive;
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

  // HotPick points label in header — reframed from "+/-13 pts" (wager-like)
  // to "13 HotPick Points" (descriptive point value).
  const pointsLabel =
    isHotPick && !isFinal ? `${rank} HotPick Points` : null;

  return (
    <View style={[
      styles.container,
      // The GameChip is itself an outlined pill with its own surface, so the
      // wrapper drops its card decoration on that path — otherwise it's a card
      // inside a card.
      isLocked && styles.containerChip,
      isLocked && !isLive && !isFinal && styles.containerLocked,
      isHotPick && styles.containerHotPick,
    ]}>
      {/* ── Header (editable only) ──
          Once the card is read-only the GameChip owns the day/time and the
          LIVE / FINAL status, the chip's box owns the points, and the lock
          moves to the flame column (spec section 8: only one lock per card),
          so the header has nothing left to show and is dropped entirely. */}
      {!isLocked ? (
        <View style={styles.header}>
          <Text style={styles.kickoffText}>{formatKickoff(kickoffDate)}</Text>
          <View style={styles.headerSpacer} />
          {pointsLabel ? (
            <Text style={styles.hotPickPointsHeader}>{pointsLabel}</Text>
          ) : null}
        </View>
      ) : null}

      {/* ── Main row: rank circle (editable only) | teams | flame ── */}
      <View style={styles.mainRow}>
        {/* Rank circle — EDITABLE state only. Once the card is read-only the
            GameChip's own left PTS box carries the rank, so rendering the
            circle too would show the same number twice. The circle survives in
            the editable state because the rank is the whole point of the
            decision you're making while picking, and it is fused to the
            HotPick-dimming behaviour below. */}
        {!isLocked ? (
          <View style={[styles.rankColumn, hotPickSelected && !isHotPick && styles.rankColumnDimmed]}>
            <View
              style={[
                styles.rankCircle,
                {backgroundColor: rankColor},
                isHotPick && styles.rankCircleHotPick && {backgroundColor: rankColor},
              ]}>
              <Text style={styles.rankNumber}>{rank}</Text>
            </View>
            {isHotPick ? (
              <>
                <Text style={[styles.rankLabel, {marginTop: 3}]}>HotPick</Text>
                <Text style={[styles.rankLabel, {marginTop: -1}]}>Points</Text>
              </>
            ) : (
              <Text style={[styles.rankLabel, {marginTop: 3}]}>Points</Text>
            )}
          </View>
        ) : null}

        {/* Teams — the display half.
            READ-ONLY (locked / live / final): the GameChip renders it. It owns
            the three states, the scores, the clock, and the FINAL result colour
            (from the server's winner_team + earned points, never a score comparison).
            EDITABLE: the tappable TeamRows stay exactly as they were, because
            here the team name IS the pick target. Scores never appeared in this
            branch anyway — a game with a score is live or final, which is
            always locked, hence always the chip. */}
        <View style={styles.teamsColumn}>
          {isLocked ? (
            <GameChip
              game={game}
              points={isHotPick ? rank : 1}
              earnedPoints={existingPick?.points ?? null}
              winnerTeam={game.winner_team}
              pointsLabel={isHotPick ? 'HotPick Points' : 'PT'}
              boxTint={isHotPick ? {background: colors.primary, text: colors.onPrimary} : undefined}
              pickedSide={
                pickedTeam === game.home_team
                  ? 'home'
                  : pickedTeam === game.away_team
                    ? 'away'
                    : null
              }
              awayName={awayTeamName}
              homeName={homeTeamName}
              awayRecord={game.away_record}
              homeRecord={game.home_record}
            />
          ) : (
            <View style={styles.teamNamesCol}>
              <TeamRow
                teamName={awayTeamName}
                record={game.away_record}
                isSelected={pickedTeam === game.away_team}
                hasSelection={pickedTeam != null}
                isLocked={isLocked}
                isFinal={isFinal}
                isLive={isLive}
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
                onPress={() => selectTeam(game.home_team)}
              />
            </View>
          )}
        </View>

        {/* Flame / lock column — spec §6.3 state machine:
              not locked          -> flame selector (deselected until chosen), tappable
              locked + HotPick     -> colored flame + strong lock
              locked + not HotPick -> muted lock only, no flame
            Tap-to-designate is unchanged; only the artwork branches. */}
        {!isLocked ? (
          <View style={styles.flameColumn}>
            <TouchableOpacity
              onPress={handleFlamePress}
              disabled={isSaving || !canSetHotPick}
              activeOpacity={0.6}>
              {isHotPick ? (
                <ChipFlameColor size={46} />
              ) : (
                <ChipFlameDeselected size={46} color={colors.textTertiary} />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          // Locked: the pill runs full-width; the flame/lock sits ON its right
          // surface as an absolute overlay (no column reserving a gap). The lock
          // layers on top of the dimmed flame for the HotPick.
          <View style={styles.lockOverlay} pointerEvents="none">
            {isHotPick ? (
              <View style={styles.flameLockStack}>
                <View style={styles.dimFlame}>
                  <ChipFlameColor size={46} />
                </View>
                <View style={styles.lockOnFlame}>
                  <ChipLock size={46} color={colors.textPrimary} />
                </View>
              </View>
            ) : (
              <ChipLock size={46} color={colors.textTertiary} />
            )}
          </View>
        )}
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
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  containerHotPick: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  // Read-only path: the GameChip supplies the surface, outline and padding.
  containerChip: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
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
  headerSpacer: {
    flex: 1,
  },
  hotPickPointsHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
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
  // Dimmed when a HotPick is set and this card isn't it.
  rankColumnDimmed: {
    opacity: 0.3,
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
    color: colors.onPrimary,
  },
  rankLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  // Teams
  teamsColumn: {
    flex: 1,
  },
  teamNamesCol: {
    flex: 1,
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
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 5,
    paddingRight: 8,
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
    fontStyle: 'italic',
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

  // Flame
  flameColumn: {
    width: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexDirection: 'column',
  },
  // Locked HotPick: strong lock layered ON TOP of the (dimmed) colored flame.
  flameLockStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Recede the flame so the lock reads as the active layer on top.
  dimFlame: {
    opacity: 0.5,
  },
  // The lock, centred over the flame.
  lockOnFlame: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Locked: flame/lock sits ON the full-width pill's right surface, occupying the
  // SAME footprint the flame selector uses when editable (width 48, 12 right
  // inset — matching flameColumn), so the lock lands exactly where the flame was.
  lockOverlay: {
    position: 'absolute',
    right: 12,
    width: 48,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
