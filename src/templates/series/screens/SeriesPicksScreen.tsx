import React, {useEffect} from 'react';
import {View, Text, FlatList, ActivityIndicator, StyleSheet} from 'react-native';
import {useSeriesStore} from '../stores/seriesStore';
import {RoundSelector} from '../components/RoundSelector';
import {SeriesMatchupCard} from '../components/SeriesMatchupCard';
import {useAuth} from '@shared/hooks/useAuth';
import {colors, spacing} from '@shared/theme';
import type {DbSeriesMatchup} from '@shared/types/database';

/**
 * SeriesPicksScreen — Main playoff picks screen.
 * RoundSelector at top, FlatList of SeriesMatchupCards below.
 * Never references a specific sport.
 */
export function SeriesPicksScreen() {
  const config = useSeriesStore(s => s.config);
  const matchups = useSeriesStore(s => s.matchups);
  const currentRound = useSeriesStore(s => s.currentRound);
  const isLoading = useSeriesStore(s => s.isLoading);
  const setCurrentRound = useSeriesStore(s => s.setCurrentRound);
  const fetchRoundMatchups = useSeriesStore(s => s.fetchRoundMatchups);
  const fetchUserPicks = useSeriesStore(s => s.fetchUserPicks);
  const {user} = useAuth();

  useEffect(() => {
    if (!config) {
      return;
    }
    const roundKey = config.rounds[currentRound]?.key;
    if (!roundKey) {
      return;
    }
    const load = async () => {
      await fetchRoundMatchups(roundKey);
      if (user?.id) {
        await fetchUserPicks(user.id, roundKey);
      }
    };
    load();
  }, [currentRound, config, user?.id, fetchRoundMatchups, fetchUserPicks]);

  if (!config) {
    return null;
  }

  const roundConfig = config.rounds[currentRound];
  const bestOf = roundConfig?.bestOf ?? 7;

  const renderMatchup = ({item}: {item: DbSeriesMatchup}) => (
    <SeriesMatchupCard
      matchup={item}
      config={config}
      userId={user?.id ?? ''}
    />
  );

  return (
    <View style={styles.container}>
      <RoundSelector
        rounds={config.rounds}
        currentRound={currentRound}
        onSelectRound={setCurrentRound}
        accentColor={config.color}
      />

      <View style={styles.roundHeader}>
        <Text style={styles.roundTitle}>
          {roundConfig?.label ?? 'Round'} Picks
        </Text>
        <Text style={styles.bestOfInfo}>Best of {bestOf}</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={config.color} />
        </View>
      ) : matchups.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Matchups</Text>
          <Text style={styles.emptyText}>
            No matchups scheduled for this round yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={matchups}
          keyExtractor={item => item.id}
          renderItem={renderMatchup}
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
  roundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  roundTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  bestOfInfo: {
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
