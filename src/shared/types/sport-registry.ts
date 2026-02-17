/**
 * Sport Registry — defines every sport/event HotPick supports.
 *
 * Each SportConfig describes the sport at a high level.
 * Each EventConfig describes a specific event within a sport (e.g. "2026 World Cup").
 * Tab configs tell the shell which screens to render for each event.
 *
 * Blueprint reference: Section 2.2 (Sport Switcher), Section 4.2 (Sport-scoped stores)
 */

export type SportTemplate = 'tournament' | 'season';

export interface TabConfig {
  key: string;
  label: string;
  icon: string; // icon name for the tab bar
}

export interface EventConfig {
  eventKey: string; // e.g. 'worldcup_2026'
  label: string; // e.g. 'FIFA World Cup 2026'
  shortLabel: string; // e.g. 'World Cup'
  startDate: string; // ISO 8601
  endDate: string;
  status: 'upcoming' | 'active' | 'completed';
  tabs: TabConfig[];
}

export interface SportConfig {
  sportKey: string; // e.g. 'soccer', 'nfl'
  name: string;
  icon: string;
  template: SportTemplate;
  accentColor: string;
  events: EventConfig[];
}

// ─── Registry Data ──────────────────────────────────────────────────────────

export const SPORT_REGISTRY: SportConfig[] = [
  {
    sportKey: 'soccer',
    name: 'Soccer',
    icon: 'soccer-ball',
    template: 'tournament',
    accentColor: '#1B5E20',
    events: [
      {
        eventKey: 'worldcup_2026',
        label: 'FIFA World Cup 2026',
        shortLabel: 'World Cup',
        startDate: '2026-06-11T00:00:00Z',
        endDate: '2026-07-19T00:00:00Z',
        status: 'upcoming',
        tabs: [
          { key: 'matches', label: 'Matches', icon: 'calendar' },
          { key: 'groups', label: 'Groups', icon: 'grid' },
          { key: 'bracket', label: 'Bracket', icon: 'tournament' },
          { key: 'leaderboard', label: 'Board', icon: 'trophy' },
          { key: 'smacktalk', label: 'SmackTalk', icon: 'chat' },
        ],
      },
    ],
  },
  {
    sportKey: 'nfl',
    name: 'NFL',
    icon: 'football',
    template: 'season',
    accentColor: '#013369',
    events: [
      {
        eventKey: 'nfl_2025',
        label: 'NFL 2025-26 Season',
        shortLabel: 'NFL',
        startDate: '2025-09-04T00:00:00Z',
        endDate: '2026-02-08T00:00:00Z',
        status: 'completed',
        tabs: [
          { key: 'weekly', label: 'Weekly', icon: 'calendar' },
          { key: 'picks', label: 'My Picks', icon: 'checkmark' },
          { key: 'leaderboard', label: 'Board', icon: 'trophy' },
          { key: 'smacktalk', label: 'SmackTalk', icon: 'chat' },
        ],
      },
      {
        eventKey: 'nfl_2026',
        label: 'NFL 2026-27 Season',
        shortLabel: 'NFL',
        startDate: '2026-09-10T00:00:00Z',
        endDate: '2027-02-14T00:00:00Z',
        status: 'upcoming',
        tabs: [
          { key: 'weekly', label: 'Weekly', icon: 'calendar' },
          { key: 'picks', label: 'My Picks', icon: 'checkmark' },
          { key: 'leaderboard', label: 'Board', icon: 'trophy' },
          { key: 'smacktalk', label: 'SmackTalk', icon: 'chat' },
        ],
      },
    ],
  },
];

// ─── Registry Lookup Helpers ────────────────────────────────────────────────

/** Get all sports sorted by priority (active first, then upcoming, then completed) */
export function getSportsSorted(): SportConfig[] {
  const priority: Record<string, number> = { active: 0, upcoming: 1, completed: 2 };

  return [...SPORT_REGISTRY].sort((a, b) => {
    const aMin = Math.min(...a.events.map(e => priority[e.status] ?? 3));
    const bMin = Math.min(...b.events.map(e => priority[e.status] ?? 3));
    return aMin - bMin;
  });
}

/** Find a sport config by sport key */
export function getSport(sportKey: string): SportConfig | undefined {
  return SPORT_REGISTRY.find(s => s.sportKey === sportKey);
}

/** Find an event config by event key */
export function getEvent(eventKey: string): EventConfig | undefined {
  for (const sport of SPORT_REGISTRY) {
    const event = sport.events.find(e => e.eventKey === eventKey);
    if (event) return event;
  }
  return undefined;
}

/** Get the default event — first active event, or first upcoming if none active */
export function getDefaultEvent(): EventConfig | undefined {
  for (const sport of getSportsSorted()) {
    const active = sport.events.find(e => e.status === 'active');
    if (active) return active;
  }
  for (const sport of getSportsSorted()) {
    const upcoming = sport.events.find(e => e.status === 'upcoming');
    if (upcoming) return upcoming;
  }
  return SPORT_REGISTRY[0]?.events[0];
}

/** Get the sport that contains a given event */
export function getSportForEvent(eventKey: string): SportConfig | undefined {
  return SPORT_REGISTRY.find(s => s.events.some(e => e.eventKey === eventKey));
}
