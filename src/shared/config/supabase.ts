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

// ---------------------------------------------------------------------------
// Realtime channel safety wrapper.
//
// supabase-js v2 dedupes Realtime channels by topic: calling channel(topic)
// when a channel with that topic already exists returns the SAME (possibly
// already-subscribed) channel. Re-subscribing then throws:
//   "cannot add postgres_changes callbacks for realtime:<topic> after subscribe()"
// This fires whenever a component re-subscribes after a remount or after
// switching the active competition in/out of the onboarding demo, before the
// previous channel's async teardown completes.
//
// We append a unique suffix to every channel topic so channel() always returns
// a fresh, unsubscribed channel and .on() never lands on a live one. Each
// subscription still removes its own channel in its effect cleanup, so this
// does not leak. (The postgres_changes filter — not the topic name — is what
// scopes the data, so a suffixed topic is functionally identical.)
// ---------------------------------------------------------------------------
let _channelSeq = 0;
const _origChannel = supabase.channel.bind(supabase);
(supabase as unknown as {channel: (name: string, opts?: unknown) => unknown}).channel = (
  name: string,
  opts?: unknown,
) =>
  opts === undefined
    ? (_origChannel as any)(`${name}__${++_channelSeq}`)
    : (_origChannel as any)(`${name}__${++_channelSeq}`, opts);

