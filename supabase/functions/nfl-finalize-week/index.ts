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

    // ── SmackTalk: post week winner to all pools ──
    try {
      const { data: configRows } = await supabase
        .from("competition_config").select("key, value").eq("competition", competition);
      const cfg = Object.fromEntries((configRows ?? []).map((r: any) => [r.key, r.value]));
      const currentWeek = Number(cfg.current_week ?? 1);
      const seasonYear = Number(cfg.season_year ?? 2026);

      const { data: pools } = await supabase
        .from("pools").select("id").eq("competition", competition).eq("is_archived", false);

      if (pools && pools.length > 0) {
        await Promise.allSettled(pools.map(async (pool: any) => {
          // Find the week winner for this pool
          const { data: members } = await supabase
            .from("pool_members").select("user_id")
            .eq("pool_id", pool.id).eq("status", "active");
          const memberIds = (members ?? []).map((m: any) => m.user_id);
          if (memberIds.length === 0) return;

          const { data: totals } = await supabase
            .from("season_user_totals").select("user_id, week_points")
            .eq("competition", competition).eq("season_year", seasonYear).eq("week", currentWeek)
            .in("user_id", memberIds)
            .order("week_points", { ascending: false })
            .limit(1);

          if (!totals || totals.length === 0) return;
          const winner = totals[0];

          const { data: profile } = await supabase
            .from("profiles").select("poolie_name, first_name")
            .eq("id", winner.user_id).single();
          const name = profile?.poolie_name || profile?.first_name || "Someone";

          const text = `Week ${currentWeek} is official. ${name} takes the week with ${winner.week_points} pts.`;
          await supabase.rpc("post_system_message", {
            p_pool_id: pool.id, p_text: text, p_message_type: "week_result"
          });
        }));
      }
    } catch (smackErr) {
      console.warn("[nfl-finalize-week] SmackTalk post failed:", smackErr);
    }

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
