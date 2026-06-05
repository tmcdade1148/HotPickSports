// AdminSeasonControlScreen — super-admin "advance the season" control.
//
// Two layers:
//  1. Season PHASE — move a competition through the canonical phase sequence via
//     the audited admin_advance_season_phase RPC.
//  2. Weekly ENGINE (Weekly Engine spec §6a/§6b) — per-competition readiness
//     indicator (games/odds/ranks from week_readiness) plus the manual, gated
//     Open Picks (open_week_picks) and Advance Week (admin_advance_week) actions.
//     The server is authoritative (gate + audit live in the RPCs); the client
//     only reflects status and enables/disables the buttons.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, View, Pressable, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ChevronLeft, ChevronRight, Check, CircleCheck, CircleAlert, CircleDashed, Lock, FastForward} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {isSandboxCompetition} from '@shared/utils/competition';
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

const WEEK_STATE_LABEL: Record<string, string> = {
  idle: 'Idle',
  picks_open: 'Picks open',
  locked: 'Locked',
  live: 'Live',
  settling: 'Settling',
  complete: 'Complete',
};

interface Readiness {
  games_status: string;
  games_count: number | null;
  games_at: string | null;
  odds_status: string;
  odds_count: number | null;
  odds_expected: number | null;
  odds_at: string | null;
  odds_error: string | null;
  ranks_status: string;
  ranks_count: number | null;
  ranks_at: string | null;
  ranks_error: string | null;
}

interface CompRow {
  competition: string;
  phase: string;
  currentWeek: number | null;
  weekState: string;
  readiness: Readiness | null;
  // Next week's readiness — admin_advance_week gates on it server-side, so the
  // Advance button must mirror it (review #1).
  nextReadiness: Readiness | null;
}

function nextPhaseOf(phase: string): string {
  const idx = PHASE_ORDER.indexOf(phase as typeof PHASE_ORDER[number]);
  if (idx < 0) return 'OFF_SEASON';
  return PHASE_ORDER[(idx + 1) % PHASE_ORDER.length];
}

// competition_config values are jsonb; supabase-js returns them parsed, but some
// legacy rows are double-encoded strings — strip wrapping quotes defensively.
const asStr = (v: any) => String(v ?? '').replace(/^"|"$/g, '');
const asNum = (v: any) => {
  const n = Number(asStr(v));
  return Number.isFinite(n) ? n : null;
};

