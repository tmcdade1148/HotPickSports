import React, {useEffect, useMemo} from 'react';
import {View, Text, FlatList, ActivityIndicator, StyleSheet} from 'react-native';
import {useTournamentStore} from '../stores/tournamentStore';
import {MatchPickCard} from '../components/MatchPickCard';
import {useAuth} from '@shared/hooks/useAuth';
import {useTheme} from '@shell/theme';

/**
 * MatchPicksScreen — Pick winners for knockout round matches.
 * Renders a MatchPickCard for each upcoming match.
 * Never references a specific sport.
 */
export function MatchPicksScreen() {
  const {colors, spacing} = useTheme();
  const config = useTournamentStore(s => s.config);
  const matches = useTournamentStore(s => s.matches);
  const isLoading = useTournamentStore(s => s.isLoading);
  const fetchMatches = useTournamentStore(s => s.fetchMatches);
  const fetchUserPicks = useTournamentStore(s => s.fetchUserPicks);
  const {user} = useAuth();

  useEffect(() => {
    fetchMatches();
    if (user?.id) {
      fetchUserPicks(user.id);
    }
  }, [user?.id, fetchMatches, fetchUserPicks]);

  const styles = useMemo(() => StyleSheet.create({
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
    list: {
      padding: spacing.md,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  }), [colors, spacing]);

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

  const knockoutMatches = matches.filter(m => m.group_letter === null);

  return (
    <View style={styles.container}>
      {knockoutMatches.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Knockout Matches</Text>
          <Text style={styles.emptyText}>
            Knockout round matches will appear here once the group stage is
            complete.
          </Text>
        </View>
      ) : (
        <FlatList
          data={knockoutMatches}
          keyExtractor={item => item.match_id}
          renderItem={({item}) => (
            <MatchPickCard
              match={item}
              config={config}
              userId={user?.id ?? ''}
            />
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}
