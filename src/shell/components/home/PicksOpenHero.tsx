// Home's ACTION module, shared by picks_open, picks_locked, and games_live,
// branching on isWeekLocked() (rule 11).
//
// picks_open (this file's redesign — ACTION module spec, piece 4/4): the
// engagement surface the Player sees most of the week. It leads with a DEADLINE
// ANCHOR (the lock moment, not a countdown headline), promotes the progress bar,
// makes the CTA state-aware, pulls the HotPick UP into the surface, and carries
// an optional stakes slot. Composed from a few reused elements — no screen
// rebuild.
//
// locked / live / complete (GO TO THE GAMES / WEEK N COMPLETE) are UNCHANGED —
// they are the separate Big Games spec. This file early-returns the picks_open
// surface and leaves that branch exactly as it shipped.
//
// The contextual line is NOT here — it's a single producer (ContextualLine)
// above the hero (currently hidden). The HotPick card is its own module
// (HotPickModule): a sibling below in locked/live, pulled INSIDE here.

import React, {useEffect, useMemo, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {ArrowRight} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
// isFinalStatus survives for weekComplete (every game FINAL) — a completion
// question, not a lock question. The week lock reads isWeekLocked() (rule 11).
import {isFinalStatus} from '@sports/nfl/utils/gameStatus';
import {isSandboxCompetition} from '@shared/utils/competition';
import {singleUnit} from './useCountdown';
// Rule 11: the ONE answer to "are picks locked" (MIN kickoff). weekLockAtFromGames
// is the same MIN(kickoff_at) as an epoch — the deadline anchor's source.
import {isWeekLocked, weekLockAtFromGames} from '@templates/season/utils/weekLock';
import {formatKickoff} from '@shared/components/GameChip';
import {PickProgressBar} from '@shared/components/PickProgressBar';
import {HotPickModule} from './HotPickModule';
import {GamesTagFlame} from '@shared/components/GamesTagFlame';

// Fallback denominator only — preferred source is nflStore.totalGamesThisWeek
// (picksMade + scheduledUnpicked). Games that kicked off without a pick are
// losses and drop out of the "needs a pick" pool, so the denominator shrinks as
// games lock.
const PICKS_TOTAL_FALLBACK = 16;

export function PicksOpenHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const userPickCount      = useNFLStore(s => s.userPickCount);
  const totalGamesThisWeek = useNFLStore(s => s.totalGamesThisWeek);
  const userHotPick        = useNFLStore(s => s.userHotPick);
  const weekState          = useNFLStore(s => s.weekState);
  const currentWeek        = useNFLStore(s => s.currentWeek);
  const liveScores         = useNFLStore(s => s.liveScores);
  // Full week game list. Feeds isWeekLocked()/weekLockAtFromGames — which need
  // every game's kickoff to compute MIN(kickoff_at) — and weekComplete, which
  // denominates against the whole week, not just liveScores.
  const seasonGames        = useSeasonStore(s => s.games);
  const competition        = useSeasonStore(s => s.config?.competition);

  const isPicksOpenState = weekState === 'picks_open';

  // THE week lock — rule 11. isWeekLocked() is MIN(kickoff_at) across the week,
  // mirroring the server's enforce_pick_lock, and the ONLY answer to "are picks
  // locked." No ticker: useCountdownParts re-renders every 30s.
  const weekLocked = isWeekLocked(seasonGames);

  // COMPLETION, not lock. "Every game is FINAL" ≠ "the week is locked." Kept for
  // the CTA's "WEEK N COMPLETE" state. Denominator is the FULL week (seasonGames)
  // or an early Thursday-Night-only final false-fires it.
  const weekComplete = useMemo(() => {
    // In picks_open the week hasn't started; last week's still-cached finals
    // (seasonGames lags rollover) would otherwise read "COMPLETE" on a fresh week.
    if (isPicksOpenState || seasonGames.length === 0) return false;
    for (const g of seasonGames) {
      const status = liveScores[g.game_id]?.status ?? g.status ?? '';
      if (!isFinalStatus(status)) return false;
    }
    return true;
  }, [isPicksOpenState, seasonGames, liveScores]);

  const picksSet = userPickCount ?? 0;
  // Effective denominator — picks made plus games still scheduled (pickable).
  const picksTotal =
    totalGamesThisWeek > 0 ? totalGamesThisWeek : PICKS_TOTAL_FALLBACK;
  const hotPickDesignated = userHotPick != null;
  const allPicks = picksSet >= picksTotal;

  // THE lock moment — MIN(kickoff_at) across the week (weekLock.ts), the value
  // the server enforces. The deadline line AND the ambient countdown both target
  // THIS, never the HotPick game's own kickoff (spec §6.1, trap #1). null in
  // preseason / while loading — handled below, never rendered as blank/NaN.
  const lockAtMs = weekLockAtFromGames(seasonGames);
  const lockTarget = useMemo(
    () => (lockAtMs != null ? new Date(lockAtMs) : null),
    [lockAtMs],
  );
  const timer = useCountdownParts(lockTarget);

  // Reviewer sandboxes (nfl_2025_sim*) show a fixed "3 DAYS" — the sim is a
  // frozen Week-8 demo, so the ambient countdown should always read 3 days.
  const sandboxCountdown = isSandboxCompetition(competition);

  // ── picks_open surface ────────────────────────────────────────────────────
  // Every hook above runs unconditionally; safe to branch now.
  if (!weekLocked) {
    // Deadline anchor. Reuse GameChip's formatter (spec §6.1: don't write a new
    // one), uppercased and comma-less: "THU 8:20 PM". Degrades to "AT FIRST
    // KICKOFF" when the lock time isn't known yet (never blank / NaN).
    const deadlineTime =
      lockAtMs != null
        ? formatKickoff(new Date(lockAtMs).toISOString()).replace(', ', ' ').toUpperCase()
        : null;

    // Ambient "n DAYS LEFT" — the demoted countdown, pointed at the lock time.
    let daysLeftLabel: string | null = null;
    if (sandboxCountdown) {
      daysLeftLabel = '3 DAYS LEFT';
    } else if (timer) {
      const su = singleUnit(timer.days, timer.hours, timer.minutes);
      daysLeftLabel = `${su.value} ${su.unit.toUpperCase()}${su.value === 1 ? '' : 'S'} LEFT`;
    }

    // Progress label (left).
    let progressLabel: string;
    let progressLabelColor: string;
    if (allPicks && hotPickDesignated) {
      progressLabel = `✓ ALL ${picksTotal} PICKS IN`;
      progressLabelColor = colors.gameWon;
    } else if (allPicks && !hotPickDesignated) {
      progressLabel = `${picksTotal} OF ${picksTotal} · HOTPICK NEEDED`;
      progressLabelColor = colors.primary;
    } else {
      progressLabel = `${picksSet} OF ${picksTotal} PICKS`;
      progressLabelColor = colors.textSecondary;
    }

    // CTA — state-aware, guiding. The TAG-YOUR-HOTPICK state is a hard block:
    // nothing is saved until the HotPick is set, so it's tested BEFORE the
    // done/"VIEW OR REVISE" state (spec §6.3). Vocabulary: tag, never "flame."
    let openCtaLabel: string;
    let openCtaA11y: string;
    let openCtaDimmed = false;
    if (picksSet === 0) {
      openCtaLabel = 'MAKE YOUR PICKS';
      openCtaA11y = 'Make your picks';
    } else if (!allPicks) {
      openCtaLabel = 'FINISH YOUR PICKS';
      openCtaA11y = 'Finish your picks';
    } else if (!hotPickDesignated) {
      openCtaLabel = 'TAG YOUR HOTPICK TO LOCK IN';
      openCtaA11y = 'Tag your HotPick to lock in — you are not in until you do';
    } else {
      // Done — the action is no longer urgent, so it dims.
      openCtaLabel = 'VIEW OR REVISE';
      openCtaA11y = 'View or revise your picks';
      openCtaDimmed = true;
    }
    const openCtaOpacity = openCtaDimmed ? 0.7 : 1;

    // Stakes slot — SHOW/HIDE only. resolveStakesLine() returns a real standing
    // or null; the slot renders it or nothing, never a fabricated stake. WHICH
    // lines are authentic (and the data behind them) is a separate investigation
    // (spec §6.5) — this ships the seam, wired to null until that data lands.
    const stakesLine = resolveStakesLine();

    return (
      <View
        style={[
          styles.card,
          {backgroundColor: colors.surfaceElevated, borderColor: colors.border},
        ]}>
        {/* Deadline anchor — the LOCK moment (MIN kickoff), replacing the old
            countdown headline. */}
        <View style={styles.deadlineRow}>
          <Text style={[bodyType.bold, styles.deadlineLabel, {color: colors.textSecondary}]}>
            PICKS LOCK
          </Text>
          <Text
            style={[displayType.display, styles.deadlineTime, {color: colors.textPrimary}]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}>
            {deadlineTime ?? 'AT FIRST KICKOFF'}
          </Text>
        </View>

        {/* Progress — promoted from footnote. Left: count / HotPick-needed /
            all-in. Right (ambient, grey): the demoted countdown. */}
        <View style={styles.progressLabelRow}>
          <Text
            style={[bodyType.bold, styles.progressLabelLeft, {color: progressLabelColor}]}
            numberOfLines={1}>
            {progressLabel}
          </Text>
          {daysLeftLabel != null && (
            <Text
              style={[bodyType.regular, styles.progressLabelRight, {color: colors.textTertiary}]}
              numberOfLines={1}>
              {daysLeftLabel}
            </Text>
          )}
        </View>
        <PickProgressBar picksSet={picksSet} totalGames={picksTotal} />

        {/* CTA — no flame on the button, ever (spec §6.3). Label + arrow only. */}
        <Pressable
          onPress={() => navigation.navigate('PicksTab')}
          style={({pressed}) => [
            styles.ctaOpen,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
              opacity: pressed ? openCtaOpacity * 0.85 : openCtaOpacity,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={openCtaA11y}>
          <Text
            style={[displayType.display, styles.ctaText, {color: colors.onPrimary}]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}>
            {openCtaLabel}
          </Text>
          <ArrowRight size={22} color={colors.onPrimary} strokeWidth={3} />
        </Pressable>

        {/* HotPick — pulled UP into the surface. Filled = the existing chip;
            empty = a dashed beckon sized to the chip (no reflow). */}
        <HotPickModule embedded beckon beckonUrgent={allPicks && !hotPickDesignated} />

        {/* Stakes slot — a real standing or nothing; never a fabricated stake. */}
        {stakesLine != null && (
          <Text style={[bodyType.regular, styles.stakesLine, {color: colors.textTertiary}]}>
            {stakesLine}
          </Text>
        )}
      </View>
    );
  }

  // ── LOCKED / LIVE / COMPLETE — UNCHANGED (separate Big Games spec) ─────────
  // Reached only once the week has locked, so weekLocked is always true here;
  // the picks_open label branches below are unreachable and kept so this block
  // stays byte-identical to what shipped.
  let ctaLabel = 'MAKE YOUR PICKS';
  let ctaAccessibilityLabel = 'Make your picks';
  if (weekComplete) {
    ctaLabel = `WEEK ${currentWeek} COMPLETE`;
    ctaAccessibilityLabel = `Week ${currentWeek} complete — see how it played out`;
  } else if (weekLocked && picksSet > 0 && !allPicks) {
    ctaLabel = "YOU'RE MISSING A FEW PICKS";
    ctaAccessibilityLabel = "You're missing a few picks";
  } else if (weekLocked) {
    ctaLabel = 'GO TO THE GAMES';
    ctaAccessibilityLabel = 'Go to the games';
  } else if (allPicks && hotPickDesignated) {
    ctaLabel = 'VIEW OR REVISE YOUR PICKS';
    ctaAccessibilityLabel = 'View or revise your picks';
  } else if (picksSet > 0) {
    ctaLabel = 'FINISH YOUR PICKS';
    ctaAccessibilityLabel = 'Finish your picks';
  }
  const missedGames = Math.max(0, picksTotal - picksSet);
  const isPartial = picksSet > 0 && !allPicks;

  const picksConfirm = allPicks
    ? 'All picks set'
    : `${picksSet} of ${picksTotal} picks set`;
  const hotPickConfirm = hotPickDesignated
    ? 'HotPick designated'
    : 'HotPick still needed';
  const confirmLine = isPartial
    ? `You still have ${missedGames} pick${missedGames === 1 ? '' : 's'} to make`
    : allPicks && hotPickDesignated
    ? weekLocked
      ? 'All your picks are in and locked.'
      : 'All your picks are in — revise anytime before kickoff.'
    : `${picksConfirm} · ${hotPickConfirm}`;

  return (
    <View
      style={[
        styles.card,
        {backgroundColor: colors.surfaceElevated, borderColor: colors.border},
      ]}>
      {/* CTA — label + emphasis flip once everything is locked in. Left 1/6 is a
          HotPick-blue "GAMES" strip so the destination is obvious. */}
      <Pressable
        onPress={() => navigation.navigate('PicksTab')}
        style={({pressed}) => {
          const isReviewMode = allPicks && hotPickDesignated && !weekLocked;
          const dimmed = isReviewMode || weekLocked || weekComplete;
          const baseOpacity = dimmed ? 0.7 : 1;
          return [
            styles.cta,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
              opacity: pressed ? baseOpacity * 0.85 : baseOpacity,
            },
          ];
        }}
        accessibilityRole="button"
        accessibilityLabel={`Go to games — ${ctaAccessibilityLabel}`}>
        {/* HotPick light-blue destination tag with the full-color flame brand
            mark — the universal "go to the picks/games surface" signal. */}
        <View style={[styles.gamesTag, {backgroundColor: colors.highlight}]}>
          <GamesTagFlame size={44} />
        </View>

        <View style={[
          styles.ctaBody,
          weekComplete ? styles.ctaBodyTight : null,
          weekComplete ? styles.ctaBodyTopAligned : styles.ctaBodyCentered,
        ]}>
          <View style={styles.ctaLabel}>
            <Text
              style={[displayType.display, styles.ctaText, {color: colors.onPrimary}]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.55}>
              {ctaLabel}
            </Text>
            {weekComplete && (
              <Text style={[bodyType.regular, styles.ctaFollowOn, {color: colors.onPrimary}]}>
                see how it played out
              </Text>
            )}
          </View>
          <ArrowRight size={22} color={colors.onPrimary} strokeWidth={3} />
        </View>
      </Pressable>

      {/* Confirmation line — factual when complete, bold red warning when picks
          are partial so missed games are obvious. */}
      {!weekComplete && (
        <Text
          style={[
            isPartial ? bodyType.bold : bodyType.regular,
            styles.confirmLine,
            isPartial
              ? {color: colors.error, fontStyle: 'normal'}
              : {color: colors.textTertiary},
          ]}>
          {confirmLine}
        </Text>
      )}
    </View>
  );
}

// Stakes slot content — the SEAM (spec §6.5). Returns a real, always-true
// standing (a pool rank, a live streak, a rivalry, or the hit-rate fallback) or
// null. Wired to null until the authentic-line data investigation lands; it must
// NEVER fabricate a stake. Typed string|null so the slot's show/hide is real.
function resolveStakesLine(): string | null {
  return null;
}

function useCountdownParts(
  target: Date | null,
): {days: number; hours: number; minutes: number} | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return null;
  const diff = Math.max(0, target.getTime() - now);
  const totalMinutes = Math.floor(diff / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return {days, hours, minutes};
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: 18,
    borderRadius: borderRadius.lg + 2,
    borderWidth: 1,
  },

  // ── picks_open surface ──────────────────────────────────────────────────
  // Deadline anchor: "PICKS LOCK" small-caps beside the day/time, baseline-aligned.
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  deadlineLabel: {
    fontSize: 13,
    letterSpacing: 1,
  },
  deadlineTime: {
    fontSize: 22,
    letterSpacing: 0.3,
  },
  // Progress label row sits just above the bar. Left count, right ambient countdown.
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  progressLabelLeft: {
    fontSize: 13,
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  progressLabelRight: {
    fontSize: 12,
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  // picks_open CTA — no GAMES tag, so padding lives on the Pressable itself.
  ctaOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md + 2,
    overflow: 'hidden',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: {width: 0, height: 8},
    elevation: 6,
  },
  // Optional bottom stakes line.
  stakesLine: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 14,
  },

  // ── locked / live / complete CTA (unchanged) ────────────────────────────
  cta: {
    flexDirection: 'row',
    borderRadius: borderRadius.md + 2,
    overflow: 'hidden',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: {width: 0, height: 8},
    elevation: 6,
  },
  gamesTag: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBody: {
    flex: 5,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  ctaBodyTight: {
    paddingVertical: 7,
  },
  ctaBodyTopAligned: {
    alignItems: 'flex-start',
  },
  ctaBodyCentered: {
    alignItems: 'center',
  },
  ctaLabel: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  ctaFollowOn: {
    fontSize: 10,
    lineHeight: 11,
    fontStyle: 'italic',
    opacity: 0.78,
    marginTop: 1,
  },
  // Shared by both CTAs — same size/tracking.
  ctaText: {
    fontSize: 18,
    letterSpacing: 0.5,
  },
  confirmLine: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
  },
});
