/**
 * SWITCHER-01 §7 — getConnectedEvents (the Event Switcher's list).
 *
 * The switcher answers "where am I playing", not "what does the platform
 * run". These tests pin the four rules that keep the list honest:
 *   1. the connected list drives inclusion;
 *   2. the default landing event is ALWAYS present, so the list is never
 *      empty and a brand-new Player never faces an empty switcher;
 *   3. an out-of-window (retired) event is excluded even if still connected;
 *   4. a gated sim stays excluded without the allowlist, included with it.
 *
 * As with the window tests, `now` is a parameter precisely so the date-boxed
 * behaviour is assertable without touching the device clock.
 */
import {getConnectedEvents} from '../registry';

const AUG_15 = Date.parse('2026-08-15T00:00:00Z'); // mid-preseason
const SEP_03 = Date.parse('2026-09-03T00:00:00Z'); // after nfl_2026 picks open

const comps = (connected: string[], visible?: string[], now = AUG_15) =>
  getConnectedEvents(connected, visible, now).map(e => e.competition);

describe('the connected list drives inclusion', () => {
  it('includes an event the Player has a Contest in', () => {
    expect(comps(['nfl_2026_pre'])).toContain('nfl_2026_pre');
  });

  it('excludes an event the Player is NOT connected to', () => {
    // world_cup_2026 is registered and in-window, but nobody has a Contest in
    // it — listing every registered event would surface it (spec §2c/§6).
    expect(comps(['nfl_2026_pre'])).not.toContain('world_cup_2026');
  });
});

describe('the default landing event is always present', () => {
  it('appears for a Player connected to nothing', () => {
    // The one case that would otherwise produce an empty switcher.
    expect(comps([])).toEqual(['nfl_2026']);
  });

  it('appears alongside a connected event without being duplicated', () => {
    const list = comps(['nfl_2026_pre']);
    expect(list).toEqual(['nfl_2026', 'nfl_2026_pre']);
  });

  it('is not double-counted when the Player is connected to it', () => {
    expect(comps(['nfl_2026'])).toEqual(['nfl_2026']);
  });
});

describe('the availableUntil window still applies', () => {
  it('drops a retired event even while it is still connected', () => {
    // This is the Sept 2 handoff: the preseason retires on its own, so a
    // Player who played it stops being offered it with no client release.
    const list = comps(['nfl_2026_pre', 'nfl_2026'], undefined, SEP_03);
    expect(list).not.toContain('nfl_2026_pre');
    expect(list).toEqual(['nfl_2026']);
  });

  it('leaves only the default once every connected event has retired', () => {
    expect(comps(['nfl_2026_pre'], undefined, SEP_03)).toEqual(['nfl_2026']);
  });
});

describe('visibility gating is inherited, not re-implemented', () => {
  it('hides a gated sim from a Player without the allowlist', () => {
    // Connected is not enough — a non-beta account must never glimpse a sim.
    expect(comps(['nfl_2025_sim'])).not.toContain('nfl_2025_sim');
  });

  it('shows a gated sim to an allowlisted tester who is connected to it', () => {
    expect(comps(['nfl_2025_sim'], ['nfl_2025_sim', 'nfl_2026'])).toContain(
      'nfl_2025_sim',
    );
  });

  it('still hides a gated sim the allowlisted tester has no Contest in', () => {
    const list = comps(['nfl_2026'], ['nfl_2025_sim', 'nfl_2026']);
    expect(list).not.toContain('nfl_2025_sim');
  });
});

describe('an unregistered competition cannot leak into the list', () => {
  it('ignores a competition string the registry has never heard of', () => {
    // Not hypothetical: production still has an active membership in
    // `nfl_2025`, which was never added to ALL_EVENTS. The RPC returns raw
    // competition strings straight from `pools`, so the registry filter — not
    // the server — is what keeps a stale/retired string out of the switcher.
    // Filtering getEventsByPriority (rather than mapping over `connected`)
    // is what makes that true by construction.
    expect(comps(['nfl_2025'])).toEqual(['nfl_2026']);
  });

  it('keeps the registered entries when the list mixes known and unknown', () => {
    expect(comps(['nfl_2025', 'nfl_2026_pre'])).toEqual([
      'nfl_2026',
      'nfl_2026_pre',
    ]);
  });
});

describe('ordering follows the registry', () => {
  it('keeps getEventsByPriority order (status, then start date)', () => {
    // nfl_2026 is 'active'; nfl_2026_pre is 'upcoming'. Active sorts first,
    // which is why the preseason never becomes the boot default.
    expect(comps(['nfl_2026_pre', 'nfl_2026'])).toEqual([
      'nfl_2026',
      'nfl_2026_pre',
    ]);
  });
});
