/**
 * REGISTRY-01 — availableUntil date-window tests.
 *
 * These are the only automated proof that the preseason retires itself at
 * nfl_2026 picks-open. The device cannot be time-travelled safely, so the
 * `now` parameter on getEventsByPriority / getEventByCompetition exists
 * specifically to make this testable without touching the system clock.
 */
import {
  getEventsByPriority,
  getEventByCompetition,
  getDefaultEvent,
  getAllEventsUnfiltered,
} from '../registry';

const DURING = Date.parse('2026-08-15T00:00:00Z'); // mid-preseason
const AFTER = Date.parse('2026-09-03T00:00:00Z'); // after nfl_2026 picks open

describe('availableUntil window — during the preseason', () => {
  it('includes nfl_2026_pre and makes it the boot default', () => {
    const events = getEventsByPriority(undefined, DURING);
    expect(events.map(e => e.competition)).toContain('nfl_2026_pre');
    expect(events[0].competition).toBe('nfl_2026_pre');
  });

  it('resolves nfl_2026_pre by competition string', () => {
    const event = getEventByCompetition('nfl_2026_pre', DURING);
    expect(event).toBeDefined();
    expect(event?.name).toBe('NFL 2026 Preseason');
  });
});

describe('availableUntil window — after retirement', () => {
  it('excludes nfl_2026_pre and hands the default back to nfl_2026', () => {
    const events = getEventsByPriority(undefined, AFTER);
    expect(events.map(e => e.competition)).not.toContain('nfl_2026_pre');
    expect(events[0].competition).toBe('nfl_2026');
  });

  it('stops resolving nfl_2026_pre, so a stale invite link cannot switch to it', () => {
    expect(getEventByCompetition('nfl_2026_pre', AFTER)).toBeUndefined();
  });

  it('retires it for getDefaultEvent too', () => {
    // getDefaultEvent delegates to getEventsByPriority, so the window applies
    // without getDefaultEvent needing its own `now` plumbing.
    expect(getDefaultEvent(undefined)).toBeDefined();
  });
});

describe('gating and escape hatches are unchanged', () => {
  it('still hides every sim competition when no visibility list is supplied', () => {
    const during = getEventsByPriority(undefined, DURING).map(e => e.competition);
    const after = getEventsByPriority(undefined, AFTER).map(e => e.competition);
    for (const comps of [during, after]) {
      expect(comps).not.toContain('nfl_2025_sim');
      expect(comps).not.toContain('nfl_2025_simA');
      expect(comps).not.toContain('nfl_2025_simG');
    }
  });

  it('leaves permanent events (no availableUntil) untouched by the window', () => {
    expect(getEventByCompetition('nfl_2026', AFTER)).toBeDefined();
  });

  it('keeps the DEV-only unfiltered registry exempt from the window', () => {
    // getAllEventsUnfiltered is the hot-reload restore hatch — filtering it
    // would break DEV workflows for no production benefit.
    const all = getAllEventsUnfiltered().map(e => e.competition);
    expect(all).toContain('nfl_2026_pre');
    expect(all).toContain('nfl_2025_sim');
  });
});
