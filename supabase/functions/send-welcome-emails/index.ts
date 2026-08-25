// send-welcome-emails — the founder's welcome note, 24 hours after signup.
//
// This is the first user-facing email HotPick has ever sent, and the thing it
// is most capable of doing wrong is sending to everybody at once. A welcome
// note cannot be un-sent.
//
// Eligibility lives in SQL (welcome_email_candidates), NOT here. Three
// independent guards, any one of which alone would prevent the disaster:
//   1. welcome_email_start_at — a hard floor written at migration time. Accounts
//      created before it are never eligible, forever. If the key is MISSING the
//      comparison is NULL and nobody qualifies — it fails closed.
//   2. a 72-hour ceiling, so a cron paused for a week resumes on the last three
//      days rather than the whole gap.
//   3. email_log's unique index — one row per user per email_type, ever.
//
// dry_run renders everything and sends/writes NOTHING. Run it, read the list,
// send one live test to Tom, and only then activate the cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
  { auth: { persistSession: false } },
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "Tom at HotPick <noreply@hotpicksports.com>";
const REPLY_TO = "support@hotpicksports.com";
const UNSUB_BASE = "https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/email-unsubscribe";
const EMAIL_TYPE = "welcome";

// Resend's default is a small number of requests per second, and the volume here
// is a handful per day. Serial with a gap is plenty and keeps the code boring.
const SEND_GAP_MS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Candidate {
  user_id: string;
  email: string;
  first_name: string | null;
  real_contests: number;
  unsub_token: string | null;
}

const SUBJECT = "You're in.";

