import React, {useEffect} from 'react';
import {View, Text, ScrollView, ActivityIndicator, StyleSheet} from 'react-native';
import {useTournamentStore} from '../stores/tournamentStore';
import {TournamentProgress} from '../components/TournamentProgress';
import {KnockoutBracket} from '../components/KnockoutBracket';
import {useAuth} from '@shared/hooks/useAuth';
import {colors, spacing, borderRadius} from '@shared/theme';
import type {DbTournamentUserTotal} from '@shared/types/database';

/**
 * TournamentBoardScreen — Leaderboard showing pool standings.
 * Never references a specific sport.
 */
export function TournamentBoardScreen() {
  const config = useTournamentStore(s => s.config);
  const leaderboard = useTournamentStore(s => s.leaderboard);
  const userNames = useTournamentStore(s => s.userNames);
  const isLoading = useTournamentStore(s => s.isLoading);
  const fetchLeaderboard = useTournamentStore(s => s.fetchLeaderboard);
  const fetchMatches = useTournamentStore(s => s.fetchMatches);
  const fetchUserPicks = useTournamentStore(s => s.fetchUserPicks);
  const calculateMyScore = useTournamentStore(s => s.calculateMyScore);
  const {user} = useAuth();

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    const load = async () => {
      await fetchMatches();
      await fetchUserPicks(user.id);
      await calculateMyScore(user.id);
    };
    load();
  }, [user?.id, fetchMatches, fetchUserPicks, calculateMyScore, fetchLeaderboard]);

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

  const renderRow = ({item, index}: {item: DbTournamentUserTotal; index: number}) => {
    const isMe = item.user_id === user?.id;
    const rank = index + 1;

    return (
      <View key={item.id} style={[styles.row, isMe && styles.rowHighlight]}>
        <Text style={[styles.rank, isMe && styles.textHighlight]}>{rank}</Text>
        <View style={styles.userInfo}>
          <Text
            style={[styles.userName, isMe && styles.textHighlight]}
            numberOfLines={1}>
            {isMe ? 'You' : (userNames[item.user_id] ?? `Player ${rank}`)}
          </Text>
          <Text style={styles.breakdown}>
            G: {item.group_stage_points} | K: {item.knockout_points}
          </Text>
        </View>
        <Text style={[styles.totalPoints, isMe && styles.textHighlight]}>
          {item.total_points} pts
        </Text>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <TournamentProgress config={config} userId={user?.id ?? ''} />

      <KnockoutBracket config={config} />

      <View style={styles.leaderboard}>
        <Text style={styles.sectionTitle}>Leaderboard</Text>
        {leaderboard.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              Scores will appear here once matches are played.
            </Text>
          </View>
        ) : (
          leaderboard.map((item, index) => renderRow({item, index}))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  leaderboard: {
    flex: 1,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  rowHighlight: {
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  rank: {
    width: 32,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  userName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  breakdown: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  totalPoints: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  textHighlight: {
    color: colors.primary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
