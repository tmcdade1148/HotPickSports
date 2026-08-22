// ops-alert -- single-purpose operational alert mailer.
//
// Sends ONE email to the ops recipient (competition_config global key
// 'ops_alert_email', fallback below). Called by run_pipeline_watchdog() in
// Postgres via net.http_post with the cron shared secret. This function is
// deliberately dumb: no fan-out, no queries beyond the recipient lookup, no
// state. Detection logic lives in SQL where it cannot be taken down by an
// Edge runtime or dependency problem; this hop exists only because
// RESEND_API_KEY is an Edge secret that Postgres cannot read.
//
// Born from the 2026-08-20/21 incidents: the ESPN pipeline died twice while
// every layer (pg_cron, net.http_post, the old espn-health-check ->
// notification_queue path) reported success. Alerts must not travel through
// the app's own push pipeline -- that is the system being monitored.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "HotPick Ops <noreply@hotpicksports.com>";
const FALLBACK_RECIPIENT = "tpmcdade@yahoo.com";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "unauthorized" }, 401);
  }
  try {
    const { subject, body_text } = await req.json();
    if (!subject || !body_text) {
      return json({ success: false, error: "subject and body_text required" }, 400);
    }
    if (!RESEND_API_KEY) {
      return json({ success: false, error: "RESEND_API_KEY not configured" }, 500);
    }

    let recipient = FALLBACK_RECIPIENT;
    const { data: cfg } = await supabase
      .from("competition_config")
      .select("value")
      .eq("competition", "global")
      .eq("key", "ops_alert_email")
      .maybeSingle();
    if (cfg?.value && typeof cfg.value === "string" && cfg.value.includes("@")) {
      recipient = cfg.value;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipient],
        subject,
        text: body_text,
      }),
    });

    const resendBody = await res.text();
    return json({
      success: res.ok,
      resend_status: res.status,
      recipient,
      resend_body: resendBody.slice(0, 300),
    }, res.ok ? 200 : 502);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