// The letter. Plain text on purpose — it reads like a note from a person, which
// is the entire point of it. No HTML, no tracking pixel, no open/click tracking.
//
// The house-code paragraph renders ONLY when the reader is in zero real Contests
// AND a house code is actually open. The code comes from the SAME config key the
// Join screen reads (house_contest_code) rather than being written into this
// template: it rolls to 26B/26C as cohorts fill, and an empty value is the kill
// switch. A hardcoded code here would keep pointing at a full or closed Contest
// after the roll, and an email cannot be edited once it is sent.
function renderBody(c: Candidate, houseCode: string, unsubUrl: string): string {
  const name = (c.first_name ?? "").trim() || "there";

  const houseParagraph =
    c.real_contests === 0 && houseCode
      ? `\nAnd if you're just here to play while you figure that out, use the code ${houseCode}. That'll get you in a game.\n`
      : "";

  return `Hi ${name},

Tom here. I built HotPick.

Quick version of what you're in for: you make your picks, they lock at the first kickoff, and that's that. No changing your mind Sunday morning when the injury report lands. You said what you said on Thursday, and everybody can see it.

That's the whole idea. Anybody can be right on Monday.

It works best with people you actually know. The guys from work. Your brother-in-law who won't stop talking. The four people in a text thread that goes quiet every February. If you've got a group like that, start a Contest and pull them in. Takes about a minute.

Or if somebody you know already runs one of these every year, send them this. They're the person I'd most like to meet.
${houseParagraph}
Anything not working right, or just want to tell me something's dumb? Reply here, or write ${REPLY_TO}. It's a short list of people reading it.

Glad you're here.

Tom
Founder, HotPick Sports

---
Don't want these? Unsubscribe: ${unsubUrl}
`;
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    const { data: candidates, error: candErr } = await supabase
      .rpc("welcome_email_candidates");
    if (candErr) return json({ success: false, error: candErr.message }, 500);

    const list = (candidates ?? []) as Candidate[];

    // Same key the Join screen reads. Empty string = the door is shut, so the
    // house paragraph simply does not render.
    const { data: cfg } = await supabase
      .from("competition_config").select("value")
      .eq("competition", "global").eq("key", "house_contest_code").maybeSingle();
    const houseCode =
      typeof cfg?.value === "string" ? cfg.value.replace(/^"|"$/g, "").trim() : "";

    if (dryRun) {
      // Renders everything, sends nothing, writes nothing. This is the only
      // chance to see the recipient list before it becomes an outbox.
      return json({
        success: true,
        dry_run: true,
        house_code: houseCode || null,
        attempted: list.length,
        recipients: list.map((c) => ({
          user_id: c.user_id,
          email: c.email,
          real_contests: c.real_contests,
          shows_house_code: c.real_contests === 0 && !!houseCode,
          subject: SUBJECT,
          body: renderBody(c, houseCode, `${UNSUB_BASE}?t=${c.unsub_token ?? "<generated at send>"}`),
        })),
      }, 200);
    }

    if (!RESEND_API_KEY) {
      return json({ success: false, error: "RESEND_API_KEY not configured" }, 500);
    }

    let sent = 0, failed = 0, skipped = 0;
    const outcomes: unknown[] = [];

    for (const c of list) {
      // Guarantee a preferences row (and therefore a token) before the link is
      // rendered. 17 of 151 accounts had no row at all, so a missing one is a
      // normal case, not an anomaly — and an unsubscribe link that 404s is worse
      // than no email.
      await supabase.from("notification_preferences")
        .upsert({ user_id: c.user_id }, { onConflict: "user_id", ignoreDuplicates: true });

      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("email_opt_out, email_unsub_token")
        .eq("user_id", c.user_id).maybeSingle();

      // Re-checked immediately before sending, not just at selection time. The
      // dry run and the real run are minutes apart and a person can unsubscribe
      // in between.
      if (prefs?.email_opt_out === true) {
        skipped++;
        outcomes.push({ email: c.email, outcome: "skipped", reason: "opted out" });
        continue;
      }
      const token = prefs?.email_unsub_token;
      if (!token) {
        failed++;
        outcomes.push({ email: c.email, outcome: "failed", reason: "no unsubscribe token" });
        continue;
      }

      // CLAIM the log row BEFORE the provider call. The unique index then makes
      // double-sending structurally impossible: a second overlapping invocation
      // conflicts here and skips, rather than both sending and only the loser
      // failing to log. Note this writes 'sending', never 'sent' — 'sent' is
      // written only from a successful provider response, below.
      //
      // Trade-off, deliberately taken: if this function dies between the claim
      // and the resolve, the row stays 'sending' and that person never gets the
      // note. Missing one welcome beats sending two. Find them with:
      //   SELECT * FROM email_log WHERE status='sending' AND created_at < now() - interval '1 hour';
      const { error: claimErr } = await supabase.from("email_log").insert({
        user_id: c.user_id, email_type: EMAIL_TYPE, sent_to: c.email, status: "sending",
      });
      if (claimErr) {
        skipped++;
        outcomes.push({ email: c.email, outcome: "skipped", reason: "already claimed" });
        continue;
      }

      const text = renderBody(c, houseCode, `${UNSUB_BASE}?t=${token}`);

      let status = "failed";
      let detail = "";
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [c.email],
            reply_to: REPLY_TO,
            subject: SUBJECT,
            text,
          }),
        });
        const respBody = await res.text();
        if (res.ok) {
          status = "sent";
          detail = respBody.slice(0, 300);
          sent++;
        } else {
          detail = `resend ${res.status}: ${respBody.slice(0, 300)}`;
          failed++;
        }
      } catch (e) {
        detail = e instanceof Error ? e.message : String(e);
        failed++;
      }

      await supabase.from("email_log")
        .update({ status, detail, updated_at: new Date().toISOString() })
        .eq("user_id", c.user_id).eq("email_type", EMAIL_TYPE);

      outcomes.push({ email: c.email, outcome: status, detail: detail.slice(0, 120) });
      await sleep(SEND_GAP_MS);
    }

    return json({
      success: true, dry_run: false,
      attempted: list.length, sent, failed, skipped, outcomes,
    }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}
