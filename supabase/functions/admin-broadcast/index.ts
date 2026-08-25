// admin-broadcast — Edge Function
//
// Sends a platform-wide message. Two write paths:
//   1. notification_queue   — push delivery
//   2. organizer_notifications — Message Center inbox, attached to the hidden
//      Platform Pool
// Both are gated by is_super_admin + a 1/24h server-enforced rate limit.
//
// The response reports `queued` and `push_eligible` — never a delivered count.
// Delivery is resolved later by process-notification-queue; see
// countPushEligible() at the foot of this file.
//
// TWO THINGS THIS FUNCTION DOES NOT GUARANTEE, both verified 2026-08-25 and
// both currently live:
//
//   a) "the hidden Platform Pool, which every user is auto-enrolled in" — this
//      header used to say that, and it is not true. The only two pools matching
//      the platformPool lookup below (is_hidden_from_users AND is_global) are
//      NFL26 Global and NFL26PRE Global, and BOTH are archived with ZERO active
//      members. HomeInbox derives its platform pool ids from
//      get_my_pool_memberships(), which filters status='active', so that set is
//      empty for every user and the inbox banner renders nothing. Path 2 is
//      dark until a live Platform Pool with real memberships exists.
//
//   b) the lookup itself is ambiguous — .limit(1).maybeSingle() with no
//      ORDER BY across two matching rows picks an arbitrary one.
//
// Neither is fixed here: which pool the Platform entry belongs to is a product
// decision, not a bug fix. Recorded so the next reader does not re-derive it.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
// Default cadence between platform-wide broadcasts. Overridable at runtime via
// the competition_config global key `admin_broadcast_rate_limit_hours` (no
// redeploy needed) — config-driven per the project's limits-in-config rule.
const DEFAULT_RATE_LIMIT_HOURS = 24;

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({error: 'Missing Authorization'}, 401);

    const callerClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: {headers: {Authorization: authHeader}},
    });
    const {data: userData} = await callerClient.auth.getUser();
    if (!userData?.user) return json({error: 'Not authenticated'}, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const {data: callerProfile} = await admin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', callerId)
      .maybeSingle();
    if (!callerProfile?.is_super_admin) return json({error: 'Not authorized'}, 403);

    const body = await req.json().catch(() => ({}));
    const subject: string = (body.subject ?? '').toString().trim();
    const messageBody: string = (body.body ?? '').toString().trim();
    const target: string = (body.target ?? 'all').toString();

    // Subject is optional (push title only); body is required.
    if (subject.length > 60) {
      return json({error: 'Subject must be 60 characters or fewer'}, 400);
    }
    if (messageBody.length === 0 || messageBody.length > 280) {
      return json({error: 'Body must be 1-280 characters'}, 400);
    }
    // Push needs a non-empty title; fall back to the brand name when no subject.
    const pushTitle = subject.length > 0 ? subject : 'HotPick Sports';
    // Message Center body: skip the blank subject line when there's no subject.
    const composedMessage = subject.length > 0 ? `${subject}\n\n${messageBody}` : messageBody;

    // Pull both the last-send timestamp and the (optional) configurable cadence
    // in one query. Shared window: one timestamp across all targets + admins.
    const {data: cfgRows} = await admin
      .from('competition_config')
      .select('key, value')
      .eq('competition', 'global')
      .in('key', ['last_admin_broadcast_at', 'admin_broadcast_rate_limit_hours']);

    let lastRowValue: unknown = null;
    let rateLimitHours = DEFAULT_RATE_LIMIT_HOURS;
    for (const r of (cfgRows ?? []) as {key: string; value: unknown}[]) {
      if (r.key === 'last_admin_broadcast_at') lastRowValue = r.value;
      else if (r.key === 'admin_broadcast_rate_limit_hours') {
        const n = Number(typeof r.value === 'string' ? r.value.replace(/^"|"$/g, '') : r.value);
        if (Number.isFinite(n) && n >= 0) rateLimitHours = n;
      }
    }

    if (lastRowValue) {
      const lastIso = typeof lastRowValue === 'string' ? lastRowValue : (lastRowValue as {iso?: string})?.iso;
      if (lastIso) {
        const lastMs = new Date(lastIso).getTime();
        const ageHours = (Date.now() - lastMs) / (1000 * 60 * 60);
        if (ageHours < rateLimitHours) {
          const waitHours = Math.ceil(rateLimitHours - ageHours);
          return json({
            error: 'RATE_LIMITED',
            wait_hours: waitHours,
            next_available_at: new Date(lastMs + rateLimitHours * 3600 * 1000).toISOString(),
          }, 429);
        }
      }
    }

    const {error: auditErr} = await admin.from('admin_audit_log').insert({
      admin_id:     callerId,
      action:       'ADMIN_BROADCAST_SENT',
      target_table: 'global',
      target_id:    callerId,
      metadata:     {subject, body: messageBody, target},
    });
    if (auditErr) return json({error: `audit log failed: ${auditErr.message}`}, 500);

    const nowIso = new Date().toISOString();
    await admin
      .from('competition_config')
      .upsert(
        {
          competition: 'global',
          key:         'last_admin_broadcast_at',
          value:       nowIso,
          description: 'Server-enforced rate-limit timestamp for app-wide admin broadcasts.',
          updated_at:  nowIso,
        },
        {onConflict: 'competition,key'},
      );

    let userIds: string[] = [];
    if (target === 'all') {
      const {data: rows} = await admin
        .from('profiles')
        .select('id')
        .eq('is_platform_suspended', false);
      userIds = ((rows ?? []) as {id: string}[]).map(r => r.id);
    } else {
      // ARCHIVED POOLS ARE NOT AN AUDIENCE.
      //
      // 2026-08-25: a nfl_2026_pre broadcast queued 77 — 21 members of the one
      // live Contest, plus 56 legacy auto-enrollees still carrying `active`
      // membership in the archived, hidden NFL26PRE Global pool. Six of them
      // got a push for a competition they had no live stake in.
      //
      // `status = 'active'` describes the MEMBERSHIP, not the pool. An archived
      // pool keeps its member rows (Hard Rule #16 — organizers archive, they
      // never delete), so membership status alone can never express "this pool
      // is over". The pool's own flag has to be asked for separately.
      const {data: rows} = await admin
        .from('pool_members')
        .select('user_id, pools!inner(competition, is_archived)')
        .eq('status', 'active')
        .eq('pools.competition', target)
        .eq('pools.is_archived', false);
      const seen = new Set<string>();
      for (const r of (rows ?? []) as {user_id: string}[]) seen.add(r.user_id);
      userIds = Array.from(seen);
    }

    const {data: platformPool} = await admin
      .from('pools')
      .select('id, competition')
      .eq('is_hidden_from_users', true)
      .eq('is_global', true)
      .limit(1)
      .maybeSingle();

    if (platformPool) {
      const {error: notifErr} = await admin.from('organizer_notifications').insert({
        pool_id:           platformPool.id,
        competition:       platformPool.competition,
        organizer_id:      callerId,
        notification_type: 'broadcast',
        message:           composedMessage,
        recipient_count:   userIds.length,
        sent_at:           nowIso,
      });
      if (notifErr) {
        console.warn('[admin-broadcast] organizer_notifications insert failed:', notifErr.message);
      }
    } else {
      console.warn('[admin-broadcast] No Platform Pool found; Message Center entry skipped');
    }

    if (userIds.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize);
        const rows = chunk.map(uid => ({
          user_id:           uid,
          notification_type: 'organizer_broadcast',
          title:             pushTitle,
          body:              messageBody,
        }));
        await admin.from('notification_queue').insert(rows);
      }
    }

    const pushEligible = await countPushEligible(admin, userIds);

    return json({
      ok:            true,
      target,
      queued:        userIds.length,
      push_eligible: pushEligible,
      // Deprecated alias. Kept for one release so an older installed build --
      // this is a super-admin screen and binaries in the field drift -- still
      // shows a number rather than 0. New callers read `queued`.
      recipients:    userIds.length,
    });
  } catch (err) {
    return json({error: (err as Error).message ?? 'unknown'}, 500);
  }
});

