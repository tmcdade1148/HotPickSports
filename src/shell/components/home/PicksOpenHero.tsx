// Home's ACTION module, shared by picks_open, picks_locked, and games_live.
// Renders the week-lock strip, the contextual message, the countdown, the CTA,
// and the weekly-trend strip. CTA copy + state cues evolve with the week's
// progress (picks remaining, HotPick designated, games kicked off).
//
// The HotPick card is NOT here — it is its own module (HotPickModule),
// rendered as a sibling directly beneath this one by StateHero.

import React, {useEffect, useMemo, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {ArrowRight} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
// Only isFinalStatus survives here, and only for weekComplete (every game
// FINAL) — a completion question, not a lock question. The week lock reads
// isWeekLocked() below, per rule 11.
import {isFinalStatus} from '@sports/nfl/utils/gameStatus';
import {isSandboxCompetition} from '@shared/utils/competition';
import {singleUnit} from './useCountdown';
// Rule 11: the ONE correct answer to "are picks locked." This is the first
// import of it from src/shell/components/home/ — the gap the map named, where
// Home and Picks answered one question from two places.
import {isWeekLocked} from '@templates/season/utils/weekLock';
import {GamesTagFlame} from '@shared/components/GamesTagFlame';

// Fallback denominator only — preferred source is
// nflStore.totalGamesThisWeek, which is picksMade + scheduledUnpicked.
// Games that kicked off without a pick are treated as losses and drop
// out of the "needs a pick" pool entirely, so the denominator shrinks
// as games lock.
const PICKS_TOTAL_FALLBACK = 16;
// Countdown is a single fixed size — it no longer switches on pick state.
// The earlier full↔compact switch fired late in hydration and visibly
// flashed (see timerSize below).
const TIMER_FONT_COMPACT = 38;
// Urgency buckets used by the contextual message picker.
const URGENT_MINUTES = 6 * 60;   // under 6 hours → "not much time left"
const TIGHT_MINUTES  = 24 * 60;  // under 24 hours → "tight"

export function PicksOpenHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const userPickCount    = useNFLStore(s => s.userPickCount);
  const totalGamesThisWeek = useNFLStore(s => s.totalGamesThisWeek);
  const userHotPick      = useNFLStore(s => s.userHotPick);
  const userHotPickGame  = useNFLStore(s => s.userHotPickGame);
  const weekFirstKickoff = useNFLStore(s => s.weekFirstKickoff);
  const weekState        = useNFLStore(s => s.weekState);
  const currentPhase     = useNFLStore(s => s.currentPhase);
  const currentWeek      = useNFLStore(s => s.currentWeek);
  const liveScores       = useNFLStore(s => s.liveScores);
  // Full week game list. Feeds isWeekLocked() — which needs every game's
  // kickoff to compute MIN(kickoff_at) — and weekComplete, which must
  // denominate against the whole week rather than just the games that have
  // advanced past 'scheduled' in liveScores.
  const seasonGames      = useSeasonStore(s => s.games);

  const isPicksOpenState = weekState === 'picks_open';

  // THE week lock — rule 11. isWeekLocked() (weekLock.ts) is MIN(kickoff_at)
  // across the week's games, mirroring the server's enforce_pick_lock, and it
  // is the ONLY correct answer to "are picks locked."
  //
  // This replaces `isLockingWave`, which was a second, hand-rolled
  // MIN(kickoff) — a 30-second `nowMs` ticker compared against
  // `weekFirstKickoff`, with a weekState guard bolted on. Two implementations
  // of one question is exactly what rule 11 exists to prevent. It also
  // replaces `allGamesLocked`, which walked every game's status: per-game
  // status answers "is THIS game locked," never "is the WEEK locked" — the
  // bug that made WeekLockStrip claim "11 of 16 still editable" after the
  // server had shut all sixteen.
  //
  // No ticker needed here: useCountdownParts re-renders every 30s, so this
  // re-evaluates on the same cadence the old nowMs interval provided.
  const weekLocked = isWeekLocked(seasonGames);

  // COMPLETION, not lock. "Every game is FINAL" is a different question from
  // "is the week locked," and rule 11 doesn't govern it — a week is locked at
  // first kickoff but not complete until the last whistle. This walk is kept
  // (reduced to the all-final half) because the CTA's "WEEK N COMPLETE" state
  // and its layout depend on it. Denominator is the FULL week (seasonGames),
  // not just liveScores, or an early Thursday-Night-only final false-fires it.
  const weekComplete = useMemo(() => {
    // In picks_open the week hasn't started. Without this guard, last week's
    // still-cached final games (seasonGames lags the week rollover) make the
    // hero render "WEEK N COMPLETE" at the top of a fresh picks_open week.
    if (isPicksOpenState || seasonGames.length === 0) return false;
    for (const g of seasonGames) {
      const status = liveScores[g.game_id]?.status ?? g.status ?? '';
      if (!isFinalStatus(status)) return false;
    }
    return true;
  }, [isPicksOpenState, seasonGames, liveScores]);

  const picksSet = userPickCount ?? 0;
  // Effective denominator — picks already made plus games still scheduled
  // (i.e. still pickable). Games that kicked off without a pick are
  // counted as losses by the backend and excluded from this total, so
  // the "X of N" denominator shrinks as the week progresses.
  const picksTotal =
    totalGamesThisWeek > 0 ? totalGamesThisWeek : PICKS_TOTAL_FALLBACK;
  const hotPickDesignated = userHotPick != null;

  // Countdown target: HotPick game if known (else first kickoff).
  // Equality compared at minute granularity to absorb server drift.
  const {target, hotPickIsFirstGame} = useMemo(() => {
    const hpKickoff = userHotPickGame?.kickoff_at
      ? new Date(userHotPickGame.kickoff_at)
      : null;

    if (!hotPickDesignated || !hpKickoff) {
      return {target: weekFirstKickoff, hotPickIsFirstGame: false};
    }
    const isFirst =
      weekFirstKickoff != null &&
      Math.abs(hpKickoff.getTime() - weekFirstKickoff.getTime()) < 60_000;
    return {target: isFirst ? weekFirstKickoff : hpKickoff, hotPickIsFirstGame: isFirst};
  }, [hotPickDesignated, userHotPickGame, weekFirstKickoff]);

  const timer = useCountdownParts(target);
  const minutesLeft = timer
    ? timer.days * 24 * 60 + timer.hours * 60 + timer.minutes
    : null;

  // Reviewer sandboxes (nfl_2025_simA / simG) show a fixed "3 DAYS" countdown
  // rather than a live one — the sim is a frozen Week-8 demo, so the headline
  // should always read 3 days regardless of when the games happen to be dated.
  const competition = useSeasonStore(s => s.config?.competition);
  const sandboxCountdown = isSandboxCompetition(competition);

  const message = buildContextualMessage({
    picksSet,
    totalPicks: picksTotal,
    hotPickDesignated,
    hotPickIsFirstGame,
    minutesLeft,
    kickedOff: weekLocked,
  });

  // Single fixed size — locked to compact per design call. This previously
  // switched (full when no picks → compact once picks made), but the switch
  // fired late in hydration and visibly flashed. A constant can't flash.
  const timerSize = TIMER_FONT_COMPACT;

  // Simple confirmation line below the CTA — independent of the
  // urgency-tinted contextual message above. Mostly factual; flips to
  // bold red when picks are partially started so missed games surface
  // before lock-in.
  const allPicks = picksSet >= picksTotal;

  // CTA label + accessibility label. Brand voice, single-button-size
  // copy that evolves with the week. See style block above for matrix.
  let ctaLabel = 'MAKE YOUR PICKS';
  let ctaAccessibilityLabel = 'Make your picks';
  if (weekComplete) {
    ctaLabel = `WEEK ${currentWeek} COMPLETE`;
    ctaAccessibilityLabel = `Week ${currentWeek} complete — see how it played out`;
  } else if (weekLocked && picksSet > 0 && !allPicks) {
    // Week has locked, user started picking but didn't finish.
    // Locked-without-pick games count as losses (already dropped from
    // picksTotal), so allPicks here means every *still-pickable* game has a
    // pick.
    //
    // ORDER MATTERS: this used to be gated on `isLockingWave` while the
    // branch below was gated on `allGamesLocked` — two different conditions.
    // Both now resolve to the single `weekLocked`, so the more specific case
    // (partial picks) has to be tested BEFORE the general one, or it could
    // never fire. Same two labels, same conditions, one source.
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

  // ACTION reads NO per-game status any more. The message + countdown used to
  // be gated on the HotPick GAME's live/final status — a per-game read
  // answering a week question, and wrong in the obvious case: mid-Sunday with
  // the week shut but the HotPick game not yet kicked off, it still counted
  // down to a lock that had already happened. "Chip = its game. Lock = the
  // week." The chip's own per-game reads live in HotPickModule, where they
  // belong.
  //
  // ACTION also no longer calls getHotPickImpact — that util derives win/loss
  // by comparing scores client-side (hotPickImpact.ts:80), a rule-9 violation.
  // It is unreferenced app-wide and should be deleted in a follow-up.

  // Lead-in label stacked to the left of the big number — "PICKS START
  // LOCKING IN:" sized to match the unit suffix ("DAYS"). Shown in the
  // regular-season picks-open flow AND in the sandbox demo (which mirrors that
  // flow but doesn't report currentPhase === 'REGULAR'). Tracks timerSize, so
  // it stays proportional in both the full and compact countdown sizes.
  const showLockingLabel = currentPhase === 'REGULAR' || sandboxCountdown;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
      ]}>
      {/* No eyebrow. WeekLockStrip is deleted — it was the rule-11 violation
          (per-game status answering the week question, which is how it claimed
          "11 of 16 still editable" after the server had shut all sixteen). The
          tighter gap to the message below is intended. */}

      {/* Message + countdown are pre-LOCK content, gated on the WEEK lock —
          not on any game's status. The moment isWeekLocked() flips, both go. */}
      {!weekLocked && (
        <Text style={[bodyType.regular, styles.contextMessage, {color: colors.textSecondary}]}>
          {message}
        </Text>
      )}

      {/* timer — digits at full size, unit letters at 0.4×, colons between.
          No adjustsFontSizeToFit: combined with nested-Text children of
          different fontSize, iOS shrinks the whole string to a tiny size.
          The string is short enough that a fixed size always fits. */}
      {!weekLocked && (
        <View style={styles.timerRow}>
          {showLockingLabel && (sandboxCountdown || timer) && (
            // Two stacked single-line Texts rather than one Text with a "\n" +
            // numberOfLines: on Android the multi-line variant clipped the second
            // line ("LOCKING IN:"), showing only "PICKS START". flexShrink:0 keeps
            // the column from being squeezed by the big number beside it.
            <View style={styles.lockingLabelWrap}>
              {['PICKS START', 'LOCKING IN:'].map(line => (
                <Text
                  key={line}
                  style={[
                    displayType.display,
                    styles.lockingLabel,
                    {
                      color: colors.textSecondary,
                      fontSize: timerSize * 0.4,
                      lineHeight: Math.round(timerSize * 0.4 * 1.2),
                    },
                  ]}
                  numberOfLines={1}>
                  {line}
                </Text>
              ))}
            </View>
          )}
          {sandboxCountdown ? (
            // Frozen reviewer sandbox — always read "3 DAYS".
            <Text
              style={[
                displayType.display,
                styles.timer,
                styles.timerInRow,
                {
                  color: colors.textPrimary,
                  fontSize: timerSize,
                  lineHeight: Math.round(timerSize * 1.15),
                },
              ]}
              numberOfLines={1}>
              3
              <Text style={{fontSize: timerSize * 0.4}}> DAYS</Text>
            </Text>
          ) : timer ? (
            (() => {
              // Single largest meaningful unit (app-wide rule): days → hours → minutes.
              const su = singleUnit(timer.days, timer.hours, timer.minutes);
              // Spelled-out unit (e.g. "6 DAYS") rather than a terse "6D".
              const unitWord = `${su.unit}${su.value === 1 ? '' : 's'}`.toUpperCase();
              return (
                <Text
                  style={[
                    displayType.display,
                    styles.timer,
                    styles.timerInRow,
                    {
                      color: colors.textPrimary,
                      fontSize: timerSize,
                      lineHeight: Math.round(timerSize * 1.15),
                    },
                  ]}
                  numberOfLines={1}>
                  {su.value}
                  <Text style={{fontSize: timerSize * 0.4}}> {unitWord}</Text>
                </Text>
              );
            })()
          ) : (
            <Text
              style={[bodyType.regular, styles.timerPlaceholder, {color: colors.textTertiary}]}>
              Setting the clock…
            </Text>
          )}
        </View>
      )}

      {/* The HOTPICK module used to render here, inside ACTION. It is now its
          own sibling component (HotPickModule), rendered directly beneath this
          one by StateHero. ACTION owns the countdown, the CTA and the week
          progress; it no longer knows anything about the HotPick card. */}

      {/* CTA — label + emphasis flip once everything is locked in. When
          the user is done the action is no longer primary: dim the button
          and prefix the label with a small "you can still…" lead-in
          stacked directly above the main text. Vertical padding tightens
          in two-line mode so the button keeps the same overall height.
          Left 1/6 is a HotPick-blue "GAMES" strip so the destination is
          obvious at a glance — the button reads as "go to GAMES" not
          just "do this thing." */}
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
        {/* HotPick light-blue destination tag (colors.highlight #A5CCD9) with
            the full-color HotPick flame brand mark — the universal HotPick
            signal so this reads as "go to the picks/games surface." */}
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
            {/* Week-complete follow-up — a small italic line stacked below the
                main label (e.g. "see how it played out" under "WEEK 8 COMPLETE"). */}
            {weekComplete && (
              <Text style={[bodyType.regular, styles.ctaFollowOn, {color: colors.onPrimary}]}>
                see how it played out
              </Text>
            )}
          </View>
          <ArrowRight size={22} color={colors.onPrimary} strokeWidth={3} />
        </View>
      </Pressable>

      {/* ACTION's week-recap prose is deleted. It called buildWeekRecap with
          RAW server counts, so it printed "7 of 16" — while HISTORY's recap
          card, showing the same week, derives "6 of 15" per the map. Two
          recaps disagreeing on one screen; HISTORY owns the recap. */}

      {/* Confirmation line — factual when complete, bold red warning
          when picks are partial so missed games are obvious. */}
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

      {/* WeeklyTrend (the 3 week-pills) is retired. HISTORY owns per-week
          scores now, and the pills coloured week points green/red BY SIGN —
          map rule 5 is explicit that colour means "did the flame hit," never
          positive/negative, because the height already says the sign. Two
          surfaces colouring one number by opposite rules, 40px apart. */}
    </View>
  );
}

