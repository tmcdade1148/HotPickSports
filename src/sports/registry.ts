import type {AnyEventConfig} from '@shared/types/templates';
import {worldCup2026} from './worldcup/config';
import {nfl2026} from './nfl/config';
import {nhlPlayoffs2027} from './nhl/config';

const ALL_EVENTS: AnyEventConfig[] = [worldCup2026, nfl2026, nhlPlayoffs2027];

export function getEventById(id: string): AnyEventConfig | undefined {
  return ALL_EVENTS.find(e => e.eventId === id);
}

export function getEventsByPriority(): AnyEventConfig[] {
  return [...ALL_EVENTS].sort((a, b) => {
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

export function getDefaultEvent(): AnyEventConfig {
  return getEventsByPriority()[0] ?? worldCup2026;
}
