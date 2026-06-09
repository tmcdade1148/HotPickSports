import 'react-native-url-polyfill/auto';
import {createClient} from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://mzqtrpdiqhopjmxjccwy.supabase.co';
// Rotation Stage 6: the legacy anon JWT is replaced by the new PUBLISHABLE key
// (sb_publishable_…). Publishable keys are public by design — safe to ship in the
// JS bundle, exactly as the anon key was. This swap is JS-only, so it ships via
// EAS Update (OTA) with no native rebuild / store review.
//
// TODO(rotation): paste the MOBILE publishable key (Settings → API Keys) below,
// then publish the OTA. Leaving the placeholder unshipped is safe; shipping it is
// not — the client cannot reach Supabase with a placeholder key.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_PASTE_MOBILE_PUBLISHABLE_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
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

