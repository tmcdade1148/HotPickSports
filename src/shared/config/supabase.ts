/**
 * Supabase client configuration.
 *
 * TODO: Replace with your actual Supabase project URL and anon key.
 * These should come from environment variables in production.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // not needed in React Native
  },
  realtime: {
    params: {
      eventsPerSecond: 10, // rate limit for SmackTalk
    },
  },
});
