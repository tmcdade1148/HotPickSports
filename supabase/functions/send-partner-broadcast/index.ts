// supabase/functions/send-partner-broadcast/index.ts
// Spec: 260513_HotPick_HomeRedesign_Spec.docx §5.1
//
// Sends a partner broadcast to all members of all pools aligned with the
// partner. Mirrors send-broadcast-email's shape but scoped to a partner,
// not a pool. Writes one row to partner_notifications and enqueues push
// notifications via notification_queue.
//
// Auth model (v3):
//   • Caller is super admin, OR
//   • Caller is the organizer/admin of the partner's CLUB POOL (the pool
//     referenced by partners.club_pool_id). Other pools that joined the
//     partner's roster have no broadcast rights — only the Club Pool's
//     organizer can broadcast on the partner's behalf.
//
// Steps:
//   1. Verify caller is super admin                              → 403
//   2. Validate partner exists and is_active = true              → 404
//   3. Validate partner has at least one perk configured         → 409
//   4. Validate message length 1-280 chars                       → 400
//   5. Rate limit: max 3 broadcasts / partner / 24h              → 429
//   6. Resolve recipients (DISTINCT user_id across aligned pools)
//   7. Insert partner_notifications row
//   8. Enqueue notification_queue rows
//   9. Return 200 with { broadcast_id, recipient_count }
//
// All errors except 500 are deterministic and surfaced verbatim to the
// caller. 500s additionally log to admin_audit_log so they can be
// investigated post-hoc.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MIN_MESSAGE_LEN  = 1;
const MAX_MESSAGE_LEN  = 280;
const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Service-role client (writes across tables; bypasses RLS internally)
// ---------------------------------------------------------------------------
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

