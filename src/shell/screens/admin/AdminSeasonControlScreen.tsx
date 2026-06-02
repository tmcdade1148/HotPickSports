// AdminSeasonControlScreen — super-admin "advance the season" control.
//
// Shows each competition's current phase and lets a super admin move it to the
// next phase in the canonical sequence. The actual write goes through the
// audited, super-admin-gated admin_advance_season_phase RPC (never a raw
// client UPDATE), and advancing to REGULAR_COMPLETE auto-posts each pool's
// regular-season winner via the announce_regular_winners DB trigger.
//
// Scope: this sets the season PHASE. Opening a specific week's picks is still
// the weekly cycle's job (nfl-open-picks / weekly transition).

import React, {useCallback, useEffect, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, View, Pressable, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ChevronLeft, ChevronRight, Check} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';
import {RequireSuperAdmin} from '@shell/components/RequireSuperAdmin';

// Canonical season phase sequence (REFERENCE.md §22 / CLAUDE.md Hard Rule #22).
const PHASE_ORDER = [
  'OFF_SEASON', 'PRE_SEASON', 'REGULAR', 'REGULAR_COMPLETE',
  'PLAYOFFS', 'SUPERBOWL_INTRO', 'SUPERBOWL', 'SEASON_COMPLETE',
] as const;

const PHASE_LABEL: Record<string, string> = {
  OFF_SEASON: 'Off-season',
  PRE_SEASON: 'Pre-season',
  REGULAR: 'Regular season',
  REGULAR_COMPLETE: 'Regular season complete',
  PLAYOFFS: 'Playoffs',
  SUPERBOWL_INTRO: 'Super Bowl intro',
  SUPERBOWL: 'Super Bowl',
  SEASON_COMPLETE: 'Season complete',
};

interface CompRow {
  competition: string;
  phase: string;
}

function nextPhaseOf(phase: string): string {
  const idx = PHASE_ORDER.indexOf(phase as typeof PHASE_ORDER[number]);
  if (idx < 0) return 'OFF_SEASON';
  // Wrap from SEASON_COMPLETE back to OFF_SEASON (start of the next season).
  return PHASE_ORDER[(idx + 1) % PHASE_ORDER.length];
}

export function AdminSeasonControlScreen() {
  return (
    <RequireSuperAdmin>
      <AdminSeasonControlImpl />
    </RequireSuperAdmin>
  );
}

function AdminSeasonControlImpl() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const [comps, setComps] = useState<CompRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {data} = await supabase
      .from('competition_config')
      .select('competition, value')
      .eq('key', 'current_phase');
    const rows: CompRow[] = (data ?? [])
      .map((r: any) => ({competition: r.competition, phase: String(r.value ?? '').replace(/"/g, '')}))
      .sort((a, b) => a.competition.localeCompare(b.competition));
    setComps(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const advance = (comp: CompRow) => {
    const next = nextPhaseOf(comp.phase);
    const isSandbox = comp.competition === 'nfl_2025_sim';
    const winnerNote =
      next === 'REGULAR_COMPLETE'
        ? '\n\nThis posts each pool’s regular-season winner to its Chirps feed.'
        : '';
    Alert.alert(
      `Advance ${comp.competition}?`,
      `${PHASE_LABEL[comp.phase] ?? comp.phase}  →  ${PHASE_LABEL[next] ?? next}` +
        winnerNote +
        (isSandbox ? '\n\n(Sandbox sim — not audited.)' : '\n\nThis is a live competition and is audit-logged.'),
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: `Advance to ${PHASE_LABEL[next] ?? next}`,
          style: 'destructive',
          onPress: async () => {
            setBusy(comp.competition);
            const {error} = await supabase.rpc('admin_advance_season_phase', {
              p_competition: comp.competition,
              p_phase: next,
            });
            setBusy(null);
            if (error) {
              Alert.alert('Could not advance', error.message);
            } else {
              await load();
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.shell, {backgroundColor: colors.background}]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <ChevronLeft color={colors.textPrimary} size={24} />
        </Pressable>
        <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
          SEASON CONTROL
        </Text>
        <View style={{width: 24}} />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[bodyType.regular, styles.intro, {color: colors.textSecondary}]}>
            Move a competition to the next season phase. Each change is server-side
            and audit-logged. Opening a week’s picks is still handled by the
            weekly transition.
          </Text>

          {comps.map(comp => {
            const next = nextPhaseOf(comp.phase);
            const isBusy = busy === comp.competition;
            return (
              <View
                key={comp.competition}
                style={[styles.card, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                <Text style={[bodyType.bold, styles.compName, {color: colors.textPrimary}]}>
                  {comp.competition}
                </Text>

                {/* Phase sequence with the current one highlighted. */}
                <View style={styles.seqWrap}>
                  {PHASE_ORDER.map(p => {
                    const isCurrent = p === comp.phase;
                    return (
                      <View
                        key={p}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isCurrent ? colors.primary + '22' : 'transparent',
                            borderColor: isCurrent ? colors.primary : colors.border,
                          },
                        ]}>
                        {isCurrent && <Check size={11} color={colors.primary} strokeWidth={3} />}
                        <Text
                          style={[
                            bodyType.bold,
                            styles.chipText,
                            {color: isCurrent ? colors.primary : colors.textTertiary},
                          ]}>
                          {PHASE_LABEL[p] ?? p}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <Pressable
                  onPress={() => advance(comp)}
                  disabled={isBusy}
                  style={({pressed}) => [
                    styles.advanceBtn,
                    {backgroundColor: colors.primary, opacity: isBusy ? 0.5 : pressed ? 0.85 : 1},
                  ]}>
                  {isBusy ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <>
                      <Text style={[bodyType.bold, styles.advanceText, {color: colors.onPrimary}]}>
                        Advance to {PHASE_LABEL[next] ?? next}
                      </Text>
                      <ChevronRight size={18} color={colors.onPrimary} />
                    </>
                  )}
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  title: {fontSize: 16, letterSpacing: 0.5},
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  scroll: {padding: spacing.lg, gap: spacing.md},
  intro: {fontSize: 13, lineHeight: 19},
  card: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  compName: {fontSize: 15, fontFamily: 'monospace'},
  seqWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: {fontSize: 10, letterSpacing: 0.3},
  advanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md - 2,
    borderRadius: borderRadius.lg,
    marginTop: spacing.xs,
  },
  advanceText: {fontSize: 14, letterSpacing: 0.3},
});
