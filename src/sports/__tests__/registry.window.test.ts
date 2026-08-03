/**
 * REGISTRY-01 (as amended by REGISTRY-03) — availableUntil date-window tests.
 *
 * The preseason is invite-led, not default-led: it is registered and
 * switchable by invite code, but status 'upcoming' keeps it out of the
 * default sort so nfl_2026 is the boot default at all times. These tests
 * assert both halves, plus the automatic retirement at picks-open.
 *
 * The device cannot be time-travelled safely, so the `now` parameter on
 * getEventsByPriority / getEventByCompetition / getDefaultEvent exists
 * specifically to make the window testable without touching the clock.
 */
import {
  getEventsByPriority,
  getEventByCompetition,
  getDefaultEvent,
  getAllEventsUnfiltered,
} from '../registry';

const AUG_15 = Date.parse('2026-08-15T00:00:00Z'); // mid-preseason
const SEP_03 = Date.parse('2026-09-03T00:00:00Z'); // after nfl_2026 picks open

describe('during the preseason window', () => {
  it('registers nfl_2026_pre but never makes it the default', () => {
    const events = getEventsByPriority(undefined, AUG_15);
    expect(events.map(e => e.competition)).toContain('nfl_2026_pre');
    expect(events[0].competition).toBe('nfl_2026');
  });

  it('keeps nfl_2026 as the default for the whole window', () => {
    expect(getDefaultEvent(undefined, AUG_15).competition).toBe('nfl_2026');
  });

  it('still resolves nfl_2026_pre by competition string, so invite codes work', () => {
    // getEventByCompetition ignores status — that is what lets an invite
    // code switch a player into a non-default competition.
    const event = getEventByCompetition('nfl_2026_pre', AUG_15);
    expect(event).toBeDefined();
    expect(event?.name).toBe('NFL 2026 Preseason');
    expect(event?.status).toBe('upcoming');
  });
});

describe('after retirement', () => {
  it('drops nfl_2026_pre out of the registry entirely', () => {
    const events = getEventsByPriority(undefined, SEP_03);
    expect(events.map(e => e.competition)).not.toContain('nfl_2026_pre');
    expect(events[0].competition).toBe('nfl_2026');
  });

  it('stops resolving nfl_2026_pre, so a saved selection cannot restore', () => {
    // This is what makes the Sept 2 handoff free: the restore path calls
    // getEventByCompetition, so a persisted preseason choice fails
    // validation and falls back to the default with no extra code.
    expect(getEventByCompetition('nfl_2026_pre', SEP_03)).toBeUndefined();
  });

  it('leaves nfl_2026 as the default', () => {
    expect(getDefaultEvent(undefined, SEP_03).competition).toBe('nfl_2026');
  });
});

describe('gating and escape hatches are unchanged', () => {
  it('still hides every sim competition when no visibility list is supplied', () => {
    const during = getEventsByPriority(undefined, AUG_15).map(e => e.competition);
    const after = getEventsByPriority(undefined, SEP_03).map(e => e.competition);
    for (const comps of [during, after]) {
      expect(comps).not.toContain('nfl_2025_sim');
      expect(comps).not.toContain('nfl_2025_simA');
      expect(comps).not.toContain('nfl_2025_simG');
    }
  });

  it('leaves permanent events (no availableUntil) untouched by the window', () => {
    expect(getEventByCompetition('nfl_2026', SEP_03)).toBeDefined();
  });

  it('keeps the DEV-only unfiltered registry exempt from the window', () => {
    const all = getAllEventsUnfiltered().map(e => e.competition);
    expect(all).toContain('nfl_2026_pre');
    expect(all).toContain('nfl_2025_sim');
  });
});
