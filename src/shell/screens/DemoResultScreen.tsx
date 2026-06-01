// DemoResultScreen — the scored reveal at the end of the onboarding demo.
// Spec: docs/DEMO_WEEK_SPEC.md §7.3.
//
// Reads the user's real (server-scored) nfl_demo week total and shows it on a
// Ladder against ~8 STATIC demo Players (set dressing — not DB rows, see O-2),
// so the new user lands mid-pack on a lively board. Primary CTA pushes toward
// creating their own Contest; that path exits the demo first so the new
// Contest is created against the real competition, not nfl_demo.

import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ArrowRight, Flame, Plus, RotateCcw} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useAuth} from '@shared/hooks/useAuth';
import {useTheme} from '@shell/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {DEMO_COMPETITION} from '@sports/registry';
import {LEXICON} from '@shared/lexicon';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';

// Static demo opponents — fixed names + week scores that bracket a typical
// demo result (~+12 to +28) so the user usually lands ~4th–6th of 9.
const DEMO_OPPONENTS: {name: string; points: number}[] = [
  {name: 'GridironGus', points: 27},
  {name: 'PickSixPam', points: 23},
  {name: 'BlitzBrian', points: 19},
  {name: 'HailMaryHank', points: 16},
  {name: 'RedZoneRae', points: 12},
  {name: 'AudibleAl', points: 9},
  {name: 'CoinFlipKai', points: 5},
  {name: 'BenchwarmerBo', points: 2},
];

interface DemoTotal {
  week_points: number;
  correct_picks: number;
  total_picks: number;
  is_hotpick_correct: boolean | null;
  hotpick_rank: number | null;
}

