/**
 * Social auth wrappers for Apple and Google sign-in.
 *
 * Both functions:
 * 1. Invoke the native sign-in SDK to get an identity token
 * 2. Pass the token to Supabase via signInWithIdToken()
 * 3. Return { user, providerName } for the post-auth pipeline
 *
 * Supabase automatically creates new users on first sign-in via
 * signInWithIdToken. The handle_new_user DB trigger chain runs
 * automatically (profile creation, public beta pool join, notification prefs).
 */

import {supabase} from '@shared/config/supabase';
import {GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID} from '@shared/config/authConfig';

interface ProviderName {
  firstName?: string;
  lastName?: string;
}

interface SocialAuthResult {
  user: any;
  providerName: ProviderName | null;
}

/**
 * Sign in with Apple.
 *
 * Apple only sends the user's name on the VERY FIRST sign-in for a given
 * Apple ID + app combination. If we miss it, it's gone forever (user would
 * have to revoke the app in Apple ID settings and re-authorize).
 *
 * We capture the name and pass it as providerName so ProfileSetupScreen
 * can pre-fill the first/last name fields.
 */
export async function signInWithApple(): Promise<SocialAuthResult> {
  // Dynamic import — avoids loading the native module on Android
  const appleAuthModule = await import(
    '@invertase/react-native-apple-authentication'
  );
  const appleAuth = appleAuthModule.default ?? appleAuthModule;

  const appleCredential = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [
      appleAuth.Scope.EMAIL,
      appleAuth.Scope.FULL_NAME,
    ],
  });

  const {identityToken, fullName} = appleCredential;

  if (!identityToken) {
    throw new Error('Apple Sign In failed — no identity token received.');
  }

  const {data, error} = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
  });

  if (error) throw error;
  if (!data.user) throw new Error('Apple Sign In succeeded but no user returned.');

  // Capture name (only available on first sign-in)
  const providerName: ProviderName | null =
    fullName?.givenName || fullName?.familyName
      ? {
          firstName: fullName.givenName ?? undefined,
          lastName: fullName.familyName ?? undefined,
        }
      : null;

  return {user: data.user, providerName};
}

/**
 * Sign in with Google.
 *
 * Google always provides the user's name via user_metadata on the Supabase
 * user object, so we don't need to capture it separately like Apple.
 * The ProfileSetupScreen will read it from the profile if needed.
 */
export async function signInWithGoogle(): Promise<SocialAuthResult> {
  // Dynamic import — avoids loading the native module unnecessarily
  const {GoogleSignin} = await import('@react-native-google-signin/google-signin');

  // configure() is idempotent — safe to call every time
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    offlineAccess: true,
  });

  const response = await GoogleSignin.signIn();

  // Extract idToken from the response
  const idToken =
    response?.data?.idToken ?? (response as any)?.idToken ?? null;

  if (!idToken) {
    throw new Error('Google Sign In failed — no ID token received.');
  }

  const {data, error} = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });

  if (error) throw error;
  if (!data.user) throw new Error('Google Sign In succeeded but no user returned.');

  // Google provides name via user_metadata — no need for providerName
  return {user: data.user, providerName: null};
}
