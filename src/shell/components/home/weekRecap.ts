/**
 * Shared week-display helpers for Home.
 *
 * These used to live inside HistoryModule.tsx. That file is now TWO components
 * (RecapModule + HistoryModule) and the eyebrow is a third consumer, so the
 * helpers moved here rather than being copied into each — one spelling of
 * "WEEK 7" / "WC".
 *
 * The sign rule that also lived here is now `fmtPoints` in @shared/utils/format:
 * it stopped being a HISTORY rule and became an app-wide one, so it belongs
 * where the GameChip and the Picks screen can reach it too.
 */

import {fullTeamName, teamNickname} from './teamColors';

/**
 * Phases where Home's week modules do not exist at all — there is no season
 * to describe. The WEEK eyebrow, the Recap and the HISTORY chart all check it.
 */
export const HIDDEN_PHASES = ['OFF_SEASON', 'PRE_SEASON'];

/**
 * Phases whose weeks are the PLAYOFF set. The data layer already scopes
 * season_user_totals by phase, so "playoffs start fresh" needs no extra
 * filtering here — the rows simply change underneath. Mirrored in
 * homeRecapSlice's readSeasonScope.
 */
export const PLAYOFF_PHASES = [
  'PLAYOFFS',
  'SUPERBOWL_INTRO',
  'SUPERBOWL',
  'SEASON_COMPLETE',
];

/** One scored week, as `globalStore.recentWeeks` carries it. */
export type WeekRow = {
  week: number;
  total: number;
  correctPicks: number;
  totalPicks: number;
  isHotPickCorrect: boolean | null;
  hotPickRank: number | null;
  /**
   * The week was MISSED — no picks, scored 0 by the finalizer. NOT the same as
   * a played week that netted 0; both carry `total: 0`, and only this tells
   * them apart. HISTORY draws an X for one and a baseline pill for the other.
   */
  isNoShow: boolean;
};

/** Playoff rounds read as rounds, not week numbers. */
const ROUND_LABEL: Record<number, string> = {19: 'WC', 20: 'DIV', 21: 'CONF', 22: 'SB'};

/** Bar label — "W7" in the regular season, "WC"/"DIV"/"CONF"/"SB" in playoffs.
 *  `shortLabel` comes from the active event's `periodLabels.short` (LABELS-01)
 *  and defaults to today's "W". ROUND_LABEL is deliberately untouched: a
 *  preseason has no Wild Card / Divisional / Conference / Super Bowl, so that
 *  branch is unreachable there. */
export function weekLabel(
  week: number,
  isPlayoffs: boolean,
  shortLabel: string = 'W',
): string {
  if (isPlayoffs) return ROUND_LABEL[week] ?? `${shortLabel}${week}`;
  return `${shortLabel}${week}`;
}

/** Eyebrow label — the same idea with room to spell it out: "WEEK 7" / "WC".
 *  `longLabel` from `periodLabels.long`; defaults to today's "WEEK". */
export function sectionWeekLabel(
  week: number,
  isPlayoffs: boolean,
  longLabel: string = 'WEEK',
): string {
  if (isPlayoffs) return ROUND_LABEL[week] ?? `${longLabel} ${week}`;
  return `${longLabel} ${week}`;
}

/**
 * Convert the RAW server counts into the numbers the map says to display.
 *
 * `season_user_totals.total_picks` is the full slate (16) and `correct_picks`
 * INCLUDES the HotPick game when it hit. Verified against live nfl_2025 rows:
 * correct 13 / total 16 / rank 16 / hotpick hit → week_points 28, i.e.
 * `16 + (13 − 1)`. So the raw pair renders "13 of 16".
 *
 * The map forbids that: "The HotPick earns its rank INSTEAD of a base point.
 * A 20-point week is 14 + 6 and reads '6 of 15 Picks' — never '7 of 16,' or
 * the arithmetic on screen stops adding up."
 *
 * So the HotPick is removed from BOTH sides: from the denominator always (it
 * isn't one of the base Picks), and from the numerator only when it hit (a
 * missed HotPick was never in `correct_picks` to begin with). Short weeks fall
 * out for free — a 14-game week reads "n of 13".
 *
 * The DB is correct and untouched; this is a display derivation only.
 */
export function derivePickDisplay(raw: {
  correctPicks: number;
  totalPicks: number;
  isHotPickCorrect: boolean | null;
}): {correct: number; total: number} {
  const {correctPicks, totalPicks, isHotPickCorrect} = raw;
  // No slate yet (an unplayed week) — nothing to derive, and subtracting would
  // produce -1.
  if (totalPicks <= 0) return {correct: 0, total: 0};
  return {
    correct: Math.max(0, correctPicks - (isHotPickCorrect === true ? 1 : 0)),
    total: Math.max(0, totalPicks - 1),
  };
}