/**
 * Pick the right copy for the picks-open hero based on the user's state.
 *
 * When no HotPick is designated the standalone big timer still renders, so
 * those strings end with a colon introducing the countdown below. Once a
 * HotPick is designated the countdown moves inline into the HotPick card, so
 * those strings stand alone with no "kicks off in:" lead-in.
 *
 * SYNC: the Operator Console (tools/hotpick-operator-console_v2.html) AND
 * REFERENCE.md §11 hand-mirror these headlines. If you change copy here,
 * update both and run `node tools/check-home-spec-sync.mjs` (it guards both).
 */
function buildContextualMessage(opts: {
  picksSet: number;
  totalPicks: number;
  hotPickDesignated: boolean;
  hotPickIsFirstGame: boolean;
  minutesLeft: number | null;
  kickedOff: boolean;
}): string {
  const {picksSet, totalPicks, hotPickDesignated, hotPickIsFirstGame, minutesLeft, kickedOff} = opts;
  const allPicks = picksSet >= totalPicks;
  const noPicks = picksSet === 0;
  const urgent = minutesLeft != null && minutesLeft < URGENT_MINUTES;
  const tight  = minutesLeft != null && minutesLeft < TIGHT_MINUTES;

  if (!hotPickDesignated) {
    if (kickedOff && noPicks) {
      return "You've missed kickoff but it's not too late to pick some real winners.";
    }
    if (urgent && !allPicks) return "You're here — might as well make your picks.";
    if (urgent && allPicks)  return 'Almost out of time — set your HotPick. First kickoff in:';
    if (noPicks)             return 'Make your picks. First game kicks off in:';
    if (allPicks)            return 'All picks in — you still need a HotPick. First kickoff in:';
    return `${picksSet} of ${totalPicks} picks in — you still need a HotPick. First kickoff in:`;
  }

  // HotPick designated → the countdown rides inline next to the kickoff time
  // in the HotPick card below, so these messages stand alone (no "kicks off
  // in:" lead-in).
  if (hotPickIsFirstGame) {
    return urgent
      ? 'Bold HotPick.'
      : 'Bold call — your HotPick is the first game.';
  }
  if (allPicks) {
    if (urgent) return 'Locked & loaded.';
    if (tight)  return 'Picks are set.';
    return 'Feeling good about your HotPick?';
  }
  if (urgent) return `${picksSet}/${totalPicks} done. Finish up.`;
  return `${picksSet} of ${totalPicks} in.`;
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
  contextMessage: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
    marginBottom: 8,
  },
  timer: {
    letterSpacing: -0.5,
    marginBottom: 18,
    textAlign: 'center',
    // Android clips/compresses the big italic-800 number inside the tight
    // lineHeight because of its default font padding (iOS lets it overflow), so
    // the countdown looked un-enlarged on Android. includeFontPadding:false is
    // Android-only (ignored on iOS) and gives the glyph its full height.
    includeFontPadding: false,
  },
  // Row that holds the optional "PICKS START LOCKING IN" label to the left of
  // the big countdown number. Carries the bottom margin so the number doesn't.
  // marginBottom matches confirmLine.marginTop (10) so the gap above the CTA
  // equals the gap below it (CTA → picks-status line).
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  timerInRow: {
    marginBottom: 0,
  },
  // fontSize/lineHeight are applied per-render from timerSize so the label
  // matches the unit suffix ("DAYS") in both the full and compact sizes.
  // Column wrapper for the two-line lead-in. flexShrink:0 so the big number
  // beside it can't squeeze the label and force a clip/wrap on Android.
  lockingLabelWrap: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  lockingLabel: {
    letterSpacing: 0.5,
    textAlign: 'right',
    // Same Android fix as styles.timer: drop the default font padding so the
    // lead-in scales with the enlarged countdown instead of being clipped by
    // the tight per-render lineHeight. No-op on iOS.
    includeFontPadding: false,
  },
  timerPlaceholder: {
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  cta: {
    flexDirection: 'row',
    // Outer container is now a flat 0-padding row. Padding moved into
    // ctaBody so the left "GAMES" tag can butt all the way up to the
    // edge of the button.
    borderRadius: borderRadius.md + 2,
    overflow: 'hidden',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: {width: 0, height: 8},
    elevation: 6,
  },
  // Left 1/6 of the button — solid HotPick light-blue strip (colors.highlight
  // #A5CCD9, applied inline). It backs the full-color flame brand mark, so the
  // pale fill is fine here (it no longer needs to carry white content).
  gamesTag: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Right 5/6 — wraps the original label + arrow row. Padding lives
  // here (not on the Pressable) so the GAMES tag bleeds to the edge.
  ctaBody: {
    flex: 5,
    flexDirection: 'row',
    // flex-end so the arrow bottom-aligns with the main label line.
    // Single-line state: visually identical to center (only one line).
    // Two-line state: arrow sits next to "EDIT YOUR PICKS", not centered
    // between the lead-in and the main label.
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  // Tighter vertical padding for two-line states so overall height
  // matches the single-line state.
  ctaBodyTight: {
    paddingVertical: 7,
  },
  // weekComplete stacks small text BELOW the main label — flex-start
  // makes the arrow line up with the top (larger) line instead of the
  // bottom (smaller follow-on).
  ctaBodyTopAligned: {
    alignItems: 'flex-start',
  },
  // Single-line label (no lead-in): center the label block with the arrow so
  // text + arrow share a vertical center. (Base flex-end is only for the
  // two-line lead-in state, where the arrow tracks the bottom/main line.)
  ctaBodyCentered: {
    alignItems: 'center',
  },
  // flexShrink lets adjustsFontSizeToFit kick in when the label is the
  // long "SOME PICKS ARE STILL EDITABLE" copy. Without this the Text
  // requests its natural width and either overflows or pushes the arrow
  // off-screen instead of shrinking.
  ctaLabel: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  // Small italic line stacked below the main label (e.g. "see how it
  // played out" under "WEEK 8 COMPLETE").
  ctaFollowOn: {
    fontSize: 10,
    lineHeight: 11,
    fontStyle: 'italic',
    opacity: 0.78,
    marginTop: 1,
  },
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
