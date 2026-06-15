// admin-broadcast — Edge Function
//
// Sends a platform-wide message. Two write paths so every recipient
// gets it:
//   1. notification_queue   — push delivery
//   2. organizer_notifications — Message Center inbox (attached to
//      the hidden Platform Pool, which every user is auto-enrolled in)
// Both are gated by is_super_admin + a 1/24h server-enforced rate limit.

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
      const {data: rows} = await admin
        .from('pool_members')
        .select('user_id, pools!inner(competition)')
        .eq('status', 'active')
        .eq('pools.competition', target);
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

    return json({ok: true, recipients: userIds.length, target});
  } catch (err) {
    return json({error: (err as Error).message ?? 'unknown'}, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
