import type {AnyEventConfig} from '@shared/types/templates';
import {worldCup2026} from './worldcup/config';
import {
  nflSeason,
  nflPreseason2026,
  nflSeasonSim,
  nflSeasonSimA,
  nflSeasonSimG,
} from './nfl/config';
import {nhlPlayoffs2027} from './nhl/config';
import {nflDemo, DEMO_COMPETITION, DEMO_POOL_ID} from './nfl/demoConfig';

const ALL_EVENTS: AnyEventConfig[] = [
  nflSeason,
  nflPreseason2026,
  nflSeasonSim,
  nflSeasonSimA,
  nflSeasonSimG,
  worldCup2026,
  nhlPlayoffs2027,
];

// Onboarding demo (spec: docs/DEMO_WEEK_SPEC.md). Deliberately kept OUT of
// ALL_EVENTS so it never surfaces in the switcher or as a Home event card —
// it is reached only via globalStore.enterDemo(). Exposed here (rather than
// imported from the sport module directly) so the app shell honors Hard
// Rule #4 (shell → SportRegistry → sport module).
export {DEMO_COMPETITION, DEMO_POOL_ID};
export function getDemoEvent(): AnyEventConfig {
  return nflDemo;
}

// Competitions hidden from the public app — only surface for users in
// the server-side beta allowlist (competition_access table). The client
// learns the per-user list from get_visible_competitions and passes it
// to getEventsByPriority below.
//
// Listed here purely as a hint for the empty-allowlist case (before the
// RPC resolves, or if it errors): when we don't know what the user can
// see, hide the gated events by default so a non-beta tester never
// glimpses NFL SIM. Beta testers see them as soon as the RPC returns.
const GATED_COMPETITIONS = new Set([
  'nfl_2025_sim',
  'nfl_2025_simA',
  'nfl_2025_simG',
]);

function filterByVisibility(
  events: AnyEventConfig[],
  visibleCompetitions: readonly string[] | undefined,
): AnyEventConfig[] {
  // No list yet (boot, or RPC error → fail-open is handled in the
  // store; here we fail-closed for the registry so gated comps don't
  // leak during the loading window).
  if (!visibleCompetitions || visibleCompetitions.length === 0) {
    return events.filter(e => !GATED_COMPETITIONS.has(e.competition));
  }
  const visible = new Set(visibleCompetitions);
  return events.filter(e => visible.has(e.competition) || !GATED_COMPETITIONS.has(e.competition));
}

// Time-boxed events (availableUntil) drop out of the registry once the
// date passes: they stop being selectable and stop being the boot
// default. Retirement therefore needs no client release.
function isWithinWindow(e: AnyEventConfig, now: number): boolean {
  if (!e.availableUntil) return true;
  const until = new Date(e.availableUntil).getTime();
  // An unparseable availableUntil keeps the event visible — a typo must
  // never silently delete a live competition mid-window.
  return Number.isFinite(until) ? now < until : true;
}

export function getEventsByPriority(
  visibleCompetitions?: readonly string[],
  now: number = Date.now(),
): AnyEventConfig[] {
  const live = ALL_EVENTS.filter(e => isWithinWindow(e, now));
  return filterByVisibility(live, visibleCompetitions).sort((a, b) => {
    const statusOrder = {active: 0, upcoming: 1, completed: 2};
    const aOrder = statusOrder[a.status];
    const bOrder = statusOrder[b.status];
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    // Within same status, sort by start date
    return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  });
}

export function getDefaultEvent(
  visibleCompetitions?: readonly string[],
  now: number = Date.now(),
): AnyEventConfig {
  return getEventsByPriority(visibleCompetitions, now)[0] ?? worldCup2026;
}

// Resolve a registered event by its competition string, ignoring visibility
// gating. Used when an action targets a specific competition the user already
// has access to (e.g. joining a Contest by invite) and we need to switch the
// active sport to it — RLS still governs what data they can read.
// Retired competitions resolve to undefined so a stale invite link can no
// longer switch the app into one.
export function getEventByCompetition(
  competition: string,
  now: number = Date.now(),
): AnyEventConfig | undefined {
  const e = ALL_EVENTS.find(x => x.competition === competition);
  return e && isWithinWindow(e, now) ? e : undefined;
}

// Unfiltered registry — DEV-only escape hatch used by LoadingScreen to
// restore a persisted active competition across Metro hot reloads,
// including gated competitions (nfl_2025_sim) that the production
// switcher would hide. Never expose this in production UI.
export function getAllEventsUnfiltered(): AnyEventConfig[] {
  return [...ALL_EVENTS];
}
