import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, borderRadius} from '@shared/theme';
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
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const competition = useNFLStore(s => s.competition);
  const {user} = useAuth();

  const [potential, setPotential] = useState(0);
  const [pickCount, setPickCount] = useState(0);
  const [weekEarned, setWeekEarned] = useState<number | null>(null);

  // Fetch picks + games for Pts. Target, and initial weekEarned
  useEffect(() => {
    if (!user?.id || !currentWeek || currentWeek === 0 || !competition) return;

    const load = async () => {
      const [{data: picks}, {data: games}, {data: totals}] = await Promise.all([
        supabase
          .from('season_picks')
          .select('game_id, is_hotpick')
          .eq('user_id', user.id)
          .eq('competition', competition)
          .eq('week', currentWeek),
        supabase
          .from('season_games')
          .select('game_id, rank, frozen_rank')
          .eq('competition', competition)
          .eq('week', currentWeek),
        supabase
          .from('season_user_totals')
          .select('week_points')
          .eq('user_id', user.id)
          .eq('competition', competition)
          .eq('week', currentWeek)
          .maybeSingle(),
      ]);

      setPickCount(picks?.length ?? 0);
      setWeekEarned(totals?.week_points ?? null);

      let total = 0;
      for (const pick of picks ?? []) {
        const game = games?.find(g => g.game_id === pick.game_id);
        const rank = game?.frozen_rank ?? game?.rank ?? 1;
        total += pick.is_hotpick ? rank : 1;
      }
      setPotential(total);
    };

    load();
  }, [user?.id, currentWeek, weekState, competition]);

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

  // Hide when no week state, no week, no picks, or week is fully complete
  if (!weekState || currentWeek === 0 || pickCount === 0 || weekState === 'complete') {
    return null;
  }

  const isSettled = weekState === 'settling';

  return (
    <>
      <View style={styles.widgetRow}>
        {/* Left — Pts. Target (switches to Final Score when settling) */}
        <View style={styles.widget}>
          <Text style={styles.widgetLabel}>
            {isSettled && weekEarned != null ? 'Final Score' : 'Pts. Target'}
          </Text>
          <View style={styles.widgetValueRow}>
            <Text style={[
              styles.widgetValue,
              isSettled && weekEarned != null
                ? {color: weekEarned >= 0 ? '#1b9a06' : colors.error}
                : pickCount > 0
                  ? {color: colors.primary}
                  : undefined,
            ]}>
              {isSettled && weekEarned != null
                ? `${weekEarned >= 0 ? '+' : ''}${weekEarned}`
                : `+${potential}`}
            </Text>
            <Text style={styles.widgetPts}>pts</Text>
          </View>
        </View>

        {/* Right — PTS. EARNED (live via Realtime) */}
        <View style={styles.widget}>
          <Text style={styles.widgetLabel}>PTS. EARNED</Text>
          <View style={styles.widgetValueRow}>
            <Text style={[
              styles.widgetValue,
              weekEarned != null && weekEarned > 0 && {color: '#1b9a06'},
              weekEarned != null && weekEarned < 0 && {color: colors.error},
            ]}>
              {weekEarned == null
                ? '0'
                : weekEarned > 0
                  ? `+${weekEarned}`
                  : `${weekEarned}`}
            </Text>
            <Text style={styles.widgetPts}>pts</Text>
          </View>
        </View>
      </View>

    </>
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
});
