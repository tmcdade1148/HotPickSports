import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme';
import {supabase} from '@shared/config/supabase';
import {useAuth} from '@shared/hooks/useAuth';

/**
 * WeekScoreModule — Current week score + potential max score.
 *
 * Shows previous week's finalized score until the current week has picks/scores.
 * During picks_open with no picks: shows last week's result.
 * During picks_open with picks: shows potential.
 * During live/settling: shows actual scored points.
 */
export function WeekScoreModule() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const {user} = useAuth();

  const [potential, setPotential] = useState(0);
  const [actualPoints, setActualPoints] = useState<number | null>(null);
  const [pickCount, setPickCount] = useState(0);
  const [prevWeekPoints, setPrevWeekPoints] = useState<number | null>(null);
  const [prevWeek, setPrevWeek] = useState(0);

  useEffect(() => {
    if (!user?.id || !currentWeek || currentWeek === 0) return;

    const load = async () => {
      // Fetch current week picks + games + scores
      const [{data: picks}, {data: games}, {data: totals}] = await Promise.all([
        supabase
          .from('season_picks')
          .select('game_id, is_hotpick')
          .eq('user_id', user.id)
          .eq('competition', 'nfl_2026')
          .eq('week', currentWeek),
        supabase
          .from('season_games')
          .select('game_id, rank, frozen_rank')
          .eq('competition', 'nfl_2026')
          .eq('week', currentWeek),
        supabase
          .from('season_user_totals')
          .select('week_points')
          .eq('user_id', user.id)
          .eq('competition', 'nfl_2026')
          .eq('week', currentWeek)
          .maybeSingle(),
      ]);

      setPickCount(picks?.length ?? 0);
      setActualPoints(totals?.week_points ?? null);

      // Calculate potential from current picks
      let total = 0;
      for (const pick of picks ?? []) {
        const game = games?.find(g => g.game_id === pick.game_id);
        const rank = game?.frozen_rank ?? game?.rank ?? 1;
        if (pick.is_hotpick) {
          total += rank;
        } else {
          total += 1;
        }
      }
      setPotential(total);

      // If no current week picks, fetch previous week's score
      if ((!picks || picks.length === 0) && currentWeek > 1) {
        const {data: prevTotals} = await supabase
          .from('season_user_totals')
          .select('week_points, week')
          .eq('user_id', user.id)
          .eq('competition', 'nfl_2026')
          .eq('week', currentWeek - 1)
          .maybeSingle();

        setPrevWeekPoints(prevTotals?.week_points ?? null);
        setPrevWeek(currentWeek - 1);
      } else {
        setPrevWeekPoints(null);
      }
    };

    load();
  }, [user?.id, currentWeek, weekState]);

  // Hide when no state or PRE_SEASON
  if (!weekState || currentWeek === 0) {
    return null;
  }

  // Show previous week's score if no current week activity
  if (pickCount === 0 && prevWeekPoints != null) {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <View style={styles.column}>
            <Text style={styles.label}>WEEK {prevWeek} FINAL</Text>
            <Text style={styles.scoreValue}>
              {prevWeekPoints > 0 ? '+' : ''}{prevWeekPoints}
              <Text style={styles.ptsLabel}> pts</Text>
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // Hide during complete (scores in StandingsBadge) or no picks
  if (weekState === 'complete' || pickCount === 0) {
    return null;
  }

  const isScored = weekState === 'settling' || weekState === 'live';
  const weekPoints = isScored && actualPoints != null ? actualPoints : 0;
  const showPotential = weekState === 'picks_open' || weekState === 'locked';

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.column}>
          <Text style={styles.label}>WEEK {currentWeek}</Text>
          <Text style={styles.scoreValue}>
            {weekPoints > 0 ? '+' : ''}{weekPoints}
            <Text style={styles.ptsLabel}> pts</Text>
          </Text>
        </View>
        <View style={[styles.column, styles.rightColumn]}>
          <Text style={styles.label}>{showPotential ? 'POTENTIAL' : 'SCORED'}</Text>
          <Text style={[styles.scoreValue, showPotential ? {color: colors.textSecondary} : {color: weekPoints >= 0 ? '#1b9a06' : colors.error}]}>
            {showPotential ? `+${potential}` : weekPoints >= 0 ? `+${weekPoints}` : `${weekPoints}`}
            <Text style={styles.ptsLabel}> pts</Text>
          </Text>
        </View>
      </View>
      {weekState === 'live' && (
        <View style={styles.liveIndicator}>
          <View style={[styles.liveDot, {backgroundColor: '#1b9a06'}]} />
          <Text style={[styles.liveText, {color: '#1b9a06'}]}>Live</Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  column: {
    flex: 1,
  },
  rightColumn: {
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  ptsLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
