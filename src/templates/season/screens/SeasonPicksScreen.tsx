import React, {useEffect, useCallback} from 'react';
import {View, Text, FlatList, ActivityIndicator, Alert, StyleSheet} from 'react-native';
import {useSeasonStore} from '../stores/seasonStore';
import {WeekSelector} from '../components/WeekSelector';
import {SeasonMatchCard} from '../components/SeasonMatchCard';
import {PicksProgressHeader} from '../components/PicksProgressHeader';
import {SubmitPicksButton} from '../components/SubmitPicksButton';
import {useAuth} from '@shared/hooks/useAuth';
import {spacing} from '@shared/theme';
import type {DbSeasonGame} from '@shared/types/database';
import {useTheme} from '@shell/theme';

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
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <WeekSelector
        totalWeeks={config.totalWeeks}
        currentWeek={currentWeek}
        onSelectWeek={handleSelectWeek}
        accentColor={colors.secondary}
        playoffStartWeek={config.playoffStartWeek}
      />

      <PicksProgressHeader
        currentWeek={currentWeek}
        pickCount={pickCount}
        totalGames={games.length}
        hotPickCount={hotPickCount}
        hotPicksRequired={config.hotPicksPerWeek}
        accentColor={config.color}
      />

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

      {!isLoading && games.length > 0 && (
        <SubmitPicksButton
          pickCount={pickCount}
          totalGames={games.length}
          hotPickCount={hotPickCount}
          hotPicksRequired={config.hotPicksPerWeek}
          isWeekComplete={isWeekComplete}
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
    paddingVertical: spacing.sm,
  },
  separator: {
    height: 1,
    marginHorizontal: spacing.md,
    opacity: 0.5,
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
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
