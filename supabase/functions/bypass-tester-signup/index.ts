// bypass-tester-signup — admin-created tester accounts that skip email confirmation.
// Spec: 260612_HotPick_OperatorConsole_Phase2_Spec §5b.
//
// verify_jwt = false — this handles PRE-AUTH signup; no JWT exists yet. It is pinned
// false in config.toml. The gate is the server-side email-pattern check + the service
// role key it holds (spec §7: never set verify_jwt true here).
//
// Flow (reconciled with the app's real signup, which collects only email+password at
// EmailEntryScreen and gathers first_name/poolie_name later in ProfileSetup):
//   1. Validate tester email pattern server-side (authoritative).
//   2. createUser({ email_confirm: true }) — user is immediately active, no email sent.
//      The on_auth_user_created trigger auto-creates the profiles row.
//   3. Upsert that profile to is_test_account = true (only settable here, service role).
//   4. Return success; the app then calls signInWithPassword with the same credentials
//      (works immediately because email is pre-confirmed) — no session minted here,
//      because supabase-js exposes no admin.createSession.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function isTesterEmail(email: string): boolean {
  const e = email.toLowerCase().trim();
  return e.startsWith("tester_") && e.endsWith("@hotpicksports.com");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const email: string = (body.email ?? "").trim();
    const password: string = body.password ?? "";
    const firstName: string | null = body.first_name ?? body.full_name ?? null;
    const poolieName: string | null = body.poolie_name ?? null;

    // 1. Server-side gate — never trust the client to pre-filter (spec §7).
    if (!isTesterEmail(email)) return json({ error: "Not a tester email" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Invalid email" }, 400);
    if (typeof password !== "string" || password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // 2. Create an immediately-active user (skips the confirmation email).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createErr || !created?.user) {
      const msg = (createErr?.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return json({ error: "An account with this email already exists" }, 409);
      }
      console.error("[bypass-tester-signup] createUser", createErr);
      return json({ error: "Account creation failed — please try again" }, 500);
    }
    const userId = created.user.id;

    // 3. The on_auth_user_created trigger created the profile row; upsert the
    //    tester flag (+ any names provided). is_test_account is only ever set here.
    const profile: Record<string, unknown> = { id: userId, is_test_account: true };
    if (firstName) profile.first_name = firstName;
    if (poolieName) profile.poolie_name = poolieName;
    const { error: profErr } = await admin.from("profiles").upsert(profile, { onConflict: "id" });
    if (profErr) {
      // Auth user exists but profile flag failed — log for manual cleanup (spec §5b).
      console.error("[bypass-tester-signup] profile upsert", profErr);
      await admin.from("admin_audit_log").insert({
        admin_id: userId, action: "TESTER_SIGNUP_PROFILE_FAILED", target_table: "profiles", target_id: userId,
        metadata: { email },
      }).catch(() => {});
      return json({ error: "Account creation failed — please try again" }, 500);
    }

    // 4. App signs in with the same credentials next (email is pre-confirmed).
    return json({ success: true, user_id: userId, is_test_account: true }, 200);
  } catch (err: unknown) {
    console.error("[bypass-tester-signup]", err);
    return json({ error: "Account creation failed — please try again" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