// The §5c gate, mirrored client-side for display only. Server is authoritative.
function isReady(r: Readiness | null): boolean {
  if (!r) return false;
  return (
    r.games_status === 'ok' && r.odds_status === 'ok' && r.ranks_status === 'ok' &&
    r.odds_count != null && r.odds_expected != null && r.odds_count === r.odds_expected &&
    r.ranks_count != null && r.games_count != null && r.ranks_count === r.games_count
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
  } catch {
    return '—';
  }
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

    // Pull the config keys we need in one query, then pivot per competition.
    const {data: cfgRows} = await supabase
      .from('competition_config')
      .select('competition, key, value')
      .in('key', ['current_phase', 'current_week', 'week_state']);

    const byComp: Record<string, {phase: string; currentWeek: number | null; weekState: string}> = {};
    for (const r of (cfgRows ?? []) as any[]) {
      const c = (byComp[r.competition] ??= {phase: '', currentWeek: null, weekState: 'idle'});
      if (r.key === 'current_phase') c.phase = asStr(r.value);
      else if (r.key === 'current_week') c.currentWeek = asNum(r.value);
      else if (r.key === 'week_state') c.weekState = asStr(r.value) || 'idle';
    }

    // Readiness rows for each competition's current week.
    const {data: wrRows} = await supabase
      .from('week_readiness')
      .select('competition, week_number, games_status, games_count, games_at, odds_status, odds_count, odds_expected, odds_at, odds_error, ranks_status, ranks_count, ranks_at, ranks_error');
    const wrByKey: Record<string, Readiness> = {};
    for (const r of (wrRows ?? []) as any[]) {
      wrByKey[`${r.competition}#${r.week_number}`] = r as Readiness;
    }

    const rows: CompRow[] = Object.entries(byComp)
      .map(([competition, v]) => ({
        competition,
        phase: v.phase,
        currentWeek: v.currentWeek,
        weekState: v.weekState,
        readiness: v.currentWeek != null ? wrByKey[`${competition}#${v.currentWeek}`] ?? null : null,
        nextReadiness: v.currentWeek != null ? wrByKey[`${competition}#${v.currentWeek + 1}`] ?? null : null,
      }))
      .sort((a, b) => a.competition.localeCompare(b.competition));

    setComps(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime (review #6): week_state is advanced by an ESPN-driven trigger and
  // readiness by the prep steps — neither originates on this screen. Subscribe so
  // the indicator + button availability reflect the server without a manual
  // refresh. Debounced to coalesce bursts (e.g. a poll updating many games).
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => { load(); }, 400);
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-season-control')
      .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'competition_config'}, scheduleReload)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'week_readiness'}, scheduleReload)
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [scheduleReload]);

  const advancePhase = (comp: CompRow) => {
    const next = nextPhaseOf(comp.phase);
    const isSandbox = isSandboxCompetition(comp.competition);
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
            if (error) Alert.alert('Could not advance', error.message);
            else await load();
          },
        },
      ],
    );
  };

  // §6b — manual Open Picks for the CURRENT week (gated + confirmed).
  const openPicks = (comp: CompRow) => {
    Alert.alert(
      `Open Week ${comp.currentWeek} picks?`,
      `Open Week ${comp.currentWeek} picks for all Players in ${comp.competition}? This cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Open Picks',
          style: 'destructive',
          onPress: async () => {
            setBusy(comp.competition);
            const {error} = await supabase.rpc('open_week_picks', {p_competition: comp.competition});
            setBusy(null);
            if (error) Alert.alert('Could not open picks', error.message);
            else await load();
          },
        },
      ],
    );
  };

  // §5a surfaced — advance the clock to the next week (gates on the NEW week's
  // readiness server-side; opens its picks atomically).
  const advanceWeek = (comp: CompRow) => {
    const target = (comp.currentWeek ?? 0) + 1;
    Alert.alert(
      `Advance to Week ${target}?`,
      `Close Week ${comp.currentWeek} and open Week ${target} picks for ${comp.competition}.\n\nRequires Week ${comp.currentWeek} fully final and Week ${target} data ready. This cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: `Advance to Week ${target}`,
          style: 'destructive',
          onPress: async () => {
            setBusy(comp.competition);
            const {error} = await supabase.rpc('admin_advance_week', {p_competition: comp.competition});
            setBusy(null);
            if (error) Alert.alert('Could not advance week', error.message);
            else await load();
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
            Move a competition to the next season phase, or run the weekly engine
            (open / advance picks). Every action is server-side and audit-logged.
          </Text>

          {comps.map(comp => {
            const next = nextPhaseOf(comp.phase);
            const isBusy = busy === comp.competition;
            const r = comp.readiness;
            const ready = isReady(r);
            const canOpen = ready && comp.weekState !== 'picks_open' && !isBusy;
            // Advance opens the NEXT week, so mirror the server gate on that
            // week's readiness (review #1) — not the current week's.
            const nextReady = isReady(comp.nextReadiness);
            const canAdvanceWeek = comp.weekState === 'complete' && nextReady && !isBusy;

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
                  onPress={() => advancePhase(comp)}
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

                {/* ── Weekly engine (§6a/§6b) ── */}
                <View style={[styles.weekly, {borderTopColor: colors.border}]}>
                  <Text style={[bodyType.bold, styles.weeklyEyebrow, {color: colors.textSecondary}]}>
                    WEEK {comp.currentWeek ?? '—'} · {WEEK_STATE_LABEL[comp.weekState] ?? comp.weekState}
                  </Text>

                  <CheckRow
                    label="Games"
                    status={r?.games_status}
                    detail={r?.games_count != null ? `${r.games_count} loaded` : 'not loaded'}
                    at={fmtTime(r?.games_at ?? null)}
                    colors={colors}
                  />
                  <CheckRow
                    label="Odds"
                    status={r?.odds_status}
                    detail={
                      r?.odds_count != null && r?.odds_expected != null
                        ? `${r.odds_count} of ${r.odds_expected}`
                        : (r?.odds_error ?? 'pending')
                    }
                    at={fmtTime(r?.odds_at ?? null)}
                    colors={colors}
                  />
                  <CheckRow
                    label="Ranks"
                    status={r?.ranks_status}
                    detail={
                      r?.ranks_count != null
                        ? `${r.ranks_count}${r?.games_count != null ? ` of ${r.games_count}` : ''}`
                        : (r?.ranks_error ?? 'pending')
                    }
                    at={fmtTime(r?.ranks_at ?? null)}
                    colors={colors}
                  />

                  <View style={styles.weekBtnRow}>
                    <Pressable
                      onPress={() => openPicks(comp)}
                      disabled={!canOpen}
                      style={({pressed}) => [
                        styles.weekBtn,
                        {
                          backgroundColor: canOpen ? colors.primary : colors.border,
                          opacity: pressed && canOpen ? 0.85 : 1,
                        },
                      ]}>
                      <Lock size={15} color={canOpen ? colors.onPrimary : colors.textTertiary} />
                      <Text style={[bodyType.bold, styles.weekBtnText, {color: canOpen ? colors.onPrimary : colors.textTertiary}]}>
                        Open Picks
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => advanceWeek(comp)}
                      disabled={!canAdvanceWeek}
                      style={({pressed}) => [
                        styles.weekBtn,
                        {
                          backgroundColor: canAdvanceWeek ? colors.secondary : colors.border,
                          opacity: pressed && canAdvanceWeek ? 0.85 : 1,
                        },
                      ]}>
                      <FastForward size={15} color={canAdvanceWeek ? colors.onPrimary : colors.textTertiary} />
                      <Text style={[bodyType.bold, styles.weekBtnText, {color: canAdvanceWeek ? colors.onPrimary : colors.textTertiary}]}>
                        Advance Week
                      </Text>
                    </Pressable>
                  </View>

                  {!ready && (
                    <Text style={[bodyType.regular, styles.gateHint, {color: colors.textTertiary}]}>
                      Open Picks unlocks when games, odds and ranks are all green.
                    </Text>
                  )}
                  {comp.weekState === 'complete' && !nextReady && (
                    <Text style={[bodyType.regular, styles.gateHint, {color: colors.textTertiary}]}>
                      Advance Week unlocks once Week {(comp.currentWeek ?? 0) + 1}'s games, odds and ranks are all green.
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function CheckRow({
  label, status, detail, at, colors,
}: {
  label: string;
  status: string | undefined;
  detail: string;
  at: string;
  colors: any;
}) {
  const s = status ?? 'pending';
  const Icon = s === 'ok' ? CircleCheck : s === 'failed' ? CircleAlert : CircleDashed;
  const tint = s === 'ok' ? colors.success : s === 'failed' ? colors.error : colors.textTertiary;
  return (
    <View style={styles.checkRow}>
      <Icon size={16} color={tint} />
      <Text style={[bodyType.bold, styles.checkLabel, {color: colors.textPrimary}]}>{label}</Text>
      <Text style={[bodyType.regular, styles.checkDetail, {color: tint}]} numberOfLines={1}>{detail}</Text>
      <Text style={[bodyType.regular, styles.checkAt, {color: colors.textTertiary}]}>{at}</Text>
    </View>
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

  // Weekly engine
  weekly: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  weeklyEyebrow: {fontSize: 11, letterSpacing: 1, marginBottom: 2},
  checkRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  checkLabel: {fontSize: 13, width: 52},
  checkDetail: {fontSize: 12, flex: 1},
  checkAt: {fontSize: 11},
  weekBtnRow: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm},
  weekBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg,
  },
  weekBtnText: {fontSize: 13, letterSpacing: 0.3},
  gateHint: {fontSize: 11, lineHeight: 15, marginTop: 4},
});
