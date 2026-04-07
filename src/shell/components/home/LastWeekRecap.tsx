import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme';
import {supabase} from '@shared/config/supabase';
import {useAuth} from '@shared/hooks/useAuth';
import type {TeamConfig} from '@shared/types/templates';

interface LastWeekRecapProps {
  teams: TeamConfig[];
}

interface LastWeekData {
  weekPoints: number;
  correctPicks: number;
  totalPicks: number;
  isHotpickCorrect: boolean | null;
  hotpickRank: number | null;
  hotPickTeamName: string | null;
}

/**
 * LastWeekRecap — compact single-row recap shown on picks_open Home screen for Week 2+.
 * Matches module title style (typography.body, 700, textPrimary).
 */
export function LastWeekRecap({teams}: LastWeekRecapProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const competition = useNFLStore(s => s.competition);
  const {user} = useAuth();

  const weekState = useNFLStore(s => s.weekState);
  const [data, setData] = useState<LastWeekData | null>(null);

  useEffect(() => {
    if (!user?.id || !competition || currentWeek <= 1) return;

    // During 'settling'/'complete', the current week just finished — recap THIS week.
    // During picks_open/live, we're playing the current week — recap the previous one.
    const lastWeek = weekState === 'settling' || weekState === 'complete' ? currentWeek : currentWeek - 1;

    const load = async () => {
      const {data: totals} = await supabase
        .from('season_user_totals')
        .select('week_points, correct_picks, total_picks, is_hotpick_correct, hotpick_rank')
        .eq('user_id', user.id)
        .eq('competition', competition)
        .eq('week', lastWeek)
        .maybeSingle();

      if (!totals) return;

      const {data: hotPick} = await supabase
        .from('season_picks')
        .select('picked_team')
        .eq('user_id', user.id)
        .eq('competition', competition)
        .eq('week', lastWeek)
        .eq('is_hotpick', true)
        .maybeSingle();

      const team = teams?.find(t => t.code === hotPick?.picked_team);
      const teamName = team?.shortName ?? hotPick?.picked_team ?? null;

      setData({
        weekPoints: totals.week_points ?? 0,
        correctPicks: totals.correct_picks ?? 0,
        totalPicks: totals.total_picks ?? 0,
        isHotpickCorrect: totals.is_hotpick_correct,
        hotpickRank: totals.hotpick_rank,
        hotPickTeamName: teamName,
      });
    };

    load();
  }, [user?.id, competition, currentWeek, weekState]);

  if (!data || currentWeek <= 1) return null;

  const lastWeek = currentWeek - 1;
  const pointsColor = data.weekPoints >= 0 ? '#1b9a06' : colors.error;
  const pointsStr = `${data.weekPoints >= 0 ? '+' : ''}${data.weekPoints}`;

  // Contextual observation — references team name for personality
  const teamName = data.hotPickTeamName ?? 'HotPick';
  const observation = (() => {
    const winRate = data.totalPicks > 0 ? data.correctPicks / data.totalPicks : 0;
    const hp = data.isHotpickCorrect;

    if (hp && winRate >= 0.7) {
      return `Strong week all around. The ${teamName} came through and your picks were sharp.`;
    }
    if (hp && winRate < 0.5) {
      return `The ${teamName} saved the week. Regular picks need some work.`;
    }
    if (hp) {
      return `The ${teamName} hit. Solid week.`;
    }
    if (hp === false && winRate >= 0.7) {
      return `Your regular picks were strong but the ${teamName} miss held you back.`;
    }
    if (hp === false && data.weekPoints > 0) {
      return `The ${teamName} didn\u2019t land but your regular picks kept you in the green.`;
    }
    if (hp === false && data.weekPoints <= 0) {
      return `Tough week. The ${teamName} loss was costly. Reset and come back strong.`;
    }
    return null;
  })();

  // HotPick compact: "✅ Bills +5" or "❌ Bills −5"
  const hotPickCompact = (() => {
    if (!data.hotPickTeamName || data.hotpickRank == null || data.isHotpickCorrect == null) return null;
    const icon = data.isHotpickCorrect ? '\u2705' : '\u274C';
    const pts = data.isHotpickCorrect ? `+${data.hotpickRank}` : `\u2212${data.hotpickRank}`;
    return `${icon} ${data.hotPickTeamName} ${pts}`;
  })();

  return (
    <View style={styles.container}>
      {/* HotPick result */}
      {hotPickCompact && (
        <View style={styles.hotPickRow}>
          <Text style={styles.hotPickLabel}>Week {lastWeek}'s HotPick:</Text>
          <Text style={[
            styles.hotPickResult,
            {color: data.isHotpickCorrect ? '#1b9a06' : colors.error},
          ]}>
            {hotPickCompact}
          </Text>
        </View>
      )}

      {/* Contextual observation */}
      {observation && (
        <Text style={styles.observation}>{observation}</Text>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  header: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  pointsValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  pointsLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  picksLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  hotPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  hotPickLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  hotPickResult: {
    fontSize: 15,
    fontWeight: '700',
  },
  observation: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
