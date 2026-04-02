import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useFocusEffect} from '@react-navigation/native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme';
import {supabase} from '@shared/config/supabase';
import {useAuth} from '@shared/hooks/useAuth';


/**
 * WeekScoreModule — Pts. Target (left) + PTS. EARNED (right).
 *
 * Mirrors the two-widget layout on the Picks page. PTS. EARNED subscribes
 * to Realtime so it updates live as the scoring Edge Function writes each
 * game result. Hidden during PRE_SEASON (gated by SeasonEventCard) and
 * when weekState is complete (standings card covers that state).
 */
export function WeekScoreModule() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation<any>();
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const competition = useNFLStore(s => s.competition);
  const {user} = useAuth();

  const [pickCount, setPickCount] = useState(0);
  const [weekEarned, setWeekEarned] = useState<number | null>(null);
  const [lastWeekEarned, setLastWeekEarned] = useState<number | null>(null);
  const [focusCount, setFocusCount] = useState(0);

  // Re-fetch when Home tab regains focus (e.g. after making picks)
  useFocusEffect(
    useCallback(() => {
      setFocusCount(c => c + 1);
    }, []),
  );

  // Fetch current week picks + earned, and previous week's final score
  useEffect(() => {
    if (!user?.id || !currentWeek || currentWeek === 0 || !competition) return;

    const load = async () => {
      const queries: Promise<any>[] = [
        supabase
          .from('season_picks')
          .select('game_id, is_hotpick')
          .eq('user_id', user.id)
          .eq('competition', competition)
          .eq('week', currentWeek),
        supabase
          .from('season_user_totals')
          .select('week_points')
          .eq('user_id', user.id)
          .eq('competition', competition)
          .eq('week', currentWeek)
          .maybeSingle(),
      ];

      // Fetch previous week's final score for Week 2+
      if (currentWeek > 1) {
        queries.push(
          supabase
            .from('season_user_totals')
            .select('week_points')
            .eq('user_id', user.id)
            .eq('competition', competition)
            .eq('week', currentWeek - 1)
            .maybeSingle(),
        );
      }

      const results = await Promise.all(queries);
      const picks = results[0].data;
      const totals = results[1].data;

      setPickCount(picks?.length ?? 0);
      setWeekEarned(totals?.week_points ?? null);

      if (currentWeek > 1 && results[2]) {
        setLastWeekEarned(results[2].data?.week_points ?? null);
      }
    };

    load();
  }, [user?.id, currentWeek, weekState, competition, focusCount]);

  // Realtime: keep PTS. EARNED current as scoring Edge Function writes results
  useEffect(() => {
    if (!user?.id || !currentWeek || currentWeek === 0 || !competition) return;

    const channel = supabase
      .channel(`home_week_earned_${user.id}_${competition}_${currentWeek}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'season_user_totals',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (row.competition === competition && row.week === currentWeek) {
            setWeekEarned(row.week_points ?? null);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, currentWeek, competition]);

  // Hide when no week state, no week, or no picks
  if (!weekState || currentWeek === 0 || pickCount === 0) {
    return null;
  }

  const isSettled = weekState === 'settling' || weekState === 'complete';

  if (isSettled && weekEarned != null) {
    // Single full-width Final Score widget — taps to Picks screen
    return (
      <TouchableOpacity
        style={styles.widgetRow}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('PicksTab' as never)}>
        <View style={styles.widget}>
          <Text style={styles.widgetLabel}>
            Week {currentWeek} {'\u2022'} FINAL SCORE
          </Text>
          <View style={styles.widgetValueRow}>
            <Text style={[
              styles.widgetValue,
              {color: weekEarned >= 0 ? '#1b9a06' : colors.error},
            ]}>
              {weekEarned >= 0 ? '+' : ''}{weekEarned}
            </Text>
            <Text style={[
              styles.widgetPts,
              {color: weekEarned >= 0 ? '#1b9a06' : colors.error},
            ]}>pts</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const earnedDisplay = weekEarned == null
    ? '0'
    : weekEarned > 0
      ? `+${weekEarned}`
      : `${weekEarned}`;

  return (
    <View style={styles.widgetRow}>
      {/* Left — Previous week FINAL (Week 2+) or TBD (Week 1) */}
      <View style={styles.widget}>
        {currentWeek > 1 && lastWeekEarned != null ? (
          <>
            <Text style={styles.widgetLabel}>
              Week {currentWeek - 1} {'\u2022'} FINAL
            </Text>
            <View style={styles.widgetValueRow}>
              <Text style={[
                styles.widgetValue,
                {color: lastWeekEarned >= 0 ? '#1b9a06' : colors.error},
              ]}>
                {lastWeekEarned >= 0 ? '+' : ''}{lastWeekEarned}
              </Text>
              <Text style={[
                styles.widgetPts,
                {color: lastWeekEarned >= 0 ? '#1b9a06' : colors.error},
              ]}>pts</Text>
            </View>
          </>
        ) : (
          <Text style={styles.widgetLabel}>{' '}</Text>
        )}
      </View>

      {/* Right — WEEK X score */}
      <View style={styles.widget}>
        <Text style={styles.widgetLabel}>WEEK {currentWeek}</Text>
        <View style={styles.widgetValueRow}>
          <Text style={[
            styles.widgetValue,
            weekEarned != null && weekEarned > 0 && {color: '#1b9a06'},
            weekEarned != null && weekEarned < 0 && {color: colors.error},
          ]}>
            {earnedDisplay}
          </Text>
          <Text style={styles.widgetPts}>pts</Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  widgetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
    ...typography.body,
    fontWeight: '700',
    fontStyle: 'italic',
    color: colors.textPrimary,
    marginBottom: 2,
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
  widgetTarget: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
  },
});
