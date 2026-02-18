import React, {useEffect} from 'react';
import {View, Text, FlatList, ActivityIndicator, StyleSheet} from 'react-native';
import {useSeasonStore} from '../stores/seasonStore';
import {WeekSelector} from '../components/WeekSelector';
import {SeasonMatchCard} from '../components/SeasonMatchCard';
import {useAuth} from '@shared/hooks/useAuth';
import {colors, spacing} from '@shared/theme';
import type {DbSeasonMatch} from '@shared/types/database';

/**
 * SeasonPicksScreen — Main weekly picks screen.
 * WeekSelector at top, FlatList of SeasonMatchCards below.
 * Never references a specific sport.
 */
export function SeasonPicksScreen() {
  const config = useSeasonStore(s => s.config);
  const matches = useSeasonStore(s => s.matches);
  const currentWeek = useSeasonStore(s => s.currentWeek);
  const isLoading = useSeasonStore(s => s.isLoading);
  const hotPickCount = useSeasonStore(s => s.getHotPickCount());
  const setCurrentWeek = useSeasonStore(s => s.setCurrentWeek);
  const fetchWeekMatches = useSeasonStore(s => s.fetchWeekMatches);
  const fetchUserPicks = useSeasonStore(s => s.fetchUserPicks);
  const {user} = useAuth();

  useEffect(() => {
    const load = async () => {
      await fetchWeekMatches(currentWeek);
      if (user?.id) {
        await fetchUserPicks(user.id, currentWeek);
      }
    };
    load();
  }, [currentWeek, user?.id, fetchWeekMatches, fetchUserPicks]);

  if (!config) {
    return null;
  }

  const renderMatch = ({item}: {item: DbSeasonMatch}) => (
    <SeasonMatchCard
      match={item}
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
      ) : matches.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Matches</Text>
          <Text style={styles.emptyText}>
            No matches scheduled for Week {currentWeek} yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={item => item.id}
          renderItem={renderMatch}
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
