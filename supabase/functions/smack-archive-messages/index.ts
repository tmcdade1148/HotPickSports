// supabase/functions/smack-archive-messages/index.ts
// Archives SmackTalk messages older than 14 days.
// Captures reaction_count before deleting reactions.
// Runs nightly via cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    console.log("[smack-archive] Starting archive run");

    const { data, error } = await supabase.rpc("archive_old_smack_messages");

    if (error) {
      console.error("[smack-archive] RPC error:", error.message);
      return json({ success: false, error: error.message }, 500);
    }

    console.log(`[smack-archive] Done:`, data);
    return json({ success: true, ...data }, 200);

  } catch (err) {
    console.error("[smack-archive] Fatal:", err);
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
