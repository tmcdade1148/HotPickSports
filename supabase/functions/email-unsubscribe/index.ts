// email-unsubscribe — public, unauthenticated opt-out endpoint.
//
// PUBLIC ON PURPOSE (verify_jwt = false, no cron secret). The person clicking
// this may not be logged in, may not have the app installed any more, and must
// never be asked to authenticate in order to stop receiving email. An
// unsubscribe link that demands a login is not an unsubscribe link.
//
// The token is an opaque per-user uuid (notification_preferences.email_unsub_token)
// and is the ONLY identifier in the URL. Never the user_id, never the email
// address: a guessable URL lets anyone opt anyone out, and a user_id in a query
// string is an identifier leak into logs, referrers and browser history.
//
// Every outcome returns the SAME page. A valid token, an expired one, a typo, a
// random guess — all render identically, so the endpoint never confirms whether
// an address exists. That is also why there is no error state to design.
//
// KNOWN CAVEAT: this opts out on GET, per spec. Some corporate mail scanners
// (Outlook Safe Links and friends) fetch every URL in a message, which can
// unsubscribe someone who never clicked. The harm is asymmetric and this is the
// safer side of it — a wrongly-unsubscribed person can be re-subscribed, whereas
// an unsubscribe that does not work is a compliance problem. The upgrade path,
// when volume justifies it, is RFC 8058 one-click POST with a
// List-Unsubscribe-Post header.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
  { auth: { persistSession: false } },
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Self-contained: no external stylesheet, no font, no image. Mail-client
// browsers are unpredictable and this has to render everywhere.
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unsubscribed &middot; HotPick Sports</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    background: #0f1115; color: #f2f4f8;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 24px;
  }
  .card { max-width: 30rem; text-align: center; }
  h1 { font-size: 1.35rem; margin: 0 0 .75rem; letter-spacing: .01em; }
  p { margin: 0 0 .75rem; color: #b9c0cc; }
  .quiet { font-size: .85rem; color: #7d8695; margin-top: 1.5rem; }
</style>
</head>
<body>
  <div class="card">
    <h1>You're unsubscribed.</h1>
    <p>You won't get any more email from HotPick Sports.</p>
    <p>Notifications inside the app are separate and haven't changed. You can turn those on or off in Settings.</p>
    <p class="quiet">Changed your mind, or landed here by accident? Write support@hotpicksports.com and we'll sort it out.</p>
  </div>
</body>
</html>`;

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("t") ?? "";

  // Validate the SHAPE before querying: passing a non-uuid into a uuid column
  // raises, and an error page would tell the caller their guess was malformed
  // rather than simply wrong. Same page either way.
  if (UUID_RE.test(token)) {
    // Chained .select() so an RLS-filtered or no-match update surfaces as zero
    // rows here rather than a silent success (CLAUDE.md, silent RLS-filtered
    // writes). Nothing is done with the result on purpose — the response must
    // not vary by outcome.
    const { error } = await supabase
      .from("notification_preferences")
      .update({ email_opt_out: true })
      .eq("email_unsub_token", token)
      .select("user_id");
    if (error) console.error("[email-unsubscribe]", error.message);
  }

  return new Response(PAGE, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