interface PartnerBroadcastRequest {
  partner_id: string;
  message: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function logFailure(action: string, ctx: Record<string, unknown>) {
  try {
    await supabase.from("admin_audit_log").insert({
      action_type: "partner_broadcast_failed",
      action_detail: action,
      context_json: ctx,
    });
  } catch {
    // best-effort; we never want audit-log failure to mask the original error
  }
}

Deno.serve(async (req) => {
  try {
    // -----------------------------------------------------------------------
    // Auth: caller must present a bearer token belonging to a super admin.
    // -----------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) {
      return json({ error: "Missing Authorization header" }, 403);
    }

    const { data: { user: caller }, error: userErr } =
      await supabase.auth.getUser(accessToken);
    if (userErr || !caller) {
      return json({ error: "Invalid auth token" }, 403);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", caller.id)
      .maybeSingle();
    const isSuperAdmin = profile?.is_super_admin === true;

    // -----------------------------------------------------------------------
    // Body validation.
    // -----------------------------------------------------------------------
    let body: PartnerBroadcastRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const partnerId = (body.partner_id ?? "").trim();
    const message   = (body.message ?? "").trim();

    if (!partnerId) {
      return json({ error: "partner_id is required" }, 400);
    }
    if (message.length < MIN_MESSAGE_LEN || message.length > MAX_MESSAGE_LEN) {
      return json(
        { error: `message must be ${MIN_MESSAGE_LEN}-${MAX_MESSAGE_LEN} chars` },
        400,
      );
    }

    // -----------------------------------------------------------------------
    // Partner exists + is_active + has perk configured.
    // -----------------------------------------------------------------------
    const { data: partner, error: partnerErr } = await supabase
      .from("partners")
      .select("id, name, slug, is_active, perk_text, club_pool_id")
      .eq("id", partnerId)
      .maybeSingle();

    if (partnerErr || !partner || !partner.is_active) {
      return json({ error: "Partner not found or inactive" }, 404);
    }
    if (!partner.perk_text) {
      return json(
        { error: "Partner must have a perk configured before broadcasting." },
        409,
      );
    }

    // -----------------------------------------------------------------------
    // Authorize: super-admin OR organizer of THIS partner's Club Pool.
    // Sponsor-only partners (no club_pool_id) → super-admin only.
    // -----------------------------------------------------------------------
    if (!isSuperAdmin) {
      if (!partner.club_pool_id) {
        return json(
          { error: "Only super-admin can broadcast for a sponsor-only partner." },
          403,
        );
      }
      const { data: orgMembership } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", caller.id)
        .eq("pool_id", partner.club_pool_id)
        .in("role", ["organizer", "admin"])
        .eq("status", "active")
        .limit(1);
      if (!orgMembership || orgMembership.length === 0) {
        return json(
          { error: "Only this partner's Club Pool organizer can broadcast." },
          403,
        );
      }
    }

    // -----------------------------------------------------------------------
    // Rate limit: count recent broadcasts for this partner.
    // -----------------------------------------------------------------------
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentCount, error: rateErr } = await supabase
      .from("partner_notifications")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .gte("sent_at", since);
    if (rateErr) {
      await logFailure("rate_limit_check", { partnerId, err: rateErr.message });
      return json({ error: "Internal error checking rate limit" }, 500);
    }
    if ((recentCount ?? 0) >= RATE_LIMIT_COUNT) {
      return json(
        { error: `Rate limit: max ${RATE_LIMIT_COUNT} broadcasts per 24h reached.` },
        429,
      );
    }

    // -----------------------------------------------------------------------
    // Resolve recipients — DISTINCT user_id across all aligned active pools.
    // -----------------------------------------------------------------------
    const { data: alignedPools, error: poolsErr } = await supabase
      .from("pools")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("is_archived", false);
    if (poolsErr) {
      await logFailure("resolve_pools", { partnerId, err: poolsErr.message });
      return json({ error: "Internal error resolving aligned pools" }, 500);
    }

    const poolIds = (alignedPools ?? []).map(p => p.id as string);
    if (poolIds.length === 0) {
      return json(
        { error: "Partner has no aligned active pools to broadcast to." },
        409,
      );
    }

    const { data: memberships, error: memErr } = await supabase
      .from("pool_members")
      .select("user_id")
      .in("pool_id", poolIds)
      .eq("status", "active");
    if (memErr) {
      await logFailure("resolve_members", { partnerId, err: memErr.message });
      return json({ error: "Internal error resolving members" }, 500);
    }

    const recipientIds = Array.from(
      new Set((memberships ?? []).map(m => m.user_id as string)),
    );
    if (recipientIds.length === 0) {
      return json(
        { error: "Partner's aligned pools have no active members." },
        409,
      );
    }

    // -----------------------------------------------------------------------
    // Insert the partner_notifications row (one per broadcast, not per recipient).
    // -----------------------------------------------------------------------
    const { data: inserted, error: insertErr } = await supabase
      .from("partner_notifications")
      .insert({
        partner_id:        partnerId,
        sent_by:           caller.id,
        notification_type: "broadcast",
        message,
        recipient_count:   recipientIds.length,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      await logFailure("insert_partner_notification", {
        partnerId, err: insertErr?.message,
      });
      return json({ error: "Internal error recording broadcast" }, 500);
    }

    // -----------------------------------------------------------------------
    // Enqueue push notifications. Best-effort — push delivery itself runs
    // out of process-notification-queue (cron, 60s). We just write the rows.
    // -----------------------------------------------------------------------
    const deepLink = `hotpick://partner/${partner.slug}/roster`;
    const queueRows = recipientIds.map(uid => ({
      user_id:           uid,
      notification_type: "broadcast_received",
      title:             partner.name,
      body:              message,
      deep_link:         deepLink,
    }));

    const { error: queueErr } = await supabase
      .from("notification_queue")
      .insert(queueRows);

    if (queueErr) {
      // The partner_notifications row was written — broadcast IS recorded.
      // Push delivery is degraded but not blocked. Log + still return 200.
      await logFailure("enqueue_push", {
        partnerId, broadcastId: inserted.id, err: queueErr.message,
      });
    }

    return json({
      broadcast_id:    inserted.id,
      recipient_count: recipientIds.length,
    }, 200);

  } catch (err) {
    await logFailure("unhandled_exception", {
      message: err instanceof Error ? err.message : String(err),
    });
    return json({ error: "Internal error" }, 500);
  }
});
