import React from 'react';
import {Text} from '@shared/components/AppText';
import {View, StyleSheet} from 'react-native';
import {GameChip} from '@shared/components/GameChip';
import type {SeasonConfig} from '@shared/types/templates';
import type {DbSeasonGame} from '@shared/types/database';
import {spacing} from '@shared/theme';
import {useSeasonStore} from '../stores/seasonStore';
import {useTheme} from '@shell/theme';

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
   * True once the user has designated a HotPick for the week. Drives the
   * picks-open panel matrix: before any HotPick every chip is orange; once one
   * is chosen only that chip stays orange, the rest go neutral.
   */
  hotPickSelected?: boolean;
}

/**
 * SeasonMatchCard — the wrapper around the unified GameChip (spec v2.1).
 *
 * It owns pick/HotPick STATE and the tap handlers, and computes the per-state
 * PRESENTATION values from the §6.1 matrix — panel tint, name colour, flame
 * variant, lock, outline, stacked rank — then hands them to a dumb GameChip.
 * The chip renders every state (picks-open through FINAL); this file no longer
 * renders a second layout. Below the chip it still shows the pick-split bar.
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
  const styles = createStyles(colors);
  const existingPick = useSeasonStore(s => s.getPickForGame(game.game_id));
  const savePick = useSeasonStore(s => s.savePick);
  const setHotPick = useSeasonStore(s => s.setHotPick);
  const isSaving = useSeasonStore(s => s.isSaving);

  const pickedTeam = existingPick?.picked_team ?? null;
  const isHotPick = existingPick?.is_hotpick ?? false;

  // Status — handle both uppercase (DB/ESPN) and lowercase.
  const status = (game.status ?? '').toUpperCase();
  const isFinal =
    status === 'FINAL' || status === 'STATUS_FINAL' || status === 'COMPLETED';
  const isLive = status === 'IN_PROGRESS' || status === 'LIVE';
  // Whole-week lock (slice 1): read-only once the week's first kickoff passes,
  // matching enforce_pick_lock. isFinal/isLive are belt-and-suspenders.
  const isLocked = !picksAreOpen || weekLocked || isFinal || isLive;
  const editable = !isLocked;
  const rank = game.frozen_rank ?? game.rank ?? 0;

  const homeTeamName =
    config.teams.find(t => t.code === game.home_team)?.shortName ??
    game.home_team;
  const awayTeamName =
    config.teams.find(t => t.code === game.away_team)?.shortName ??
    game.away_team;

  // Handlers — guards live here (the chip is dumb). selectTeam no-ops when
  // locked/saving; handleFlamePress no-ops unless a team is picked and it isn't
  // already the HotPick.
  const selectTeam = (team: string) => {
    if (isLocked || isSaving) return;
    savePick({userId, gameId: game.game_id, pickedTeam: team, isHotPick});
  };
  const handleFlamePress = () => {
    if (!pickedTeam || isLocked || isSaving || isHotPick) return;
    setHotPick({userId, gameId: game.game_id});
  };

  // ── Presentation values — the §6.1 state matrix, computed once here ──
  // Panel: orange while THIS chip carries HotPick value (picks-open before any
  // pick, or the designated HotPick pre-FINAL); neutral otherwise — and always
  // neutral at FINAL so the green/red number reads.
  const panelOrange = editable
    ? !hotPickSelected || isHotPick
    : isFinal
      ? false
      : isHotPick;
  const boxTint = panelOrange
    ? {background: colors.primary, text: colors.onPrimary}
    : undefined;
  // Picked name: teal normally, orange when it's also the HotPick.
  const pickedNameColor = isHotPick ? colors.primary : colors.accentTeal;
  // Flame: grey selector while editable-and-not-HotPick; lit whenever HotPick;
  // gone once locked-and-not-HotPick (a lock shows instead).
  const flame: 'none' | 'deselected' | 'lit' = isHotPick
    ? 'lit'
    : editable
      ? 'deselected'
      : 'none';
  const lock = !editable;
  // Orange chip outline whenever this is the HotPick, in every state.
  const outlineColor = isHotPick ? colors.primary : undefined;
  // Number: rank while editable; once locked, HotPick shows its rank and a
  // standard pick shows the stake "1" stacked over the rank.
  const points = editable ? rank : isHotPick ? rank : 1;
  const stackedRank = !editable && !isHotPick ? rank : undefined;
  const pointsLabel = isHotPick ? 'HotPick Points' : 'PT';
  const pickedSide: 'home' | 'away' | null =
    pickedTeam === game.home_team
      ? 'home'
      : pickedTeam === game.away_team
        ? 'away'
        : null;

  return (
    <View style={styles.container}>
      <GameChip
        game={game}
        editable={editable}
        onSelectTeam={selectTeam}
        onPressFlame={handleFlamePress}
        pickedSide={pickedSide}
        pickedNameColor={pickedNameColor}
        boxTint={boxTint}
        outlineColor={outlineColor}
        flame={flame}
        lock={lock}
        points={points}
        pointsLabel={pointsLabel}
        stackedRank={stackedRank}
        earnedPoints={existingPick?.points ?? null}
        winnerTeam={game.winner_team}
        awayName={awayTeamName}
        homeName={homeTeamName}
        awayRecord={game.away_record}
        homeRecord={game.home_record}
      />

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
              {'🔥'} {pickSplit.hotpickTotal} HotPick{pickSplit.hotpickTotal !== 1 ? 's' : ''}: {homeTeamName} {pickSplit.hotpickTeamACount} / {pickSplit.hotpickTeamBCount} {awayTeamName}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    // The GameChip is its own outlined pill; the wrapper only spaces it.
    container: {
      marginHorizontal: spacing.sm,
      marginVertical: 4,
    },
    // Pick split bar
    pickSplitContainer: {
      marginHorizontal: spacing.md,
      marginTop: 6,
      marginBottom: 2,
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
  });
