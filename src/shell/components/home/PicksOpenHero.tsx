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
// locked / live (ACTION module spec 2): picks are locked, so there's no action —
// the big CTA is GONE. The fall-through renders the quiet surface: a lock marker
// (ChipLock) + the single HotPick, INSIDE the surface. "Big Games to Watch"
// rides below (StateHero). settling/complete are their own heroes (out of scope).
//
// The contextual line is NOT here — it's a single producer (ContextualLine)
// above the hero (currently hidden). The HotPick (HotPickModule) renders INSIDE
// this surface in all three states now — embedded, never a sibling.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {ArrowRight} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
// Rule 11: the ONE answer to "are picks locked" (MIN kickoff). weekLockAtFromGames
// is the same MIN(kickoff_at) as an epoch — the deadline anchor's source.
import {isWeekLocked, weekLockAtFromGames} from '@templates/season/utils/weekLock';
import {isLiveStatus} from '@sports/nfl/utils/gameStatus';
import {formatKickoff} from '@shared/components/GameChip';
import {PickProgressBar} from '@shared/components/PickProgressBar';
import {HotPickModule} from './HotPickModule';
import {Insight} from './Insight';
import {ChipLock} from '@shared/components/ChipLock';

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
  const liveScores         = useNFLStore(s => s.liveScores);
  // Full week game list. Feeds isWeekLocked()/weekLockAtFromGames — every game's
  // kickoff, to compute MIN(kickoff_at).
  const seasonGames        = useSeasonStore(s => s.games);

  // THE week lock — rule 11. isWeekLocked() is MIN(kickoff_at) across the week,
  // mirroring the server's enforce_pick_lock, and the ONLY answer to "are picks
  // locked." Re-evaluated on each store-driven render; the server enforces the
  // exact lock, so the client flip near MIN(kickoff) is cosmetic.
  const weekLocked = isWeekLocked(seasonGames);

  // Games actually in play — drives the "GAMES IN PROGRESS" line under the
  // HotPick (moved off the WEEK eyebrow, spec §7).
  const liveCount = Object.values(liveScores).filter(g => isLiveStatus(g.status)).length;

  const picksSet = userPickCount ?? 0;
  // Effective denominator — picks made plus games still scheduled (pickable).
  const picksTotal =
    totalGamesThisWeek > 0 ? totalGamesThisWeek : PICKS_TOTAL_FALLBACK;
  const hotPickDesignated = userHotPick != null;
  const allPicks = picksSet >= picksTotal;

  // THE lock moment — MIN(kickoff_at) across the week (weekLock.ts), the value
  // the server enforces. The deadline anchor targets THIS, never the HotPick
  // game's own kickoff (trap #1). null in preseason / while loading — handled
  // below, never rendered as blank/NaN.
  const lockAtMs = weekLockAtFromGames(seasonGames);

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

    // Progress label (left). The right side is intentionally empty for now — the
    // ambient "n DAYS LEFT" is dropped; a smarter urgency line is a follow-up.
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
      openCtaLabel = 'GO MAKE YOUR PICKS';
      openCtaA11y = 'Go make your picks';
    } else if (!allPicks) {
      openCtaLabel = 'FINISH YOUR PICKS';
      openCtaA11y = 'Finish your picks';
    } else if (!hotPickDesignated) {
      openCtaLabel = 'TAG YOUR HOTPICK';
      openCtaA11y = 'Tag your HotPick — you are not in until you do';
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
      <>
      <View
        style={[
          styles.card,
          {backgroundColor: colors.surfaceElevated, borderColor: colors.border},
        ]}>
        {/* Deadline anchor — the LOCK moment (MIN kickoff), replacing the old
            countdown headline. "PICKS LOCK" + the time read as one line: equal
            size, the label lighter and the time heavier. */}
        <View style={styles.deadlineRow}>
          {/* Same italic display face as the time, a lighter weight — so the two
              read as one italic line and the time stays the emphasis. */}
          <Text style={[displayType.display, styles.deadlineLabel, {color: colors.textSecondary}]}>
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

        {/* CTA — no flame on the button, ever (spec §6.3). Label + arrow only.
            Sits ABOVE the progress so the bar reads as the result of acting. */}
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

        {/* Progress — below the CTA. Left: count / HotPick-needed / all-in. The
            right side is intentionally empty for now (ambient countdown dropped). */}
        <View style={styles.progressLabelRow}>
          <Text
            style={[bodyType.bold, styles.progressLabelLeft, {color: progressLabelColor}]}
            numberOfLines={1}>
            {progressLabel}
          </Text>
        </View>
        <PickProgressBar picksSet={picksSet} totalGames={picksTotal} />

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

      {/* HotPick hit-rate — directly under the HotPick, above Big Games (spec
          §6). It's about the HotPick, so it belongs to it, not floating below
          the games. */}
      <Insight />
      </>
    );
  }

  // ── LOCKED / LIVE — the quiet surface (spec 2, §6.4) ──────────────────────
  // Picks are locked: there is no action, so the big "GO TO THE GAMES" CTA is
  // GONE. What remains is a lock-marked header + the single HotPick, INSIDE the
  // surface. "Big Games to Watch" rides below as a sibling (StateHero) and fills
  // the reason to stay open. Settling/complete are their own heroes (out of
  // scope). Reached only when weekLocked is true.
  return (
    <>
      <View
        style={[
          styles.card,
          {backgroundColor: colors.surfaceElevated, borderColor: colors.border},
        ]}>
        {/* Lock marker — the Picks-screen padlock (ChipLock, reused), icon-only
            in the top-right corner like a locked game chip (spec §5). No words:
            the WEEK eyebrow already reads "PICKS LOCKED". */}
        <View style={styles.cornerLock} pointerEvents="none">
          <ChipLock size={26} color={colors.textSecondary} />
        </View>

        {/* The single HotPick, INSIDE the surface (Part A). No beckon — it's too
            late to designate one now; HotPickModule renders null if none was set. */}
        <HotPickModule embedded />
      </View>

      {/* Under the HotPick (spec §6/§7): the season HotPick hit-rate, then the
          live "games in progress" pulse — moved off the WEEK eyebrow. */}
      <Insight />
      {liveCount > 0 && (
        <Text style={[bodyType.bold, styles.gamesInProgress, {color: colors.gameWon}]}>
          {liveCount === 1 ? 'GAME IN PROGRESS' : 'GAMES IN PROGRESS'}
        </Text>
      )}
    </>
  );
}

