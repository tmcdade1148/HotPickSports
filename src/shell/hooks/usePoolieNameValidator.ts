/**
 * usePoolieNameValidator
 *
 * Local format validation + debounced availability check against the
 * check_poolie_name_available() RPC. Shared by the welcome/onboarding
 * screen and Settings → Account.
 *
 * Rules (OAuth Onboarding Spec §4.3, with spaces allowed per product
 * decision — matches the profiles.poolie_name CHECK constraint):
 *   - Required (non-empty after trim)
 *   - Max 20 characters
 *   - Characters: [a-zA-Z0-9 _-]
 *   - Must contain at least one non-space character
 *   - Case-insensitive uniqueness across platform
 *
 * Status transitions:
 *   idle → checking → available | taken | invalid
 *
 * 'invalid' short-circuits the availability call — no network round-trip
 * for local format errors.
 */

import {useEffect, useState} from 'react';
import {supabase} from '@shared/config/supabase';

export type PoolieNameStatus =
  | {state: 'idle'}
  | {state: 'checking'}
  | {state: 'available'}
  | {state: 'taken'}
  | {state: 'invalid'; reason: string};

const MAX_LENGTH = 20;
const FORMAT_RE = /^[a-zA-Z0-9 _-]+$/;
const DEBOUNCE_MS = 500;

function localFormatCheck(candidate: string): PoolieNameStatus | null {
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return {state: 'idle'};
  }
  if (trimmed.length > MAX_LENGTH) {
    return {state: 'invalid', reason: `Keep it under ${MAX_LENGTH} characters.`};
  }
  if (!FORMAT_RE.test(candidate)) {
    return {
      state: 'invalid',
      reason: 'Letters, numbers, spaces, - and _ only.',
    };
  }
  return null;
}

/**
 * Returns the current validation status for a candidate Poolie Name.
 *
 * @param candidate  The current input value
 * @param currentValue  The user's existing poolie_name (if any). If the
 *                      candidate equals this value, we short-circuit to
 *                      'available' without a network call — the user is
 *                      re-submitting their own name in Settings.
 */
export function usePoolieNameValidator(
  candidate: string,
  currentValue?: string | null,
): PoolieNameStatus {
  const [status, setStatus] = useState<PoolieNameStatus>({state: 'idle'});

  useEffect(() => {
    // Local checks first — no network call if format is wrong.
    const local = localFormatCheck(candidate);
    if (local) {
      setStatus(local);
      return;
    }

    const trimmed = candidate.trim();

    // User re-submitting their own existing name — always allowed.
    if (
      currentValue &&
      trimmed.toLowerCase() === currentValue.trim().toLowerCase()
    ) {
      setStatus({state: 'available'});
      return;
    }

    setStatus({state: 'checking'});

    const handle = setTimeout(async () => {
      try {
        const {data, error} = await supabase.rpc(
          'check_poolie_name_available',
          {candidate: trimmed},
        );
        if (error) {
          // RPC failure — treat as "try again" rather than falsely approving.
          setStatus({state: 'invalid', reason: 'Could not verify. Try again.'});
          return;
        }
        setStatus(data === true ? {state: 'available'} : {state: 'taken'});
      } catch {
        setStatus({state: 'invalid', reason: 'Could not verify. Try again.'});
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [candidate, currentValue]);

  return status;
}

/**
 * User-facing error message for a validation status. Returns null when
 * there's nothing to show (idle, checking, or available).
 */
export function poolieNameErrorMessage(
  status: PoolieNameStatus,
): string | null {
  switch (status.state) {
    case 'taken':
      return 'That name is taken. Try another.';
    case 'invalid':
      return status.reason;
    default:
      return null;
  }
}
