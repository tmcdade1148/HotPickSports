import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Expo push delivery is TWO steps and only the second carries the truth.
//
//   /push/send        -> a TICKET.  "Expo accepted the handoff." A ticket
//                        comes back ok for a token whose app was deleted.
//   /push/getReceipts -> a RECEIPT. Available a few seconds later. This is
//                        where DeviceNotRegistered and the provider-side
//                        rejections actually surface.
//
// Until 2026-08-24 this function marked every row `sent` unconditionally
// after fetch(): response.ok was never checked and receipts were never
// fetched. 178 rows read `sent` with zero error_message rows, including 112
// failed ESPN alerts to one user that looked like successes for 18 days.
//
// Now: pending -> awaiting_receipt -> sent|failed, and `sent` is written
// ONLY from an ok receipt.
//
// AN OK RECEIPT IS NOT PROOF OF ARRIVAL. This is measured, not theoretical.
//
// On 2026-08-24 the token ExponentPushToken[pTk_LDMc9bMtBtuBfMlMym] was sent
// to three times across four hours. All three sends returned ok, all three
// RECEIPTS returned ok, and nothing arrived on any device — iPhone or Mac —
// with iOS notification permission confirmed ON at the last two. (Token
// named so the next reader can re-run the experiment.) An ok receipt means
// APNs/FCM accepted the message; Apple reports a dead token later through
// its feedback channel, which Expo folds into SUBSEQUENT receipts as
// DeviceNotRegistered.
//
// So `sent` here means "Expo reported delivery to the provider succeeded",
// which is a real and large improvement on "the POST returned 200" — the
// previous meaning — and is still weaker than "a human saw it". Do not let
// `sent` become the next false signal the way the old one did. The only
// proof of arrival remains a person looking at a device.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts";
const BATCH_SIZE = 50;

/** Expo asks for a few seconds before a receipt exists. */
const RECEIPT_DELAY_MS = 15_000;

/**
 * Expo keeps receipts for about 24h. Past that a still-missing receipt is
 * never going to arrive, so the row is resolved rather than left awaiting
 * forever.
 */
const RECEIPT_GIVE_UP_MS = 24 * 60 * 60 * 1000;

/** Receipts are fetched at most 1000 ids per request (Expo's documented cap). */
const RECEIPT_CHUNK = 1000;

/**
 * A send that fails transport-side stays pending and is retried. Bounded so a
 * permanently-broken row cannot spin forever — the 112-identical-alerts
 * incident is what unbounded retry looks like from the user's side.
 */
const MAX_SEND_ATTEMPTS = 5;

/** Errors that mean the token is dead and must be deactivated. */
const DEAD_TOKEN_ERRORS = new Set(["DeviceNotRegistered", "InvalidCredentials"]);

// Maps notification_type to the column name in notification_preferences
const PREF_COLUMN_MAP: Record<string, string> = {
  picks_deadline: "picks_deadline",
  score_posted: "score_posted",
  leaderboard_change: "leaderboard_change",
  smacktalk_mention: "smacktalk_mention",
  smacktalk_reply: "smacktalk_reply",
  organizer_broadcast: "organizer_broadcast",
  streak_milestone: "streak_milestone",
  new_member_joined: "new_member_joined",
};

interface ExpoTicket {
  id: string;
  token: string;
}

// deno-lint-ignore no-explicit-any
type Supa = any;

Deno.serve(async (req: Request) => {
  // Cron auth gate (verify_jwt=false): require the dedicated cron shared secret.
  // CRON_SHARED_SECRET (Edge Secret) is compared to the x-cron-secret header that
  // pg_cron sends (value from Vault by reference). Decoupled from SB_SECRET_KEY.
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!,
    );

    // Receipts FIRST. Rows handed to Expo on a previous run are the ones that
    // can be resolved to a truthful `sent`, and doing them first means a row
    // queued now gets its receipt read on the very next tick.
    const receipts = await resolveReceipts(supabase);
    const send = await sendPending(supabase);

    return json({ ...send, receipts }, 200);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: errMsg }, 500);
  }
});

// ---------------------------------------------------------------------------
// Pass 1 — send pending notifications, record TICKETS (never `sent`)
// ---------------------------------------------------------------------------

