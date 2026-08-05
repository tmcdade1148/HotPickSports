/**
 * Persisted active-competition record (REGISTRY-03 Part B).
 *
 * The saved competition is keyed to the user who chose it. A bare string
 * survives an account switch on a shared device: signOut clears the key, but
 * an app killed WITHOUT signing out leaves the value in place, and the
 * profileSlice visibility guard only corrects a competition the next account
 * cannot see. One visible to both accounts would carry over silently.
 *
 * Storing {uid, competition} and requiring the uid to match the authenticated
 * session closes that path. This makes the signOut clear redundant; both are
 * kept, because this is the boot path.
 *
 * Pure functions, deliberately free of AsyncStorage and store imports, so the
 * contract is unit-testable without mocking either. Both restore seams
 * (LoadingScreen, runPostAuthFlow) go through parseActiveCompetition so they
 * cannot drift apart.
 */

export const ACTIVE_COMPETITION_KEY = 'hotpick_active_competition';

export interface PersistedCompetition {
  uid: string;
  competition: string;
}

export function serializeActiveCompetition(
  uid: string,
  competition: string,
): string {
  return JSON.stringify({uid, competition} satisfies PersistedCompetition);
}

/**
 * Returns the saved competition only when it belongs to `uid`. Anything else —
 * absent, malformed JSON, wrong shape, missing uid, different uid — returns
 * null, and the caller falls through to getDefaultEvent. A saved value is a
 * preference, not a right.
 */
export function parseActiveCompetition(
  raw: string | null | undefined,
  uid: string | null | undefined,
): string | null {
  if (!raw || !uid) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCompetition> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.uid !== 'string') return null;
    if (typeof parsed.competition !== 'string' || !parsed.competition) {
      return null;
    }
    return parsed.uid === uid ? parsed.competition : null;
  } catch {
    // Includes the pre-REGISTRY-03 bare-string format, which has no uid to
    // trust and so must not restore.
    return null;
  }
}
