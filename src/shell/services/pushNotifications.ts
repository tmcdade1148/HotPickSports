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
    // Check if Expo native modules are available before requiring
    // expo-notifications. The module's JS code references ExpoGlobal.EventEmitter
    // at load time — if the native module isn't linked, require() itself crashes.
    const {NativeModules} = require('react-native');
    if (!NativeModules.ExpoNotificationsEmitter && !NativeModules.ExpoPushTokenManager) {
      console.log('[Push] Expo native modules not linked — skipping');
      return false;
    }

    Notifications = require('expo-notifications');
    Device = require('expo-device');

    // Configure notification handler — show alerts even when app is in foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
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

    // Upsert to user_devices — safe to call every app launch
    await upsertDeviceToken(userId, token);

    return token;
  } catch (err) {
    console.error('[Push] Token registration failed:', err);
    return null;
  }
}

/**
 * Upsert a push token into user_devices.
 * Re-activates a previously deactivated token if the same device is used again.
 */
async function upsertDeviceToken(userId: string, token: string): Promise<void> {
  const platform = Platform.OS as 'ios' | 'android';

  const {error} = await supabase
    .from('user_devices')
    .upsert(
      {
        user_id: userId,
        push_token: token,
        platform,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      {onConflict: 'user_id,push_token'},
    );

  if (error) {
    console.error('[Push] Failed to upsert device token:', error.message);
  } else {
    console.log('[Push] Device token registered');
  }
}

/**
 * Deactivate all push tokens for a user on this device.
 * Called on sign-out. Never DELETE — set is_active = false.
 */
export async function deactivateDeviceTokens(userId: string): Promise<void> {
  const ready = await ensureModules();
  if (!ready || !Notifications || !Device) {
    // Fallback: deactivate all tokens for this user
    await supabase
      .from('user_devices')
      .update({is_active: false, updated_at: new Date().toISOString()})
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
      .update({is_active: false, updated_at: new Date().toISOString()})
      .eq('user_id', userId)
      .eq('push_token', tokenData.data);

    console.log('[Push] Device token deactivated');
  } catch {
    // If we can't get the token, deactivate all for this user
    await supabase
      .from('user_devices')
      .update({is_active: false, updated_at: new Date().toISOString()})
      .eq('user_id', userId);

    console.log('[Push] All device tokens deactivated for user');
  }
}

/**
 * Seed default notification preferences for a new user.
 * Called once after first sign-up. Idempotent via ON CONFLICT DO NOTHING.
 */
export async function seedNotificationPreferences(userId: string): Promise<void> {
  const types = [
    'picks_deadline',
    'score_posted',
    'leaderboard_change',
    'smacktalk_mention',
    'smacktalk_reply',
    'organizer_broadcast',
    'streak_milestone',
    'new_member_joined',
  ];

  const rows = types.map(t => ({
    user_id: userId,
    notification_type: t,
    enabled: true,
  }));

  await supabase
    .from('notification_preferences')
    .upsert(rows, {onConflict: 'user_id,notification_type'});
}
