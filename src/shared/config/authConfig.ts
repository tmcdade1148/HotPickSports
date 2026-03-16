/**
 * OAuth client IDs for social sign-in.
 *
 * These are NOT secrets — they are embedded in the app binary and visible
 * in Info.plist / AndroidManifest. They identify the app to Apple/Google
 * OAuth servers.
 *
 * TODO: Replace placeholder values with real IDs from:
 * - Apple: developer.apple.com → Certificates, Identifiers & Profiles
 * - Google: console.cloud.google.com → APIs & Services → Credentials
 */

// Google OAuth 2.0 Client IDs
// The WEB client ID is used by Supabase server-side AND by signInWithIdToken()
export const GOOGLE_WEB_CLIENT_ID =
  'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

// The iOS client ID is used by the Google Sign-In SDK on iOS only
export const GOOGLE_IOS_CLIENT_ID =
  'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';

// Apple Service ID (used by Supabase server-side, not in client code)
// Configured in Supabase Dashboard → Auth → Providers → Apple
