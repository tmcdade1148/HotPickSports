// suspend-pool — Edge Function
//
// POST {pool_id, reason, action?: 'suspend' | 'unsuspend'}
// Auth: caller must have profiles.is_super_admin = true.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const poolId: string | undefined = body.pool_id;
    const reason: string = (body.reason ?? '').toString().trim();
    const action: 'suspend' | 'unsuspend' = body.action === 'unsuspend' ? 'unsuspend' : 'suspend';

    if (!poolId) return json({error: 'pool_id required'}, 400);
    if (action === 'suspend' && reason.length === 0) {
      return json({error: 'reason required for suspension'}, 400);
    }

    const auditAction = action === 'suspend' ? 'POOL_SUSPENDED' : 'POOL_UNSUSPENDED';
    const {error: auditErr} = await admin.from('admin_audit_log').insert({
      admin_id:     callerId,
      action:       auditAction,
      target_table: 'pools',
      target_id:    poolId,
      metadata:     {reason: reason || null},
    });
    if (auditErr) return json({error: `audit log failed: ${auditErr.message}`}, 500);

    const {data: poolRow} = await admin
      .from('pools')
      .select('name')
      .eq('id', poolId)
      .maybeSingle();
    const poolName: string = poolRow?.name ?? 'a Contest';

    if (action === 'suspend') {
      const {error: poolErr} = await admin
        .from('pools')
        .update({
          is_suspended:      true,
          suspended_at:      new Date().toISOString(),
          suspended_by:      callerId,
          suspension_reason: reason,
        })
        .eq('id', poolId);
      if (poolErr) return json({error: poolErr.message}, 500);
    } else {
      const {error: poolErr} = await admin
        .from('pools')
        .update({
          is_suspended:      false,
          suspended_at:      null,
          suspended_by:      null,
          suspension_reason: null,
        })
        .eq('id', poolId);
      if (poolErr) return json({error: poolErr.message}, 500);
    }

    const {data: members} = await admin
      .from('pool_members')
      .select('user_id')
      .eq('pool_id', poolId)
      .eq('status', 'active');
    if (members && members.length > 0) {
      const message =
        action === 'suspend'
          ? `${poolName} has been suspended. For more information contact your pool organizer or admin.`
          : `${poolName} has been reinstated.`;
      const rows = (members as {user_id: string}[]).map(m => ({
        user_id: m.user_id,
        notification_type: 'organizer_broadcast',
        title: action === 'suspend' ? 'Contest suspended' : 'Contest reinstated',
        body: message,
        pool_id: poolId,
      }));
      await admin.from('notification_queue').insert(rows);
    }

    return json({ok: true, action, notified: members?.length ?? 0});
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
