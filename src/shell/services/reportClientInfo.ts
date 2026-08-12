// ---------------------------------------------------------------------------
// reportClientInfo — one row per Player describing the client build they ran.
//
// Spec: 260812_HotPick_UpdateDeliveryAndClientTelemetry_Spec v1.4 §6.2.
//
// Called EXACTLY ONCE per cold start, from LoadingScreen, immediately after the
// session is confirmed — and deliberately BEFORE the ProfileSetup and
// TosVersionGate bails. A Player stuck at either has a valid session and is
// precisely the population the spec was written to make visible; after the
// bails they would stay invisible.
//
// NOT a hook, and deliberately not named use*: LoadingScreen calls this inside a
// useEffect, and a use-prefixed non-hook trips react-hooks lint.
//
// FIRE-AND-FORGET. It must never block, delay or gate boot. Missing telemetry is
// a diagnostic inconvenience; a boot blocked on a diagnostic write is an outage.
//
// supabase.rpc() returns a thenable QUERY BUILDER, not a real Promise: it has
// .then() but NO .catch(), so chaining .catch directly onto it fails to compile
// (TS2339). Promise.resolve() adapts it to a real Promise — the same idiom the
// repo already uses at DemoResultScreen.tsx:102 and SeasonPicksScreen.tsx:116.
//
// BOTH branches are needed and neither is redundant: the RPC RESOLVES with an
// { error } rather than rejecting on a Postgres error, so .then is the branch
// that actually fires on a failed call, and .catch covers a genuine throw
// (transport/network). Removing either one loses a real error path.
// ---------------------------------------------------------------------------
import {supabase} from '@shared/config/supabase';
import {getClientInfo} from '@shared/device/clientInfo';

export function reportClientInfo(): void {
  const c = getClientInfo();

  void Promise.resolve(
    supabase.rpc('record_client_info', {
      p_app_version: c.appVersion,
      p_os_platform: c.osPlatform,
      p_channel: c.channel,
      p_update_id: c.updateId,
      // timestamptz over the wire — a JS Date serializes to ISO-8601.
      p_update_created_at: c.updateCreatedAt
        ? c.updateCreatedAt.toISOString()
        : null,
      p_is_embedded: c.isEmbedded,
    }),
  )
    .then(({error}) => {
      if (error) console.warn('[reportClientInfo] rpc failed:', error.message);
    })
    .catch(err => console.warn('[reportClientInfo] threw:', err));
}
