// DemoResultScreen — the scored reveal at the end of the onboarding demo.
// Spec: docs/DEMO_WEEK_SPEC.md §7.3.
//
// Reads the user's real (server-scored) nfl_demo week total and shows it on a
// Ladder against ~8 STATIC demo Players (set dressing — not DB rows, see O-2),
// so the new user lands mid-pack on a lively board. Primary CTA pushes toward
// creating their own Contest; that path exits the demo first so the new
// Contest is created against the real competition, not nfl_demo.

import React, {useEffect, useMemo, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {Flame, RotateCcw} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useAuth} from '@shared/hooks/useAuth';
import {useTheme} from '@shell/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {DEMO_COMPETITION} from '@sports/registry';
import {LEXICON} from '@shared/lexicon';
import {ordinal} from '@shared/utils/format';
import {hexToRgba} from '@shared/utils/color';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';
import {AvatarBadge} from '@shared/components/AvatarBadge';

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
  const clearDemoReveal = useGlobalStore(s => s.clearDemoReveal);
  const resetDemoGames = useSeasonStore(s => s.resetDemoGames);

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

  const handleDone = async () => {
    // Wipe the run server-side so the demo is a clean slate, then leave.
    try {
      await supabase.rpc('reset_demo');
    } catch {
      // non-critical
    }
    exitDemo();
    // reset, not navigate — clears the demo/onboarding + Welcome screens
    // beneath Home so a back-gesture/swipe can't pop back to the login screen.
    navigation.reset({index: 0, routes: [{name: 'Home'}]});
  };
  const handleTryAgain = async () => {
    // Wipe the previous run (server picks + scores), clear the local reveal,
    // and restore fresh scheduled games, then return to the Picks tab.
    try {
      await supabase.rpc('reset_demo');
    } catch {
      // non-critical
    }
    clearDemoReveal();
    await resetDemoGames();
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

  return (
    <SafeAreaView style={styles.shell} edges={['top', 'bottom']}>
      {/* Summary + Ladder scroll; the two buttons are pinned in a fixed footer
          below so they're always on screen (this is a modal route — no floating
          nav bar, so bottom safe-area is the only clearance). */}
      <ScrollView style={styles.scrollFlex} contentContainerStyle={styles.scroll}>
        <Text style={styles.kicker}>DEMO WEEK · FINAL</Text>
        <Text style={styles.score}>
          {myPoints >= 0 ? '+' : ''}{myPoints}
          <Text style={styles.scorePts}> pts</Text>
        </Text>
        <Text style={styles.subhead}>
          You finished {ordinal(myRank)} of {ladder.length} on {LEXICON.ladder.long}.
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
        {/* Rows visually match the real Ladder (SeasonBoardScreen): separate
            surface cards, rank/avatar/name/points, and the "you" highlight. Mock
            data only — no accordion/RPC. */}
        <View style={styles.ladderList}>
          {ladder.map((row, i) => (
            <View
              key={`${row.name}-${i}`}
              style={[styles.ladderRow, row.isUser && styles.ladderRowMe]}>
              <Text style={styles.rank}>{i + 1}</Text>
              <AvatarBadge avatarKey={null} name={row.name} size={24} />
              <View style={styles.rowInfo}>
                <Text
                  style={[styles.name, row.isUser && styles.nameMe]}
                  numberOfLines={1}>
                  {row.name}{row.isUser ? ' (you)' : ''}
                </Text>
              </View>
              <Text style={[styles.points, row.isUser && styles.pointsMe]}>
                {row.points >= 0 ? '+' : ''}{row.points} pts
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.pitch}>
          Your picks, carried into every {LEXICON.contest.singular} you're in. One record,
          everywhere.
        </Text>
      </ScrollView>

      {/* Pinned footer — always visible. */}
      <View style={styles.footer}>
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
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  shell: {flex: 1, backgroundColor: colors.background},
  scrollFlex: {flex: 1},
  scroll: {padding: spacing.lg, paddingBottom: spacing.lg, alignItems: 'center'},
  footer: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
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
  // Ladder rows — visual match to SeasonBoardScreen (separate surface cards,
  // rank/name/points typography, and the "you" highlight: tinted primary bg +
  // primary border + primary text).
  ladderList: {alignSelf: 'stretch'},
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  ladderRowMe: {
    backgroundColor: hexToRgba(colors.primary, 0.08),
    borderWidth: 1,
    borderColor: colors.primary,
  },
  rank: {width: 28, fontSize: 20, fontWeight: '800', color: colors.primary, textAlign: 'center', lineHeight: 24},
  rowInfo: {flex: 1, marginLeft: spacing.sm},
  name: {fontSize: 16, fontWeight: '500', color: colors.textPrimary},
  nameMe: {color: colors.primary},
  points: {fontSize: 16, fontWeight: '700', color: colors.textPrimary, paddingTop: 2},
  pointsMe: {color: colors.primary},
  pitch: {
    ...bodyType.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
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
