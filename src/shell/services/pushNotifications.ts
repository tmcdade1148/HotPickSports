/**
 * Push notification registration and token management.
 *
 * Uses Expo Push Notifications. Never interact with APNs or FCM directly.
 * Push tokens go in user_devices table, NOT on profiles (Hard Rule #12).
 * One row per device per user. Set is_active = false on logout — never DELETE.
 *
 * All expo-notifications imports are lazy to prevent crashes in bare RN
 * environments where the native module may not be configured yet.
 */

import {Platform} from 'react-native';
import {supabase} from '@shared/config/supabase';
import {logError} from '@shared/logging/logError';

let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;
let isInitialized = false;

/** The three values notification_preferences.push_permission_status accepts. */
export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Last value THIS client successfully reported, so an unchanged status doesn't
 * take a row update every time it is observed.
 *
 * MODULE-SCOPED ON PURPOSE, not AsyncStorage (spec Part D). The cache dies on
 * cold start, so every app launch produces exactly one write — accepted
 * deliberately. The Settings screen re-checks on every foreground, and without
 * a cache each of those would write; this reduces it to one per launch.
 * Persisting instead would buy one write per launch at the cost of a new
 * storage key, a migration surface and a reinstall edge case.
 *
 * Only ever set after a SUCCESSFUL write: caching a failed attempt would
 * suppress every retry for the rest of the session.
 */
let lastReportedStatus: PushPermissionStatus | null = null;

/**
 * Narrow Expo's permission status to the three values the CHECK constraint
 * allows, or null if it is anything else.
 *
 * Read the NORMALIZED top-level `status`, never `ios.status` — the latter
 * carries finer values (PROVISIONAL, EPHEMERAL) that would fail the constraint.
 * The top-level field is already the three-value enum today; this guard exists
 * so an unexpected value is dropped rather than sent to an RPC that raises.
 */
function normalizePermissionStatus(status: string): PushPermissionStatus | null {
  return status === 'granted' || status === 'denied' || status === 'undetermined'
    ? status
    : null;
}

/**
 * Record the OS permission outcome against the caller's own row, via a SECURITY
 * DEFINER RPC that derives auth.uid() server-side (never a direct .update(),
 * which returns success having changed zero rows when RLS filters it).
 *
 * Fire-and-forget: never blocks registration, never surfaces to the user.
 */
async function recordPushPermission(status: PushPermissionStatus): Promise<void> {
  if (status === lastReportedStatus) return;
  try {
    const {error} = await supabase.rpc('record_push_permission', {
      p_status: status,
    });
    if (error) {
      console.warn('[Push] record_push_permission failed:', error.message);
      return;
    }
    lastReportedStatus = status;
  } catch (err) {
    console.warn('[Push] record_push_permission threw:', err);
  }
}

/**
 * The current OS push permission, or null when the Expo modules are unavailable.
 *
 * null is a real answer and must NOT be recorded: writing 'undetermined' for a
 * device where the module never loaded would make a module failure
 * indistinguishable from a user who was simply never asked, destroying the
 * signal the column exists to capture. Absence means absence.
 */
export async function getPushPermissionStatus(): Promise<PushPermissionStatus | null> {
  const ready = await ensureModules();
  if (!ready || !Notifications) return null;
  try {
    const {status} = await Notifications.getPermissionsAsync();
    return normalizePermissionStatus(status);
  } catch (err) {
    console.warn('[Push] getPermissionsAsync failed:', err);
    return null;
  }
}

/**
 * Lazily load expo-notifications and expo-device.
 * Returns false if modules are unavailable (e.g., not linked).
 */
async function ensureModules(): Promise<boolean> {
  if (isInitialized) return Notifications !== null;
  isInitialized = true;

  try {
    // Load the Expo modules. If the native module is genuinely unlinked the
    // require() throws and is caught below (returning false). We deliberately do
    // NOT pre-check NativeModules.ExpoNotificationsEmitter / ExpoPushTokenManager:
    // under the New Architecture (Expo SDK 55) Expo modules register via
    // expo-modules-core (JSI), not React Native's legacy NativeModules bridge, so
    // those names are always undefined even when the module IS linked — which made
    // this guard short-circuit registration on every iOS login (no prompt, no
    // token, user_devices empty).
    Notifications = require('expo-notifications');
    Device = require('expo-device');

    // Configure notification handler — show alerts even when app is in foreground
    Notifications!.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    return true;
  } catch (err) {
    // logError, NOT console.warn. On a production iPhone build a failed
    // require('expo-notifications') is a bug, not an expected environment —
    // and it is the ONE remaining path that produces no server-side trace at
    // all: registration returns null at :146 before any permission is
    // resolved, so nothing is written to user_devices AND nothing to
    // notification_preferences.push_permission_status. Without this line a
    // relaunch that fails here is indistinguishable from one where
    // registration was never called, and the 1.12/1.13 diagnosis stalls.
    //
    // Prime suspect: the comment above documents a previous bug with exactly
    // this fingerprint — a NativeModules pre-check that short-circuited
    // registration on every iOS login, leaving no prompt, no token and an
    // empty user_devices.
    logError(err, {
      screen: 'pushNotifications',
      action: 'ensureModules',
      os: Platform.OS,
    });
    Notifications = null;
    Device = null;
    return false;
  }
}