async function sendPending(supabase: Supa) {
  const { data: pending, error: fetchErr } = await supabase
    .from("notification_queue")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) throw new Error(fetchErr.message);
  if (!pending || pending.length === 0) {
    return { processed: 0, handed_off: 0, skipped: 0, failed: 0, retrying: 0 };
  }

  let handedOff = 0;
  let skipped = 0;
  let failed = 0;
  let retrying = 0;

  for (const notif of pending) {
    // Check notification preferences — read the specific boolean column
    const prefColumn = PREF_COLUMN_MAP[notif.notification_type];
    if (prefColumn) {
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select(prefColumn)
        .eq("user_id", notif.user_id)
        .maybeSingle();

      // If user has explicitly set this type to false, skip
      if (prefs && prefs[prefColumn] === false) {
        await supabase
          .from("notification_queue")
          .update({ status: "skipped", sent_at: new Date().toISOString() })
          .eq("id", notif.id);
        skipped++;
        continue;
      }
    }

    // Get active device tokens for this user
    const { data: devices } = await supabase
      .from("user_devices")
      .select("push_token")
      .eq("user_id", notif.user_id)
      .eq("is_active", true);

    if (!devices || devices.length === 0) {
      await supabase
        .from("notification_queue")
        .update({
          status: "skipped",
          error_message: "No active devices",
          sent_at: new Date().toISOString(),
        })
        .eq("id", notif.id);
      skipped++;
      continue;
    }

    const tokens: string[] = devices.map((d: { push_token: string }) => d.push_token);
    const messages = tokens.map((token) => ({
      to: token,
      title: notif.title,
      body: notif.body,
      data: notif.data || {},
      sound: "default",
    }));

    const attempts = (notif.attempts ?? 0) + 1;
    const attemptedAt = new Date().toISOString();

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messages),
      });

      // THE CHECK THAT WAS MISSING. A non-2xx is a transport failure: no
      // tickets exist, nothing was handed to Expo, and the row must stay
      // retryable rather than be recorded as a success.
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 500);
        const giveUp = attempts >= MAX_SEND_ATTEMPTS;
        await supabase
          .from("notification_queue")
          .update({
            status: giveUp ? "failed" : "pending",
            attempts,
            last_attempted_at: attemptedAt,
            error_message: `expo send HTTP ${response.status}: ${detail}`,
            ...(giveUp ? { sent_at: attemptedAt } : {}),
          })
          .eq("id", notif.id);
        giveUp ? failed++ : retrying++;
        continue;
      }

      const result = await response.json();
      const data = Array.isArray(result?.data) ? result.data : null;

      if (!data) {
        const giveUp = attempts >= MAX_SEND_ATTEMPTS;
        await supabase
          .from("notification_queue")
          .update({
            status: giveUp ? "failed" : "pending",
            attempts,
            last_attempted_at: attemptedAt,
            error_message:
              `expo send returned no ticket array: ${JSON.stringify(result).slice(0, 500)}`,
            ...(giveUp ? { sent_at: attemptedAt } : {}),
          })
          .eq("id", notif.id);
        giveUp ? failed++ : retrying++;
        continue;
      }

      // Expo returns one ticket per message, in the order sent — data[i]
      // corresponds to messages[i] and therefore tokens[i]. That alignment is
      // the whole basis for deactivating a token by index, so it is CHECKED
      // rather than assumed: on a length mismatch we still record the ok
      // tickets (which carry their own ids) but refuse to attribute any error
      // ticket to a token, because the wrong device would be deactivated.
      const aligned = data.length === tokens.length;

      const tickets: ExpoTicket[] = [];
      const ticketErrors: string[] = [];

      for (let i = 0; i < data.length; i++) {
        const ticket = data[i];
        const token = aligned ? tokens[i] : null;

        if (ticket?.status === "ok" && ticket.id) {
          tickets.push({ id: ticket.id, token: token ?? "" });
          continue;
        }

        const code = ticket?.details?.error ?? "unknown";
        ticketErrors.push(`${code}: ${ticket?.message ?? ""}`.trim());

        if (token && DEAD_TOKEN_ERRORS.has(code)) {
          await deactivateToken(supabase, token, `ticket:${code}`);
        }
      }

      if (!aligned) {
        ticketErrors.push(
          `ticket/token misalignment: ${data.length} tickets for ${tokens.length} tokens — error tickets not attributed`,
        );
      }

      if (tickets.length === 0) {
        // Every device was rejected outright. Nothing to wait on.
        await supabase
          .from("notification_queue")
          .update({
            status: "failed",
            attempts,
            last_attempted_at: attemptedAt,
            sent_at: attemptedAt,
            error_message: ticketErrors.join(" | ").slice(0, 1000) || "all tickets rejected",
          })
          .eq("id", notif.id);
        failed++;
        continue;
      }

      // Handed off, NOT delivered. sent_at stays null until a receipt says so.
      await supabase
        .from("notification_queue")
        .update({
          status: "awaiting_receipt",
          attempts,
          last_attempted_at: attemptedAt,
          expo_tickets: tickets,
          error_message: ticketErrors.length ? ticketErrors.join(" | ").slice(0, 1000) : null,
        })
        .eq("id", notif.id);
      handedOff++;
    } catch (pushErr: unknown) {
      // fetch() itself threw — network/DNS/timeout. Retryable, same as a
      // non-ok response.
      const errMsg = pushErr instanceof Error ? pushErr.message : "Unknown push error";
      const giveUp = attempts >= MAX_SEND_ATTEMPTS;
      await supabase
        .from("notification_queue")
        .update({
          status: giveUp ? "failed" : "pending",
          attempts,
          last_attempted_at: attemptedAt,
          error_message: errMsg,
          ...(giveUp ? { sent_at: attemptedAt } : {}),
        })
        .eq("id", notif.id);
      giveUp ? failed++ : retrying++;
    }
  }

  return { processed: pending.length, handed_off: handedOff, skipped, failed, retrying };
}

