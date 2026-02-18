import React, {useEffect} from 'react';
import {View, Text, FlatList, ActivityIndicator, StyleSheet} from 'react-native';
import {useTournamentStore} from '../stores/tournamentStore';
import {GroupCard} from '../components/GroupCard';
import {useAuth} from '@shared/hooks/useAuth';
import {colors, spacing} from '@shared/theme';

/**
 * GroupPicksScreen — Pick which teams advance from each group.
 * Renders a GroupCard for each group in the config.
 * Never references a specific sport.
 */
export function GroupPicksScreen() {
  const config = useTournamentStore(s => s.config);
  const isLoading = useTournamentStore(s => s.isLoading);
  const fetchUserPicks = useTournamentStore(s => s.fetchUserPicks);
  const {user} = useAuth();

  useEffect(() => {
    if (user?.id) {
      fetchUserPicks(user.id);
    }
  }, [user?.id, fetchUserPicks]);

  if (!config) {
    return null;
  }

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={config.color} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        Pick {config.advancingPerGroup} teams to advance from each group
      </Text>
      <FlatList
        data={config.groups}
        keyExtractor={item => item.name}
        renderItem={({item}) => (
          <GroupCard
            group={item}
            advancingCount={config.advancingPerGroup}
            accentColor={config.color}
            userId={user?.id ?? ''}
          />
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    fontSize: 14,
    color: colors.textSecondary,
    padding: spacing.md,
    textAlign: 'center',
  },
  list: {
    padding: spacing.md,
    paddingTop: 0,
  },
});
