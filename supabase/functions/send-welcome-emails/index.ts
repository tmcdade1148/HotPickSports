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

// THE LETTER LIVES IN CONFIG, NOT HERE.
//
// competition_config.global.welcome_email_subject / welcome_email_body. Tom can
// rewrite the note, dry-run it, read it back, and only then let it send — with
// no developer round-trip and no redeploy. Edits take effect on the next hourly
// tick. Plain text on purpose: it should read like a note from a person, which
// is the entire point of it.
//
// This file owns the SUBSTITUTION, never the words.

/**
 * Fill a template. Conditional block first, because it can contain scalars.
 *
 * Both steps avoid String.replace's replacement-string syntax: a `$&` or `$1`
 * inside a person's name or inside Tom's copy would otherwise be interpreted
 * rather than printed. The block uses a function replacement; the scalars use
 * split/join, which treats the value as literal text by construction.
 */
function renderTemplate(
  template: string,
  vars: Record<string, string>,
  showHouseParagraph: boolean,
): string {
  let out = template.replace(
    /\{\{IF_NO_CONTEST\}\}([\s\S]*?)\{\{\/IF_NO_CONTEST\}\}\n?/g,
    (_match, inner: string) => (showHouseParagraph ? inner : ""),
  );
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  // Collapse the hole the conditional leaves behind. Removing a block that was
  // written on its own lines otherwise strands the blank line above it next to
  // the blank line below it, and "Your Picks. On the record." arrives after a
  // double gap that looks like a rendering bug rather than a paragraph break.
  //
  // Done as a normalisation rather than by making the regex count newlines,
  // because it is correct however the block is laid out — and the copy lives in
  // config now, so the layout is Tom's to change without touching this file. In
  // plain-text email a run of three or more newlines is never intentional.
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

/**
 * Any {{...}} left after rendering is a typo in the copy ({{first_nme}}), an
 * unclosed IF block, or a placeholder this function does not know about. All
 * three must refuse rather than ship: a raw handlebar in a founder's email is
 * the single most obviously-automated thing that could arrive in someone's
 * inbox, and it cannot be taken back.
 */
function unresolvedPlaceholder(rendered: string): string | null {
  return rendered.match(/\{\{[^{}]*\}\}/)?.[0] ?? null;
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

    // The letter and the house code, in one read. All three are global keys.
    const { data: cfgRows } = await supabase
      .from("competition_config").select("key, value")
      .eq("competition", "global")
      .in("key", ["welcome_email_subject", "welcome_email_body", "house_contest_code"]);
    const cfg: Record<string, string> = {};
    for (const r of (cfgRows ?? []) as { key: string; value: unknown }[]) {
      if (typeof r.value === "string") cfg[r.key] = r.value;
    }

    const subjectTemplate = (cfg.welcome_email_subject ?? "").trim();
    const bodyTemplate = cfg.welcome_email_body ?? "";
    // Only the CODE gets quote-stripping. A code cannot legitimately contain a
    // quote character; Tom's copy can, and stripping there would eat a real one.
    const houseCode = (cfg.house_contest_code ?? "").replace(/^"|"$/g, "").trim();

    // FAIL CLOSED on unsendable copy. Blanking welcome_email_body is therefore a
    // second kill switch alongside pausing the cron: nothing sends, no deploy.
    const copyProblems: string[] = [];
    if (!subjectTemplate) copyProblems.push("welcome_email_subject is missing or empty");
    if (!bodyTemplate.trim()) copyProblems.push("welcome_email_body is missing or empty");
    else if (!bodyTemplate.includes("{{unsubscribe_url}}")) {
      copyProblems.push(
        "welcome_email_body has no {{unsubscribe_url}} placeholder — refusing to send an email with no way to opt out",
      );
    }

    // Render EVERYONE before sending ANYONE. A typo in the copy is a property of
    // the template, not of one recipient, so it must surface before the first
    // send rather than halfway through a loop that has already emailed half the
    // list. The token here is the one the candidate query returned; the send
    // loop re-renders the body against the token it has actually confirmed.
    type Rendered = Candidate & { subject: string; body: string; shows_house_code: boolean };
    const rendered: Rendered[] = [];
    if (copyProblems.length === 0) {
      for (const c of list) {
        const shows_house_code = c.real_contests === 0 && !!houseCode;
        const vars = {
          first_name: (c.first_name ?? "").trim() || "there",
          unsubscribe_url: `${UNSUB_BASE}?t=${c.unsub_token ?? "<generated at send>"}`,
          house_code: houseCode,
        };
        const subject = renderTemplate(subjectTemplate, vars, shows_house_code);
        const body = renderTemplate(bodyTemplate, vars, shows_house_code);
        const stray = unresolvedPlaceholder(subject) ?? unresolvedPlaceholder(body);
        if (stray) {
          copyProblems.push(`unresolved placeholder ${stray} after rendering — check the copy`);
          break;
        }
        rendered.push({ ...c, subject, body, shows_house_code });
      }
    }

    if (dryRun) {
      // Renders everything, sends nothing, writes nothing. This is the only
      // chance to see the recipient list before it becomes an outbox — and, now
      // that the copy is editable, the only chance to read the words back.
      return json({
        success: copyProblems.length === 0,
        dry_run: true,
        copy_problems: copyProblems,
        house_code: houseCode || null,
        attempted: list.length,
        recipients: rendered.map((r) => ({
          user_id: r.user_id,
          email: r.email,
          real_contests: r.real_contests,
          shows_house_code: r.shows_house_code,
          subject: r.subject,
          body: r.body,
        })),
      }, 200);
    }

    if (copyProblems.length > 0) {
      return json({ success: false, error: "copy_not_sendable", copy_problems: copyProblems }, 500);
    }

    if (!RESEND_API_KEY) {
      return json({ success: false, error: "RESEND_API_KEY not configured" }, 500);
    }

    let sent = 0, failed = 0, skipped = 0;
    const outcomes: unknown[] = [];

    for (const c of rendered) {
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

      // Re-render the body against the token actually confirmed a few lines up,
      // rather than the one the candidate query returned. They are the same for
      // anyone who already had a preferences row, and this is the only way the
      // link is right for anyone who did not. The subject carries no token, so
      // the pre-rendered one stands.
      const text = renderTemplate(
        bodyTemplate,
        {
          first_name: (c.first_name ?? "").trim() || "there",
          unsubscribe_url: `${UNSUB_BASE}?t=${token}`,
          house_code: houseCode,
        },
        c.shows_house_code,
      );

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
            subject: c.subject,
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
