import 'react-native-url-polyfill/auto';
import {createClient} from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://mzqtrpdiqhopjmxjccwy.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16cXRycGRpcWhvcGpteGpjY3d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MDIwMDQsImV4cCI6MjA3MjA3ODAwNH0.017SoJAJLh4UKRYm4jVVCWDf1gCN2wjkpcUTHJJOsU4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
