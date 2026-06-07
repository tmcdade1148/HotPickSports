// ---------------------------------------------------------------------------
// Crash / error monitoring (Sentry)
//
// Single entry point for app-wide error reporting. Everything is GUARDED so the
// app behaves identically whether or not monitoring is actually wired up:
//
//   • No DSN configured  -> init no-ops, the app runs exactly as before.
//   • Native module not yet linked (Sentry needs a native rebuild) -> the
//     try/catch swallows the failure and logs a warning instead of crashing.
//
// This lets us land the JS scaffold on a live app without forcing an immediate
// store build. Monitoring goes live the moment a DSN is provided AND a fresh
// native build ships. See docs/SENTRY.md for the one-time native setup.
//
// DSN resolution order (first non-empty wins):
//   1. process.env.EXPO_PUBLIC_SENTRY_DSN   (EAS env var, preferred)
//   2. Constants.expoConfig.extra.sentryDsn (app.json fallback)
//
// No secrets live in git — the DSN is supplied via EAS env, not hardcoded here.
// (A Sentry DSN is a public ingest key, but we keep it out of source anyway so
// it can rotate without a code change.)
// ---------------------------------------------------------------------------
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import type {ComponentType} from 'react';

// @sentry/react-native is required LAZILY — only inside initMonitoring(), and
// only after a DSN is confirmed. A bare top-level `import` *evaluates* the module
// at startup, which touches Sentry's native module; if that module isn't linked
// into the binary (dev, or before a native rebuild) it throws
// "Cannot read property 'EventEmitter' of undefined" and crashes the whole
// bundle at startup. Deferring the require keeps the native surface untouched
// until monitoring is actually turned on. The type-only import is erased at
// compile time and produces no runtime require.
type SentryModule = typeof import('@sentry/react-native');
let Sentry: SentryModule | null = null;

let monitoringActive = false;

function resolveDsn(): string | undefined {
  const fromEnv =
    typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_SENTRY_DSN : undefined;
  const fromExtra = (Constants.expoConfig?.extra as {sentryDsn?: string} | undefined)?.sentryDsn;
  const dsn = (fromEnv || fromExtra || '').trim();
  return dsn.length > 0 ? dsn : undefined;
}

function resolveEnvironment(): string {
  if (__DEV__) return 'development';
  // expo-updates channel maps to our EAS build profiles: preview | production.
  const channel = (Updates as {channel?: string}).channel;
  return channel || 'production';
}

/**
 * Initialise crash/error monitoring. Safe to call unconditionally — no-ops when
 * no DSN is configured, and never throws if the native module isn't linked yet.
 * Call once, as early as possible (before AppRegistry).
 */
export function initMonitoring(): void {
  const dsn = resolveDsn();
  if (!dsn) {
    // Expected in dev and in any build without the EAS env var set. Stay quiet
    // in dev; one breadcrumb in release builds is enough to diagnose "why no
    // events" without spamming.
    if (!__DEV__) {
      console.warn('[monitoring] No Sentry DSN configured — error reporting disabled.');
    }
    return;
  }

  try {
    // Lazy require — reached only when a DSN is present (release builds with the
    // native module linked). Never evaluated in dev / when monitoring is off, so
    // an unlinked native module can't crash startup.
    Sentry = require('@sentry/react-native') as SentryModule;
    Sentry.init({
      dsn,
      environment: resolveEnvironment(),
      // App marketing version (e.g. "1.1.0") drives the Sentry release. The
      // native build number is attached separately as dist for crash grouping.
      release: Constants.expoConfig?.version
        ? `hotpicksports@${Constants.expoConfig.version}`
        : undefined,
      // Don't report in dev — local crashes are not signal.
      enabled: !__DEV__,
      // Privacy: never send PII automatically. We attach a hashed user id
      // explicitly via setMonitoringUser() once a session exists.
      sendDefaultPii: false,
      // Modest performance sampling; raise later if we want traces.
      tracesSampleRate: 0.1,
    });
    monitoringActive = true;
  } catch (err) {
    // Native module not linked yet (pre-rebuild) or any init failure — the app
    // must keep running regardless.
    console.warn('[monitoring] Sentry init failed (native module not linked?):', err);
    Sentry = null;
    monitoringActive = false;
  }
}

/**
 * Wrap the root component so Sentry can capture render errors and (when traces
 * are enabled) navigation performance. Returns the component untouched if
 * monitoring isn't active, so the app tree is identical in the no-DSN case.
 */
export function wrapWithMonitoring<P extends object>(App: ComponentType<P>): ComponentType<P> {
  if (!monitoringActive || !Sentry) return App;
  try {
    // Sentry.wrap's generic is stricter than ours; decouple via unknown. The
    // wrapped component is render-compatible with the original.
    return Sentry.wrap(App as ComponentType<Record<string, unknown>>) as unknown as ComponentType<P>;
  } catch {
    return App;
  }
}

/**
 * Associate subsequent events with the signed-in user. Pass the auth user id
 * only — no email/name — to keep reports free of PII. Call with null on logout.
 */
export function setMonitoringUser(userId: string | null): void {
  if (!monitoringActive || !Sentry) return;
  try {
    Sentry.setUser(userId ? {id: userId} : null);
  } catch {
    // ignore — monitoring is best-effort
  }
}

/** Manually report a handled error with optional context. Best-effort. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!monitoringActive || !Sentry) {
    if (__DEV__) {
      console.error('[monitoring:dev] captureError', error, context);
    }
    return;
  }
  try {
    Sentry.captureException(error, context ? {extra: context} : undefined);
  } catch {
    // ignore
  }
}

/** True once init succeeded with a DSN and a linked native module. */
export function isMonitoringActive(): boolean {
  return monitoringActive;
}
