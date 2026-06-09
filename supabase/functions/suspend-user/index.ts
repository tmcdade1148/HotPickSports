// suspend-user — Edge Function
//
// POST {user_id, reason, action?: 'suspend' | 'unsuspend'}
//
// Auth: caller must have profiles.is_super_admin = true. Audit logs
// first per CLAUDE.md Hard Rule #17, then mutates state.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

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
    const targetUserId: string | undefined = body.user_id;
    const reason: string = (body.reason ?? '').toString().trim();
    const action: 'suspend' | 'unsuspend' = body.action === 'unsuspend' ? 'unsuspend' : 'suspend';

    if (!targetUserId) return json({error: 'user_id required'}, 400);
    if (action === 'suspend' && reason.length === 0) {
      return json({error: 'reason required for suspension'}, 400);
    }

    const auditAction =
      action === 'suspend' ? 'USER_PLATFORM_SUSPENDED' : 'USER_PLATFORM_UNSUSPENDED';
    const {error: auditErr} = await admin.from('admin_audit_log').insert({
      admin_id:     callerId,
      action:       auditAction,
      target_table: 'profiles',
      target_id:    targetUserId,
      metadata:     {reason: reason || null},
    });
    if (auditErr) return json({error: `audit log failed: ${auditErr.message}`}, 500);

    if (action === 'suspend') {
      const {error: profErr} = await admin
        .from('profiles')
        .update({
          is_platform_suspended:      true,
          platform_suspended_at:      new Date().toISOString(),
          platform_suspended_by:      callerId,
          platform_suspension_reason: reason,
        })
        .eq('id', targetUserId);
      if (profErr) return json({error: profErr.message}, 500);

      await admin
        .from('user_devices')
        .update({is_active: false})
        .eq('user_id', targetUserId);

      await admin.from('notification_queue').insert({
        user_id: targetUserId,
        notification_type: 'organizer_broadcast',
        title: 'Account suspended',
        body: 'Your account has been suspended. For more information contact HotPick Sports at support@hotpicksports.com.',
      });
    } else {
      const {error: profErr} = await admin
        .from('profiles')
        .update({
          is_platform_suspended:      false,
          platform_suspended_at:      null,
          platform_suspended_by:      null,
          platform_suspension_reason: null,
        })
        .eq('id', targetUserId);
      if (profErr) return json({error: profErr.message}, 500);

      await admin.from('notification_queue').insert({
        user_id: targetUserId,
        notification_type: 'organizer_broadcast',
        title: 'Account reinstated',
        body: 'Your HotPick account has been reinstated. Welcome back.',
      });
    }

    return json({ok: true, action});
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
