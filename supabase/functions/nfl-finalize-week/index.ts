import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const competition = body.competition ?? "nfl_2026";

    console.log(`[nfl-finalize-week] Starting finalization for ${competition}`);

    const { data: lockRow } = await supabase
      .from("competition_config")
      .select("value")
      .eq("competition", competition)
      .eq("key", "scoring_locked")
      .single();

    if (lockRow?.value === true || lockRow?.value === "true") {
      console.log(`[nfl-finalize-week] scoring_locked=true — aborting`);
      return json({ success: false, reason: "scoring_locked" }, 200);
    }

    const { data, error } = await supabase.rpc("finalize_latest_completed_week", {
      p_competition: competition,
    });

    if (error) {
      console.error("[nfl-finalize-week] RPC error:", error.message);
      return json({ success: false, error: error.message }, 500);
    }

    console.log(`[nfl-finalize-week] Result: ${data}`);
    return json({ success: true, result: data, competition }, 200);

  } catch (err) {
    console.error("[nfl-finalize-week] Fatal:", err);
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
