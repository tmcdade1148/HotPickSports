import React, {useEffect, useCallback, useState} from 'react';
import {View, Text, FlatList, ActivityIndicator, Alert, StyleSheet} from 'react-native';
import {useSeasonStore} from '../stores/seasonStore';
import {WeekSelector} from '../components/WeekSelector';
import {SeasonMatchCard} from '../components/SeasonMatchCard';
import {PicksProgressHeader} from '../components/PicksProgressHeader';
import {SubmitPicksButton} from '../components/SubmitPicksButton';
import {useAuth} from '@shared/hooks/useAuth';
import {spacing, borderRadius} from '@shared/theme';
import type {DbSeasonGame} from '@shared/types/database';
import {useTheme} from '@shell/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {supabase} from '@shared/config/supabase';

/**
 * SeasonPicksScreen — Main weekly picks screen.
 * WeekSelector at top, FlatList of SeasonMatchCards below.
 * Never references a specific sport.
 */
export function SeasonPicksScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const config = useSeasonStore(s => s.config);
  const games = useSeasonStore(s => s.games);
  const currentWeek = useSeasonStore(s => s.currentWeek);
  const isLoading = useSeasonStore(s => s.isLoading);
  const hotPickCount = useSeasonStore(s => s.getHotPickCount());
  const pickCount = useSeasonStore(s => s.getPickCount());
  const isWeekComplete = useSeasonStore(s => s.isWeekComplete);
  const setWeekComplete = useSeasonStore(s => s.setWeekComplete);
  const setCurrentWeek = useSeasonStore(s => s.setCurrentWeek);
  const fetchWeekGames = useSeasonStore(s => s.fetchWeekGames);
  const fetchUserPicks = useSeasonStore(s => s.fetchUserPicks);
  const weekPicks = useSeasonStore(s => s.weekPicks);
  const {user} = useAuth();
  const userSeasonTotal = useNFLStore(s => s.userSeasonTotal);
  const dbCurrentWeek = useNFLStore(s => s.currentWeek);
  const activePoolId = useGlobalStore(s => s.activePoolId);

  // Check if all games are final for this week
  const allGamesFinal = games.length > 0 && games.every(g => {
    const status = (g.status ?? '').toUpperCase();
    return status === 'FINAL' || status === 'COMPLETED' || status === 'STATUS_FINAL';
  });

  // Fetch finalized week score
  const [finalScore, setFinalScore] = useState<number | null>(null);
  useEffect(() => {
    if (!user?.id || !config || !allGamesFinal) {
      setFinalScore(null);
      return;
    }
    const fetchScore = async () => {
      const {data} = await supabase
        .from('season_user_totals')
        .select('week_points')
        .eq('user_id', user.id)
        .eq('competition', config.competition)
        .eq('week', currentWeek)
        .maybeSingle();
      setFinalScore(data?.week_points ?? null);
    };
    fetchScore();
  }, [user?.id, config?.competition, currentWeek, allGamesFinal]);

  // Pick split stats per game (from game_pick_stats table)
  const [pickStats, setPickStats] = useState<Record<string, any>>({});
  useEffect(() => {
    if (!config || !activePoolId || games.length === 0) return;
    const fetchStats = async () => {
      const {data} = await supabase
        .from('game_pick_stats')
        .select('game_id, team_a, team_b, team_a_pick_count, team_b_pick_count, total_picks, hotpick_team_a_count, hotpick_team_b_count, hotpick_total')
        .eq('pool_id', activePoolId)
        .eq('competition', config.competition)
        .eq('week', currentWeek);
      if (data) {
        const map: Record<string, any> = {};
        for (const row of data) {
          map[row.game_id] = {
            teamAPickCount: row.team_a_pick_count,
            teamBPickCount: row.team_b_pick_count,
            totalPicks: row.total_picks,
            hotpickTeamACount: row.hotpick_team_a_count,
            hotpickTeamBCount: row.hotpick_team_b_count,
            hotpickTotal: row.hotpick_total,
          };
        }
        setPickStats(map);
      }
    };
    fetchStats();
  }, [config, activePoolId, currentWeek, games.length]);

  // Compute potential week score from current picks
  const potentialWeekScore = (() => {
    if (weekPicks.length === 0) return 0;
    let total = 0;
    for (const pick of weekPicks) {
      const game = games.find(g => g.game_id === pick.game_id);
      const rank = game?.frozen_rank ?? game?.rank ?? 1;
      if (pick.is_hotpick) {
        total += rank;
      } else {
        total += 1;
      }
    }
    return total;
  })();

  useEffect(() => {
    if (!config) {
      return;
    }
    const load = async () => {
      await fetchWeekGames(currentWeek);
      if (user?.id) {
        await fetchUserPicks(user.id, currentWeek);
      }
    };
    load();
  }, [config, currentWeek, user?.id, fetchWeekGames, fetchUserPicks]);

  // Block week navigation if user has picks but no HotPick
  const handleSelectWeek = useCallback(
    (week: number) => {
      if (pickCount > 0 && hotPickCount === 0) {
        Alert.alert(
          'Select Your HotPick',
          'You need to pick a HotPick before switching weeks. Tap the flame icon on any game.',
        );
        return;
      }
      setCurrentWeek(week);
    },
    [pickCount, hotPickCount, setCurrentWeek],
  );

  if (!config) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const renderGame = ({item, index}: {item: DbSeasonGame; index: number}) => (
    <View style={[
      styles.cardWrapper,
      index % 2 === 1 && {backgroundColor: colors.surface},
    ]}>
      <SeasonMatchCard
        game={item}
        config={config}
        userId={user?.id ?? ''}
        pickSplit={pickStats[item.game_id] ?? null}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <WeekSelector
        totalWeeks={config.totalWeeks}
        currentWeek={currentWeek}
        activeWeek={dbCurrentWeek}
        onSelectWeek={handleSelectWeek}
        accentColor={colors.secondary}
        playoffStartWeek={config.playoffStartWeek}
      />

      {!isLoading && games.length > 0 && (
        <>
          <PicksProgressHeader
            currentWeek={currentWeek}
            pickCount={pickCount}
            totalGames={games.length}
            hotPickCount={hotPickCount}
            hotPicksRequired={config.hotPicksPerWeek}
            accentColor={config.color}
          />

          {/* Score widgets */}
          <View style={styles.widgetRow}>
            <View style={styles.widget}>
              <Text style={styles.widgetLabel}>Season Total</Text>
              <View style={styles.widgetValueRow}>
                <Text style={styles.widgetValue}>{userSeasonTotal ?? 0}</Text>
                <Text style={styles.widgetPts}>pts</Text>
              </View>
            </View>
            <View style={styles.widget}>
              <Text style={styles.widgetLabel}>
                {allGamesFinal && finalScore != null ? 'Final Score' : 'Week Potential'}
              </Text>
              <View style={styles.widgetValueRow}>
                <Text style={[
                  styles.widgetValue,
                  allGamesFinal && finalScore != null
                    ? {color: finalScore >= 0 ? '#1b9a06' : colors.error}
                    : pickCount > 0 && {color: colors.primary},
                ]}>
                  {allGamesFinal && finalScore != null
                    ? `${finalScore >= 0 ? '+' : ''}${finalScore}`
                    : `+${potentialWeekScore}`}
                </Text>
                <Text style={styles.widgetPts}>pts</Text>
              </View>
            </View>
          </View>
        </>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={config.color} />
        </View>
      ) : games.length === 0 ? (
        <View style={styles.emptyStateCentered}>
          <Text style={styles.emptyTitle}>No Games</Text>
        </View>
      ) : (
        <FlatList
          data={games}
          keyExtractor={item => item.game_id}
          renderItem={renderGame}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, {backgroundColor: colors.border}]} />
          )}
        />
      )}

      {!isLoading && games.length > 0 && (
        <SubmitPicksButton
          pickCount={pickCount}
          totalGames={games.length}
          hotPickCount={hotPickCount}
          hotPicksRequired={config.hotPicksPerWeek}
          isWeekComplete={isWeekComplete}
          allGamesLocked={games.length > 0 && games.every(g => {
            const status = (g.status ?? '').toUpperCase();
            const kickoffPassed = new Date(g.kickoff_at).getTime() <= Date.now();
            return status === 'FINAL' || status === 'IN_PROGRESS' || status === 'LIVE' || kickoffPassed;
          })}
          onSubmit={() => setWeekComplete(true)}
          accentColor={config.color}
        />
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    paddingTop: 0,
    paddingBottom: 100,
  },
  cardWrapper: {
    paddingVertical: spacing.xs,
  },
  separator: {
    height: 1,
    marginHorizontal: spacing.md,
    opacity: 0.5,
  },
  widgetRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  widget: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.sm + 2,
    alignItems: 'center',
  },
  widgetLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  widgetValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  widgetValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  widgetPts: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  emptyStateCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
