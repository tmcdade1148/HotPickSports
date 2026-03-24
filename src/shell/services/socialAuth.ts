/**
 * Social auth wrappers for Apple and Google sign-in.
 *
 * Each function handles the native SDK interaction and passes the token
 * to Supabase's signInWithIdToken(). The caller (WelcomeScreen) then
 * runs the unified postAuthFlow.
 *
 * Supabase creates the user automatically if they don't exist, which
 * triggers handle_new_user() → auto_join_public_beta_pool() →
 * trg_create_notification_preferences in the DB.
 */

import {Platform} from 'react-native';
import {supabase} from '@shared/config/supabase';
import {GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID} from '@shared/config/authConfig';
import type {User} from '@supabase/supabase-js';

interface SocialAuthResult {
  user: User;
  /** Name from provider — Apple only sends this on FIRST sign-in */
  providerName: {firstName: string | null; lastName: string | null} | null;
}

/**
 * Sign in with Apple.
 *
 * Uses @invertase/react-native-apple-authentication to get an identity
 * token from Apple, then passes it to Supabase.
 *
 * IMPORTANT: Apple only returns the user's full name on the VERY FIRST
 * sign-in. On subsequent sign-ins, fullName will be null. The caller
 * must pass providerName to ProfileSetup to capture it.
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

  return {
    user: data.user,
    providerName: fullName
      ? {
          firstName: fullName.givenName ?? null,
          lastName: fullName.familyName ?? null,
        }
      : null,
  };
}

/**
 * Sign in with Google.
 *
 * Uses @react-native-google-signin/google-signin to get an ID token
 * from Google, then passes it to Supabase.
 *
 * Google provides the user's name via user_metadata automatically —
 * no need to capture it separately like Apple.
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

  return {
    user: data.user,
    providerName: null, // Google provides name via user_metadata automatically
  };
}
