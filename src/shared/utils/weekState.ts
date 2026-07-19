// The ONE answer to "is this week still in progress?"
//
// Lives in @shared/utils because both sides need it and neither owns it: the
// global store's season reads (homeRecapSlice) and Home's HISTORY module. It
// sits alongside competition.ts, which both layers already import from.
//
// WHY ONE FUNCTION AND NOT TWO LISTS
// Slice 6a shipped two: readSeasonScope treated picks_open/locked/live as in
// progress, while HistoryModule's local IN_PROGRESS_STATES also included
// settling. During settling they disagreed — seasonTotal counted the week,
// the bars didn't — so IDENTITY's SEASON PTS and HISTORY described different
// seasons. Map §2: "One season total on the screen. If History shows a season
// number too, they're the same number or one is a lie."
//
// The HISTORY head makes the same boundary load-bearing a second time: a week
// is EITHER the head's "this week" OR a settled bar, never both and never
// neither. Two lists cannot guarantee that; one function can.
//
// SETTLING IS IN PROGRESS. Its games are final but the week is not yet scored
// — the server recomputes week_points on a 30-minute cron, so the number is
// still moving. The map's Big-number table puts settling in the "this week,
// actual earned only" row, i.e. the head owns it, so it must not also be a bar.
//
// COMPLETE IS NOT IN PROGRESS. The week is scored and final. The head holds it
// until the next week opens (see the HistoryModule head), at which point it
// becomes a bar with the same number — a seamless rotation.

/** Week states in which the current week is NOT yet a settled, final result. */
const IN_PROGRESS: ReadonlySet<string> = new Set([
  'picks_open',
  'locked',
  'live',
  'settling',
]);

/**
 * True while the given week_state means "this week isn't a finished result
 * yet." Unknown/null states read as NOT in progress, matching the existing
 * fail-safe: an unrecognised state must never hide a real settled week.
 */
export function isWeekInProgress(weekState: string | null | undefined): boolean {
  return weekState != null && IN_PROGRESS.has(weekState);
}