/**
 * The derived recap for a settled week — SHARED by RecapModule (the prior-week
 * card) and the complete-state recap-hero (the just-finished week), so the two
 * can never disagree about the HotPick outcome or the week total.
 */
export interface RecapData {
  recap: WeekRow;
  hotPickRank: number | null;
  isHotPickCorrect: boolean | null;
  /** A HotPick was made AND resolved (both rank and outcome known). */
  hpResolved: boolean;
  /** The HotPick's signed contribution: +rank on a hit, −rank on a miss, 0 if none. */
  hpPoints: number;
  /** The week's net total (season_user_totals.week_points). */
  total: number;
  /** The base (non-HotPick) picks — the HotPick removed from both sides. */
  picks: {correct: number; total: number};
}

/**
 * Pick the recap week and derive its numbers ONCE.
 *   weekSettled → the CURRENT week (its games are final and scored)
 *   otherwise   → the most recent FINISHED week (currentWeek − 1)
 * Returns null when there's no scored week at/under the cutoff.
 *
 * A missed week USED to be absent from `recentWeeks` — no row existed, so this
 * fell through to the prior week and the recap showed a stale one. That was the
 * bug behind the Missed Week Zero spec. `finalize_week_for_all_users` now writes
 * a real 0 row with is_no_show, so the missed week IS in `recentWeeks` and is
 * selected here like any other. The fallback is gone by construction: there is
 * no longer a hole to fall through. Nothing here special-cases it — a no-show is
 * simply the latest week at or under the cutoff, and it wins on `week`.
 */
export function selectRecap(
  recentWeeks: WeekRow[],
  currentWeek: number,
  weekSettled: boolean,
): RecapData | null {
  const cutoff = weekSettled ? currentWeek : currentWeek - 1;
  const eligible = recentWeeks
    .filter(w => w.week <= cutoff)
    .sort((a, b) => a.week - b.week);
  const recap = eligible.length > 0 ? eligible[eligible.length - 1] : null;
  if (recap == null) return null;

  const hotPickRank = recap.hotPickRank;
  const isHotPickCorrect = recap.isHotPickCorrect;
  const hpResolved = hotPickRank != null && isHotPickCorrect != null;
  const hpPoints =
    hotPickRank == null || isHotPickCorrect == null
      ? 0
      : isHotPickCorrect
        ? hotPickRank
        : -hotPickRank;
  const picks = derivePickDisplay(recap);

  return {
    recap,
    hotPickRank,
    isHotPickCorrect,
    hpResolved,
    hpPoints,
    total: recap.total,
    picks,
  };
}

/**
 * "BAL" → "BALTIMORE RAVENS" — the full name, used when the team stands ALONE
 * (the matchup's fallback), where there's room for the city.
 */
export function teamDisplayName(abbr: string): string {
  return (fullTeamName(abbr) ?? abbr).toUpperCase();
}

/**
 * The HotPick's game as the recap card renders it: away first, home second —
 * NFL scoreboard order, never "my team first".
 */
export interface RecapMatchup {
  /** Display-ready NICKNAMES, away first ("FALCONS" / "JETS"). */
  away: string;
  home: string;
  /** Which side the HotPick is on, so the card marks the right one (bold + orange). */
  hotPickIsHome: boolean;
}

/**
 * Resolve the recapped week's HotPick game into an away-first matchup.
 *
 * `games` is that week's slate exactly as `seasonStore.allWeekGames` already
 * caches it — this READS what's loaded and never fetches. Ordering reuses the
 * away-first convention seasonStore already spells for the ladder dropdown
 * (`${away_team} @ ${home_team}`).
 *
 * Matched on the picked team, not `game_id`: a team plays at most once in a
 * week, so its abbreviation identifies the game unambiguously — and the
 * prior-week source (`globalStore.lastWeekHotPick`) carries only the team, no
 * game_id, so a game_id match would need new plumbing to work in the eyebrow.
 *
 * Returns null when the week isn't cached or the team's game isn't in it; both
 * callers then fall back to the team name alone — the card's prior behaviour.
 */
export function resolveMatchup(
  games: ReadonlyArray<{home_team: string; away_team: string}> | undefined,
  teamCode: string | null,
): RecapMatchup | null {
  if (!teamCode || games == null) return null;
  const code = teamCode.toUpperCase();
  const game = games.find(
    g =>
      g.home_team?.toUpperCase() === code || g.away_team?.toUpperCase() === code,
  );
  if (!game) return null;
  // Nicknames, not full names: two city+name pairs overflow the line. The
  // team-alone fallback keeps the full name — see teamDisplayName.
  return {
    away: teamNickname(game.away_team) ?? game.away_team,
    home: teamNickname(game.home_team) ?? game.home_team,
    hotPickIsHome: game.home_team?.toUpperCase() === code,
  };
}
