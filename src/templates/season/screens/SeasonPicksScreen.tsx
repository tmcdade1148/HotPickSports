import React, {useEffect} from 'react';
import {View, Text, FlatList, ActivityIndicator, StyleSheet} from 'react-native';
import {useSeasonStore} from '../stores/seasonStore';
import {WeekSelector} from '../components/WeekSelector';
import {SeasonMatchCard} from '../components/SeasonMatchCard';
import {useAuth} from '@shared/hooks/useAuth';
import {colors, spacing} from '@shared/theme';
import type {DbSeasonGame} from '@shared/types/database';

/**
 * SeasonPicksScreen — Main weekly picks screen.
 * WeekSelector at top, FlatList of SeasonMatchCards below.
 * Never references a specific sport.
 */
export function SeasonPicksScreen() {
  const config = useSeasonStore(s => s.config);
  const games = useSeasonStore(s => s.games);
  const currentWeek = useSeasonStore(s => s.currentWeek);
  const isLoading = useSeasonStore(s => s.isLoading);
  const hotPickCount = useSeasonStore(s => s.getHotPickCount());
  const setCurrentWeek = useSeasonStore(s => s.setCurrentWeek);
  const fetchWeekGames = useSeasonStore(s => s.fetchWeekGames);
  const fetchUserPicks = useSeasonStore(s => s.fetchUserPicks);
  const {user} = useAuth();

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

  if (!config) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const renderGame = ({item}: {item: DbSeasonGame}) => (
    <SeasonMatchCard
      game={item}
      config={config}
      userId={user?.id ?? ''}
    />
  );

  return (
    <View style={styles.container}>
      <WeekSelector
        totalWeeks={config.totalWeeks}
        currentWeek={currentWeek}
        onSelectWeek={setCurrentWeek}
        accentColor={config.color}
        playoffStartWeek={config.playoffStartWeek}
      />

      <View style={styles.weekHeader}>
        <Text style={styles.weekTitle}>Week {currentWeek} Picks</Text>
        <Text style={styles.hotPickInfo}>
          {'🔥'} {hotPickCount}/{config.hotPicksPerWeek} HotPicks
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={config.color} />
        </View>
      ) : games.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Games</Text>
          <Text style={styles.emptyText}>
            No games scheduled for Week {currentWeek} yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={games}
          keyExtractor={item => item.game_id}
          renderItem={renderGame}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  weekTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  hotPickInfo: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  list: {
    padding: spacing.md,
    paddingTop: 0,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