export function DemoResultScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation<any>();
  const {user} = useAuth();
  const userProfile = useGlobalStore(s => s.userProfile);
  const exitDemo = useGlobalStore(s => s.exitDemo);

  const [total, setTotal] = useState<DemoTotal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('season_user_totals')
      .select('week_points, correct_picks, total_picks, is_hotpick_correct, hotpick_rank')
      .eq('user_id', user.id)
      .eq('competition', DEMO_COMPETITION)
      .eq('week', 1)
      .maybeSingle()
      .then(({data}) => {
        setTotal((data as DemoTotal) ?? null);
        setLoading(false);
      });
  }, [user?.id]);

  const myName = userProfile?.poolie_name || 'You';
  const myPoints = total?.week_points ?? 0;

  // Build the Ladder: opponents + the user, sorted by points desc.
  const ladder = useMemo(() => {
    const rows = [
      ...DEMO_OPPONENTS.map(o => ({name: o.name, points: o.points, isUser: false})),
      {name: myName, points: myPoints, isUser: true},
    ];
    rows.sort((a, b) => b.points - a.points);
    return rows;
  }, [myName, myPoints]);

  const myRank = ladder.findIndex(r => r.isUser) + 1;

  const handleCreate = () => {
    exitDemo();
    navigation.navigate('CreatePool');
  };
  const handleDone = () => {
    exitDemo();
    navigation.navigate('Home');
  };
  const handleTryAgain = () => {
    // Picks are still in place on the (immutable) demo games; go back to the
    // Picks tab to adjust and re-settle. demo-settle is an idempotent upsert.
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.shell} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const ord = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <SafeAreaView style={styles.shell} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.kicker}>DEMO WEEK · FINAL</Text>
        <Text style={styles.score}>
          {myPoints >= 0 ? '+' : ''}{myPoints}
          <Text style={styles.scorePts}> pts</Text>
        </Text>
        <Text style={styles.subhead}>
          You finished {ord(myRank)} of {ladder.length} on {LEXICON.ladder.long}.
        </Text>

        {total && (
          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{total.correct_picks}/{total.total_picks}</Text>
              <Text style={styles.statLabel}>PICKS CORRECT</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.hotpickValue}>
                <Flame
                  size={16}
                  color={total.is_hotpick_correct ? colors.success : colors.error}
                  fill={total.is_hotpick_correct ? colors.success : colors.error}
                />
                <Text style={[
                  styles.statValue,
                  {color: total.is_hotpick_correct ? colors.success : colors.error},
                ]}>
                  {total.is_hotpick_correct ? '+' : '−'}{total.hotpick_rank ?? 0}
                </Text>
              </View>
              <Text style={styles.statLabel}>HOTPICK</Text>
            </View>
          </View>
        )}

        <Text style={styles.ladderTitle}>{LEXICON.ladder.long.toUpperCase()}</Text>
        <View style={styles.ladderCard}>
          {ladder.map((row, i) => (
            <View
              key={`${row.name}-${i}`}
              style={[
                styles.ladderRow,
                row.isUser && {backgroundColor: colors.primary + '1A'},
                i < ladder.length - 1 && styles.ladderRowBorder,
              ]}>
              <Text style={[styles.rank, row.isUser && {color: colors.primary}]}>{i + 1}</Text>
              <Text
                style={[styles.name, row.isUser && {color: colors.primary, fontWeight: '800'}]}
                numberOfLines={1}>
                {row.name}{row.isUser ? ' (you)' : ''}
              </Text>
              <Text style={[styles.points, row.isUser && {color: colors.primary}]}>
                {row.points >= 0 ? '+' : ''}{row.points}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.pitch}>
          That's one week. A real {LEXICON.contest.singular} runs all season — your picks,
          one set, counting across every {LEXICON.contest.singular} you're in.
        </Text>

        <Pressable
          onPress={handleCreate}
          style={({pressed}) => [styles.primaryBtn, {opacity: pressed ? 0.85 : 1}]}
          accessibilityRole="button"
          accessibilityLabel={`Create a ${LEXICON.contest.singular}`}>
          <Plus size={20} color={colors.onPrimary} strokeWidth={2.25} />
          <Text style={styles.primaryLabel}>Create a {LEXICON.contest.singular}</Text>
          <ArrowRight size={18} color={colors.onPrimary} strokeWidth={2.25} />
        </Pressable>

        <Pressable
          onPress={handleTryAgain}
          style={({pressed}) => [styles.ghostBtn, {opacity: pressed ? 0.7 : 1}]}
          accessibilityRole="button"
          accessibilityLabel="Try the demo week again">
          <RotateCcw size={16} color={colors.textSecondary} strokeWidth={2.25} />
          <Text style={styles.ghostLabel}>Try again</Text>
        </Pressable>

        <Pressable
          onPress={handleDone}
          style={({pressed}) => [styles.textBtn, {opacity: pressed ? 0.6 : 1}]}
          accessibilityRole="button"
          accessibilityLabel="Done — back to home">
          <Text style={styles.textBtnLabel}>Done</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  shell: {flex: 1, backgroundColor: colors.background},
  scroll: {padding: spacing.lg, paddingBottom: spacing.xl, alignItems: 'center'},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  kicker: {
    ...bodyType.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  score: {
    ...displayType.display,
    fontSize: 64,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  scorePts: {fontSize: 22, color: colors.textSecondary, fontWeight: '400'},
  subhead: {
    ...bodyType.regular,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  statRow: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, alignSelf: 'stretch'},
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: {...displayType.display, fontSize: 22, color: colors.textPrimary},
  hotpickValue: {flexDirection: 'row', alignItems: 'center', gap: 4},
  statLabel: {
    ...bodyType.bold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginTop: 2,
  },
  ladderTitle: {
    ...bodyType.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  ladderCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  ladderRowBorder: {borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border},
  rank: {...bodyType.bold, fontSize: 14, color: colors.textSecondary, width: 22},
  name: {...bodyType.regular, fontSize: 15, color: colors.textPrimary, flex: 1},
  points: {...bodyType.bold, fontSize: 15, color: colors.textPrimary},
  pitch: {
    ...bodyType.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.lg,
  },
  primaryLabel: {...bodyType.bold, fontSize: 16, color: colors.onPrimary},
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  ghostLabel: {...bodyType.bold, fontSize: 14, color: colors.textSecondary},
  textBtn: {marginTop: spacing.md, paddingVertical: spacing.xs},
  textBtnLabel: {...bodyType.regular, fontSize: 14, color: colors.textSecondary},
});
