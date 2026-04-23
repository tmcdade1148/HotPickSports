/**
 * Social auth wrappers for Apple and Google sign-in.
 *
 * Each function handles the native SDK interaction, passes the token to
 * Supabase's signInWithIdToken(), and — on first auth, when the OAuth
 * provider supplies a name — writes first_name / last_name to profiles
 * immediately. The caller (WelcomeScreen) then runs the unified
 * postAuthFlow.
 *
 * Supabase creates the user automatically if they don't exist, which
 * triggers handle_new_user() → auto_join_public_beta_pool() →
 * trg_create_notification_preferences in the DB.
 *
 * Name persistence (spec §2.2 / §3.1):
 *   - Apple returns fullName on FIRST authorization only (by Apple's design).
 *     Subsequent sign-ins return null — we rely on profiles, not credential.
 *   - Google returns givenName/familyName on every sign-in.
 *   - Both paths use COALESCE semantics: only write if the profile column
 *     is currently empty, so a user-edited name is never overwritten.
 */

import {Platform} from 'react-native';
import {supabase} from '@shared/config/supabase';
import {GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID} from '@shared/config/authConfig';
import type {User} from '@supabase/supabase-js';

interface SocialAuthResult {
  user: User;
}

/**
 * COALESCE-style name persistence. Only fills profile columns that are
 * currently null or empty. Never overwrites a name the user has edited.
 * Fire-and-forget on failure — auth should not block on profile writes.
 */
async function persistProviderNameIfMissing(
  userId: string,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): Promise<void> {
  if (!firstName && !lastName) return;

  try {
    const {data: profile} = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .single();

    const updates: {first_name?: string; last_name?: string} = {};

    if (firstName && !profile?.first_name) {
      updates.first_name = firstName.trim();
    }
    if (lastName && !profile?.last_name) {
      updates.last_name = lastName.trim();
    }

    if (Object.keys(updates).length === 0) return;

    await supabase.from('profiles').update(updates).eq('id', userId);
  } catch {
    // Non-blocking — postAuthFlow will re-check profile state.
  }
}

/**
 * Sign in with Apple.
 *
 * Uses @invertase/react-native-apple-authentication to get an identity
 * token from Apple, then passes it to Supabase.
 *
 * IMPORTANT: Apple only returns the user's full name on the VERY FIRST
 * sign-in. On subsequent sign-ins, fullName will be null. This function
 * writes the credential's name to profiles on first auth so return auth
 * never needs to depend on the credential.
 */
export async function signInWithApple(): Promise<SocialAuthResult> {
  const {appleAuth} = await import(
    '@invertase/react-native-apple-authentication'
  );

  const appleAuthResponse = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
  });

  const {identityToken, fullName, nonce} = appleAuthResponse;

  if (!identityToken) {
    throw new Error('Apple Sign In failed — no identity token received.');
  }

  const {data, error} = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
    nonce: nonce,
  });

  if (error) throw error;
  if (!data.user) throw new Error('Apple Sign In failed — no user returned.');

  // First-auth only: Apple sends fullName once. Persist to profiles so
  // the onboarding screen reads from the DB, not in-flight nav state.
  await persistProviderNameIfMissing(
    data.user.id,
    fullName?.givenName ?? null,
    fullName?.familyName ?? null,
  );

  return {user: data.user};
}

/**
 * Sign in with Google.
 *
 * Uses @react-native-google-signin/google-signin to get an ID token
 * from Google, then passes it to Supabase.
 *
 * Google returns givenName/familyName on every sign-in. We still use
 * COALESCE semantics so we never overwrite a name the user has edited
 * in Settings → Account.
 */
export async function signInWithGoogle(): Promise<SocialAuthResult> {
  const {GoogleSignin} = await import(
    '@react-native-google-signin/google-signin'
  );

  // Configure once (idempotent — safe to call multiple times)
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    ...(Platform.OS === 'ios' ? {iosClientId: GOOGLE_IOS_CLIENT_ID} : {}),
  });

  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();

  const idToken = response.data?.idToken;
  if (!idToken) {
    throw new Error('Google Sign In failed — no ID token received.');
  }

  const {data, error} = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });

  if (error) throw error;
  if (!data.user) throw new Error('Google Sign In failed — no user returned.');

  // Persist Google-provided name into profiles (COALESCE — never overwrite).
  await persistProviderNameIfMissing(
    data.user.id,
    response.data?.user?.givenName ?? null,
    response.data?.user?.familyName ?? null,
  );

  return {user: data.user};
}
