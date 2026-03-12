/**
 * OAuth Client IDs for social sign-in.
 *
 * These are NOT secrets — they're embedded in the app binary and visible
 * to anyone who decompiles it. That's expected for mobile OAuth.
 *
 * Replace the placeholder values after creating credentials in:
 * - Google Cloud Console → APIs & Services → Credentials
 *
 * The Web Client ID is used for Supabase token exchange.
 * The iOS Client ID is used by the Google Sign-In SDK on iOS.
 */

// Google OAuth — Web Client ID (used by Supabase for token exchange)
export const GOOGLE_WEB_CLIENT_ID =
  '347191789170-l4suedkctpvmh5hpml1sc2vuke6742v9.apps.googleusercontent.com';

// Google OAuth — iOS Client ID (used by Google Sign-In SDK on iOS)
export const GOOGLE_IOS_CLIENT_ID =
  '347191789170-ctt7hgfb07obn4p972eroqsi49kejtaj.apps.googleusercontent.com';
