/**
 * REGISTRY-03 Part B — the restore contract.
 *
 * Both restore seams (LoadingScreen and runPostAuthFlow) implement the same
 * shape: read the saved competition, validate it through getEventByCompetition,
 * and fall back to getDefaultEvent on any failure. These tests pin that
 * decision function, which is the part that can silently regress — the boot
 * path itself is covered by the device checklist.
 *
 * Restore must WIN over default derivation and LOSE to validation.
 */
import {getEventByCompetition, getDefaultEvent} from '../registry';

const AUG_15 = Date.parse('2026-08-15T00:00:00Z');
const SEP_03 = Date.parse('2026-09-03T00:00:00Z');

/** Mirrors the contract both seams implement. */
function resolveBootEvent(
  saved: string | null,
  visibleCompetitions: readonly string[] | undefined,
  now: number,
) {
  const restored = saved ? getEventByCompetition(saved, now) : undefined;
  return restored ?? getDefaultEvent(visibleCompetitions, now);
}

describe('restore contract', () => {
  it('restores a valid saved competition over the default', () => {
    const event = resolveBootEvent('nfl_2026_pre', undefined, AUG_15);
    expect(event.competition).toBe('nfl_2026_pre');
    // The whole point: the restored competition is NOT the default, which is
    // what makes an invite code durable across relaunch.
    expect(getDefaultEvent(undefined, AUG_15).competition).toBe('nfl_2026');
  });

  it('falls back to the default when nothing is saved', () => {
    expect(resolveBootEvent(null, undefined, AUG_15).competition).toBe('nfl_2026');
  });

  it('falls back when the saved competition is unregistered', () => {
    expect(
      resolveBootEvent('nfl_2099_imaginary', undefined, AUG_15).competition,
    ).toBe('nfl_2026');
  });

  it('falls back when the saved competition is out of its window', () => {
    // The Sept 2 handoff: a saved preseason selection silently becomes
    // nfl_2026 with no client release and nothing to remember.
    expect(resolveBootEvent('nfl_2026_pre', undefined, SEP_03).competition).toBe(
      'nfl_2026',
    );
  });

  it('restores a gated competition, leaving visibility to profileSlice', () => {
    // getEventByCompetition ignores visibility gating by design, so a beta
    // tester's sim selection survives relaunch. The profileSlice
    // defense-in-depth kicks a user off a competition they cannot see once
    // the visibility RPC resolves — deliberately not duplicated here.
    expect(resolveBootEvent('nfl_2025_sim', undefined, AUG_15).competition).toBe(
      'nfl_2025_sim',
    );
  });
});
