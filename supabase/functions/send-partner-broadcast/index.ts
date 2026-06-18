// supabase/functions/send-partner-broadcast/index.ts
// v5 (2026-06-04): Broadcast auth now gates on partner_members (Chairman /
// Directors) instead of the Club Pool organizer, so sponsor-only partners can
// broadcast through their board. Recipient resolution still unions the legacy
// pools.partner_id column AND the pool_partner_affiliations table.
//
// Auth: super-admin OR a partner_members row (Chairman / Director).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MIN_MESSAGE_LEN  = 1;
const MAX_MESSAGE_LEN  = 280;
const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
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

// Was inserting into admin_audit_log with columns that don't exist
// (action_type / action_detail / context_json) and a disallowed `action`
// value, inside an empty catch — so every failure was silently swallowed.
// Log to stderr instead; the Edge Function logs are the record.
function logFailure(action: string, ctx: Record<string, unknown>) {
  console.error(`[send-partner-broadcast] ${action}`, JSON.stringify(ctx));
}

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ error: "Missing Authorization header" }, 403);

    const { data: { user: caller }, error: userErr } =
      await supabase.auth.getUser(accessToken);
    if (userErr || !caller) return json({ error: "Invalid auth token" }, 403);

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", caller.id)
      .maybeSingle();
    const isSuperAdmin = profile?.is_super_admin === true;

    let body: PartnerBroadcastRequest;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const partnerId = (body.partner_id ?? "").trim();
    const message   = (body.message ?? "").trim();

    if (!partnerId) return json({ error: "partner_id is required" }, 400);
    if (message.length < MIN_MESSAGE_LEN || message.length > MAX_MESSAGE_LEN) {
      return json({ error: `message must be ${MIN_MESSAGE_LEN}-${MAX_MESSAGE_LEN} chars` }, 400);
    }

    const { data: partner } = await supabase
      .from("partners")
      .select("id, name, slug, is_active, perk_text, club_pool_id")
      .eq("id", partnerId)
      .maybeSingle();

    if (!partner || !partner.is_active) return json({ error: "Partner not found or inactive" }, 404);
    if (!partner.perk_text) return json({ error: "Partner must have a perk configured before broadcasting." }, 409);

    if (!isSuperAdmin) {
      // The partner's Chairman or Directors (partner_members) may broadcast —
      // no Club Pool required, so sponsor-only partners work too.
      const { data: membership } = await supabase
        .from("partner_members")
        .select("role")
        .eq("partner_id", partnerId)
        .eq("user_id", caller.id)
        .limit(1);
      if (!membership || membership.length === 0) {
        return json({ error: "Only this partner's Chairman or Directors can broadcast." }, 403);
      }
    }

    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentCount, error: rateErr } = await supabase
      .from("partner_notifications")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .gte("sent_at", since);
    if (rateErr) {
      logFailure("rate_limit_check", { partnerId, err: rateErr.message });
      return json({ error: "Internal error checking rate limit" }, 500);
    }
    if ((recentCount ?? 0) >= RATE_LIMIT_COUNT) {
      return json({ error: `Rate limit: max ${RATE_LIMIT_COUNT} broadcasts per 24h reached.` }, 429);
    }

    // Union the legacy and affiliations paths.
    const [legacyRes, affRes] = await Promise.all([
      supabase
        .from("pools")
        .select("id")
        .eq("partner_id", partnerId)
        .eq("is_archived", false),
      supabase
        .from("pool_partner_affiliations")
        .select("pool_id, pools!inner(is_archived)")
        .eq("partner_id", partnerId),
    ]);

    if (legacyRes.error || affRes.error) {
      logFailure("resolve_pools", {
        partnerId,
        legacyErr: legacyRes.error?.message,
        affErr:    affRes.error?.message,
      });
      return json({ error: "Internal error resolving aligned pools" }, 500);
    }

    const poolIdSet = new Set<string>();
    for (const r of (legacyRes.data ?? []) as { id: string }[]) {
      poolIdSet.add(r.id);
    }
    type AffRow = {
      pool_id: string;
      pools: { is_archived: boolean } | { is_archived: boolean }[] | null;
    };
    for (const r of (affRes.data ?? []) as unknown as AffRow[]) {
      const inner = Array.isArray(r.pools) ? r.pools[0] : r.pools;
      if (inner && inner.is_archived === false) {
        poolIdSet.add(r.pool_id);
      }
    }
    const poolIds = Array.from(poolIdSet);

    if (poolIds.length === 0) {
      return json({ error: "Partner has no aligned active pools to broadcast to." }, 409);
    }

    const { data: memberships, error: memErr } = await supabase
      .from("pool_members")
      .select("user_id")
      .in("pool_id", poolIds)
      .eq("status", "active");
    if (memErr) {
      logFailure("resolve_members", { partnerId, err: memErr.message });
      return json({ error: "Internal error resolving members" }, 500);
    }

    const recipientIds = Array.from(
      new Set((memberships ?? []).map(m => m.user_id as string)),
    );
    if (recipientIds.length === 0) {
      return json({ error: "Partner's aligned pools have no active members." }, 409);
    }

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
      logFailure("insert_partner_notification", {
        partnerId, err: insertErr?.message,
      });
      return json({ error: "Internal error recording broadcast" }, 500);
    }

    // Mirror into organizer_notifications (Message Center) attached to
    // the Club Pool when the partner runs one.
    if (partner.club_pool_id) {
      const { data: clubPool } = await supabase
        .from("pools")
        .select("competition")
        .eq("id", partner.club_pool_id)
        .maybeSingle();
      if (clubPool?.competition) {
        await supabase.from("organizer_notifications").insert({
          pool_id:           partner.club_pool_id,
          competition:       clubPool.competition,
          organizer_id:      caller.id,
          notification_type: "broadcast",
          message:           `${partner.name}\n\n${message}`,
          recipient_count:   recipientIds.length,
          sent_at:           new Date().toISOString(),
        });
      }
    }

    // notification_queue has no `deep_link` column (it lives in `data`), and
    // 'broadcast_received' is neither an allowed queue type nor a
    // notification_preferences toggle — the old rows errored (zero push) and
    // would have bypassed the user's toggle. Use 'organizer_broadcast' (the
    // shared broadcast push type the processor honors) and carry the deep link
    // in `data`, which the processor forwards to Expo verbatim.
    const deepLink = `hotpick://partner/${partner.slug}/roster`;
    const queueRows = recipientIds.map(uid => ({
      user_id:           uid,
      notification_type: "organizer_broadcast",
      title:             partner.name,
      body:              message,
      data:              { deep_link: deepLink, kind: "partner_broadcast" },
    }));

    const { error: queueErr } = await supabase
      .from("notification_queue")
      .insert(queueRows);

    if (queueErr) {
      logFailure("enqueue_push", {
        partnerId, broadcastId: inserted.id, err: queueErr.message,
      });
    }

    return json({
      broadcast_id:    inserted.id,
      recipient_count: recipientIds.length,
    }, 200);

  } catch (err) {
    logFailure("unhandled_exception", {
      message: err instanceof Error ? err.message : String(err),
    });
    return json({ error: "Internal error" }, 500);
  }
});
