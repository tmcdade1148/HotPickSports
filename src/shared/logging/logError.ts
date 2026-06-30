// ---------------------------------------------------------------------------
// Standalone client error logger
//
// Writes one row to `client_error_log` and NOTHING ELSE. By design it has zero
// Sentry surface: it does not import `monitoring/sentry.ts`, `@sentry/react-native`,
// any native module, and it needs no DSN. It is a plain Supabase insert that
// works on the current OTA build — the "no silent failures" sink that stands on
// its own, independent of whether Sentry is ever revived.
//
// Contract:
//   • Fire-and-forget — callers never `await` it; the insert runs detached.
//   • Never throws, never blocks UI — the whole body is wrapped in the one
//     try/catch where swallowing is correct (a logger that fails must not
//     cascade into the failure it was reporting).
//   • No PII — auth `user.id` only; the stack is truncated; caller context is
//     a small jsonb blob the caller controls.
//   • Storm-guarded — dedup + a per-minute cap, because the first caller (the
//     Ladder) sits behind a Realtime refetch that can fire in bursts.
// ---------------------------------------------------------------------------
import {Platform} from 'react-native';
import Constants from 'expo-constants';
import {supabase} from '@shared/config/supabase';

const MAX_STACK = 2000; // truncate — never ship a full stack
const DEDUP_WINDOW_MS = 30_000; // suppress identical (screen + message) repeats
const RATE_CAP = 20; // hard ceiling …
const RATE_WINDOW_MS = 60_000; // … per minute, across all errors

export interface ErrorContext {
  screen?: string;
  action?: string;
  competition?: string;
  /** Pass when the caller already knows it; otherwise resolved best-effort. */
  userId?: string;
  [k: string]: unknown;
}

// In-memory storm guards. Reset on app restart — acceptable for rate limiting.
const lastSeen = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;

function throttled(message: string, screen: string | undefined): boolean {
  const t = Date.now();

  // Global rate cap first — bounds an error firing behind a Realtime loop
  // (e.g. the Ladder refetch on every score write) from flooding the table.
  if (t - windowStart > RATE_WINDOW_MS) {
    windowStart = t;
    windowCount = 0;
  }
  if (windowCount >= RATE_CAP) return true;

  // Per-(screen, message) dedup.
  const key = `${screen ?? '?'}::${message}`;
  const prev = lastSeen.get(key);
  if (prev != null && t - prev < DEDUP_WINDOW_MS) return true;

  lastSeen.set(key, t);
  windowCount += 1;
  return false;
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || 'Error';
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error)?.slice(0, 300) ?? 'Unknown error';
  } catch {
    return 'Unknown error';
  }
}

/**
 * Record a client error. Fire-and-forget; safe from a class lifecycle
 * (componentDidCatch) or any surfaced fetch-error path. Never touches Sentry.
 */
export function logError(error: unknown, context: ErrorContext = {}): void {
  // The single correct swallow — a logging failure must never cascade.
  try {
    const message = toMessage(error);
    if (throttled(message, context.screen)) return;

    const stack =
      error instanceof Error && error.stack
        ? error.stack.slice(0, MAX_STACK)
        : null;

    // Lift userId out so it isn't duplicated into the jsonb context.
    const {userId, ...ctx} = context;

    void (async () => {
      try {
        let user_id = userId ?? null;
        if (!user_id) {
          // Local read (no network); a session miss must not break logging.
          const {data} = await supabase.auth.getSession();
          user_id = data.session?.user?.id ?? null;
        }
        await supabase.from('client_error_log').insert({
          user_id,
          error_message: message,
          error_stack: stack,
          context: ctx,
          app_version: Constants.expoConfig?.version ?? null,
          platform: Platform.OS,
        });
      } catch {
        // swallow — logging is best-effort
      }
    })();
  } catch {
    // swallow — see above
  }
}