/**
 * Request push notification permissions and register the device token.
 *
 * Returns the Expo push token string, or null if permissions denied
 * or running on simulator (no push tokens on simulator).
 */
export async function registerForPushNotifications(
  userId: string,
): Promise<string | null> {
  console.log('[Push] registerForPushNotifications: entry', {userId});
  const ready = await ensureModules();
  if (!ready || !Notifications || !Device) {
    console.log('[Push] Modules not available — skipping registration');
    return null;
  }

  // Push tokens are not available on simulators
  if (!Device.isDevice) {
    console.log('[Push] Not a physical device — skipping token registration');
    return null;
  }

  // Check existing permissions
  const {status: existingStatus} = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not already granted
  if (existingStatus !== 'granted') {
    console.log('[Push] requesting OS permission (existing status:', existingStatus, ')');
    const {status} = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // Record the outcome BEFORE the early return below, so a decline is written
  // rather than silently dropped — a denied status is the whole point of the
  // column. Not recorded above this point on purpose: the module-unavailable and
  // simulator returns both happen before any permission is resolved, and there
  // is no status to report.
  const resolved = normalizePermissionStatus(finalStatus);
  if (resolved) void recordPushPermission(resolved);

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission not granted');
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'HotPick',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  // Get the Expo push token
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'a541257f-7510-4192-ba2f-56996e189b9d', // from app.json
    });
    const token = tokenData.data;
    console.log('[Push] Token:', token);

    // Register the token (via a SECURITY DEFINER RPC) — safe every app launch.
    await upsertDeviceToken(token);

    return token;
  } catch (err) {
    // logError, NOT console.error. This is the only report of a failure that
    // has ALREADY passed the permission grant — getExpoPushTokenAsync throwing
    // (no APNs entitlement, network, bad projectId, Expo outage) or
    // register_device_token rejecting. Every caller is fire-and-forget, so a
    // console line is discarded and the device ends up with NO user_devices
    // row and no trace anywhere. console.error does not reach
    // client_error_log — only logError does. Register item 1.12/1.13.
    logError(err, {
      screen: 'pushNotifications',
      action: 'registerForPushNotifications',
      userId,
      os: Platform.OS,
    });
    return null;
  }
}

/**
 * Register this device's push token via the SECURITY DEFINER `register_device_token`
 * RPC, then mark it active.
 *
 * Tokens live in user_devices keyed by `push_token` alone — one row per device. On
 * a phone shared across accounts (a tester's test + real account, or a reinstall)
 * the SAME token can already belong to a DIFFERENT user. A direct client upsert
 * hits that other user's row and the per-user RLS (USING auth.uid() = user_id)
 * rejects the reassign with a 42501 "(USING expression)" error, so the newly
 * signed-in account silently registered nothing and got no pushes. The RPC derives
 * auth.uid() server-side and reassigns the token to the caller — the device's
 * notifications follow whoever is currently signed in. (`platform` is the token
 * TRANSPORT, not the OS; the table CHECK allows only 'expo' | 'apns' | 'fcm', and
 * we always fetch an Expo token here.)
 */
async function upsertDeviceToken(token: string): Promise<void> {
  const {error} = await supabase.rpc('register_device_token', {
    p_push_token: token,
    p_platform: 'expo',
  });

  if (error) {
    console.error('[Push] Failed to register device token:', error.message);
    throw error;
  }
  console.log('[Push] Device token registered');
}

/**
 * Deactivate all push tokens for a user on this device.
 * Called on sign-out. Never DELETE — set is_active = false.
 */
export async function deactivateDeviceTokens(userId: string): Promise<void> {
  const ready = await ensureModules();
  if (!ready || !Notifications || !Device) {
    // Fallback: deactivate all tokens for this user
    // (no `updated_at` column on user_devices — that write threw silently).
    await supabase
      .from('user_devices')
      .update({is_active: false})
      .eq('user_id', userId);
    return;
  }

  // Get current token to deactivate only this device
  try {
    if (!Device.isDevice) return;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'a541257f-7510-4192-ba2f-56996e189b9d',
    });

    await supabase
      .from('user_devices')
      .update({is_active: false})
      .eq('user_id', userId)
      .eq('push_token', tokenData.data);

    console.log('[Push] Device token deactivated');
  } catch {
    // If we can't get the token, deactivate all for this user
    await supabase
      .from('user_devices')
      .update({is_active: false})
      .eq('user_id', userId);

    console.log('[Push] All device tokens deactivated for user');
  }
}

/**
 * Seed default notification preferences for a new user.
 * Called once after first sign-up. Idempotent via ON CONFLICT DO NOTHING.
 *
 * notification_preferences is WIDE: a single row per user with one boolean
 * column per type, each defaulting to true. So seeding is just "ensure the
 * row exists" — the column defaults supply the all-on starting state.
 */
export async function seedNotificationPreferences(userId: string): Promise<void> {
  await supabase
    .from('notification_preferences')
    .upsert({user_id: userId}, {onConflict: 'user_id', ignoreDuplicates: true});
}