// ---------------------------------------------------------------------------
// Pass 2 — read RECEIPTS and resolve rows to sent | failed
// ---------------------------------------------------------------------------

async function resolveReceipts(supabase: Supa) {
  const cutoff = new Date(Date.now() - RECEIPT_DELAY_MS).toISOString();

  const { data: waiting, error } = await supabase
    .from("notification_queue")
    .select("id, expo_tickets, last_attempted_at, error_message")
    .eq("status", "awaiting_receipt")
    .lt("last_attempted_at", cutoff)
    .order("last_attempted_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) throw new Error(error.message);
  if (!waiting || waiting.length === 0) {
    return { checked: 0, delivered: 0, failed: 0, still_waiting: 0 };
  }

  // One receipt request for the whole batch.
  const allIds: string[] = [];
  for (const row of waiting) {
    for (const t of (row.expo_tickets ?? []) as ExpoTicket[]) {
      if (t?.id) allIds.push(t.id);
    }
  }

  const receipts: Record<string, { status?: string; message?: string; details?: { error?: string } }> = {};
  for (let i = 0; i < allIds.length; i += RECEIPT_CHUNK) {
    const chunk = allIds.slice(i, i + RECEIPT_CHUNK);
    const response = await fetch(EXPO_RECEIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids: chunk }),
    });
    // A failed receipt lookup is not a delivery verdict — leave the rows
    // awaiting and try again next tick.
    if (!response.ok) continue;
    const body = await response.json().catch(() => null);
    if (body?.data) Object.assign(receipts, body.data);
  }

  const checkedAt = new Date().toISOString();
  let delivered = 0;
  let failed = 0;
  let stillWaiting = 0;

  for (const row of waiting) {
    const tickets = (row.expo_tickets ?? []) as ExpoTicket[];
    const known = tickets.filter((t) => receipts[t.id]);

    if (known.length === 0) {
      // Expo has no verdict yet. Give up only once the receipts have
      // certainly expired, so a slow receipt is never mistaken for a failure.
      const age = Date.now() - new Date(row.last_attempted_at).getTime();
      if (age > RECEIPT_GIVE_UP_MS) {
        await supabase
          .from("notification_queue")
          .update({
            status: "failed",
            receipt_checked_at: checkedAt,
            sent_at: checkedAt,
            error_message: appendError(row.error_message, "no Expo receipt within 24h"),
          })
          .eq("id", row.id);
        failed++;
      } else {
        await supabase
          .from("notification_queue")
          .update({ receipt_checked_at: checkedAt })
          .eq("id", row.id);
        stillWaiting++;
      }
      continue;
    }

    const errors: string[] = [];
    let anyOk = false;

    for (const t of known) {
      const receipt = receipts[t.id];
      if (receipt.status === "ok") {
        anyOk = true;
        continue;
      }
      const code = receipt.details?.error ?? "unknown";
      errors.push(`${code}: ${receipt.message ?? ""}`.trim());
      if (t.token && DEAD_TOKEN_ERRORS.has(code)) {
        await deactivateToken(supabase, t.token, `receipt:${code}`);
      }
    }

    if (anyOk) {
      // At least one device took it. THIS is the only place `sent` is written.
      await supabase
        .from("notification_queue")
        .update({
          status: "sent",
          sent_at: checkedAt,
          receipt_checked_at: checkedAt,
          error_message: errors.length ? appendError(row.error_message, errors.join(" | ")) : row.error_message,
        })
        .eq("id", row.id);
      delivered++;
    } else {
      await supabase
        .from("notification_queue")
        .update({
          status: "failed",
          sent_at: checkedAt,
          receipt_checked_at: checkedAt,
          error_message: appendError(row.error_message, errors.join(" | ") || "all receipts errored"),
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return { checked: waiting.length, delivered, failed, still_waiting: stillWaiting };
}

// ---------------------------------------------------------------------------

/**
 * Deactivate a dead token. Keyed by push_token ALONE, not (user_id, token):
 * the token identifies the device, and on a shared/reinstalled phone the row
 * may already have been reassigned to a different user by
 * register_device_token. Scoping the update to the notification's user would
 * silently no-op in exactly that case. Never DELETE (Hard Rule #12).
 */
async function deactivateToken(supabase: Supa, token: string, reason: string) {
  const { error } = await supabase
    .from("user_devices")
    .update({ is_active: false })
    .eq("push_token", token)
    .select("id");
  if (error) {
    console.error(`[push] failed to deactivate token (${reason}):`, error.message);
  }
}

function appendError(existing: string | null, addition: string): string {
  return (existing ? `${existing} | ${addition}` : addition).slice(0, 1000);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