// How many of these recipients can receive a push RIGHT NOW.
//
// This is ELIGIBILITY, not delivery, and the response must never call it
// anything else. Real delivery is only known after process-notification-queue
// hands the row to Expo and reads back a RECEIPT, up to a minute later — and
// even an ok receipt is weaker than "a human saw it" (see that function's
// header, and the 2026-08-24 token experiment recorded there).
//
// The rules below mirror process-notification-queue's two skip paths exactly,
// because a second definition of "deliverable" is just a new way to be wrong:
//   1. no user_devices row with is_active = true  -> skipped, "No active devices"
//   2. notification_preferences.organizer_broadcast = false -> skipped silently
// A user with NO preferences row is eligible; only an explicit false opts out,
// which is how the processor reads it (`prefs && prefs[col] === false`).
//
// Measured against the 2026-08-25 send: 77 queued -> 20 sent, 56 "No active
// devices", 1 preference skip. Counting devices alone would have said 21.
// deno-lint-ignore no-explicit-any
async function countPushEligible(admin: any, userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;

  const withActiveDevice = new Set<string>();
  const optedOut = new Set<string>();
  const chunkSize = 500;

  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const [{data: devices}, {data: prefs}] = await Promise.all([
      admin.from('user_devices').select('user_id').eq('is_active', true).in('user_id', chunk),
      admin.from('notification_preferences').select('user_id').eq('organizer_broadcast', false).in('user_id', chunk),
    ]);
    for (const d of (devices ?? []) as {user_id: string}[]) withActiveDevice.add(d.user_id);
    for (const p of (prefs ?? []) as {user_id: string}[]) optedOut.add(p.user_id);
  }

  let eligible = 0;
  for (const id of withActiveDevice) if (!optedOut.has(id)) eligible++;
  return eligible;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