// Stakes slot content — the SEAM (spec §6.5). Returns a real, always-true
// standing (a pool rank, a live streak, a rivalry, or the hit-rate fallback) or
// null. Wired to null until the authentic-line data investigation lands; it must
// NEVER fabricate a stake. Typed string|null so the slot's show/hide is real.
function resolveStakesLine(): string | null {
  return null;
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
  // Deadline anchor: "PICKS LOCK" and the day/time read as one line — equal
  // size, baseline-aligned; the weight difference (label bold, time display-
  // heavy italic) is what separates them, not size.
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  // Same italic display face as the time; lighter weight (600 vs the time's
  // 800) so the label recedes and the time reads as the emphasis.
  deadlineLabel: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  deadlineTime: {
    fontSize: 18,
    letterSpacing: 0.3,
  },
  // Progress label row sits just above the bar, below the CTA. Left count only;
  // the right side is intentionally empty for now (ambient countdown dropped).
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 16,
    marginBottom: 8,
  },
  progressLabelLeft: {
    fontSize: 13,
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  // picks_open CTA — no GAMES tag, so padding lives on the Pressable itself.
  // Sits directly under the deadline (which carries the gap above it).
  ctaOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
  // picks_open CTA label — kept here (the locked/live CTA is gone).
  ctaText: {
    fontSize: 18,
    letterSpacing: 0.5,
  },

  // ── locked / live surface (spec 2) ──────────────────────────────────────
  // Padlock in the card's top-right corner, like a locked game chip (spec §5).
  cornerLock: {
    position: 'absolute',
    top: 12,
    right: 14,
    zIndex: 1,
  },
  // "GAMES IN PROGRESS" line, under the HotPick (moved off the eyebrow, §7).
  gamesInProgress: {
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 10,
  },
});
