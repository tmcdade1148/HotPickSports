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

let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;
let isInitialized = false;

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
    console.warn('[Push] expo-notifications not available:', err);
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
    console.error('[Push] Token registration failed:', err);
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
