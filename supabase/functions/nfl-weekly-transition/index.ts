// MANUAL EMERGENCY ORCHESTRATOR ONLY — no cron job calls this.
// Use when cron jobs fail and you need to manually trigger a full weekly transition.

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

    const { data: configRows } = await supabase
      .from("competition_config").select("key, value").eq("competition", competition);
    const cfg = Object.fromEntries((configRows ?? []).map((r) => [r.key, r.value]));

    if (!cfg.is_active) return json({ success: false, reason: "competition_inactive" }, 200);

    const currentWeek = Number(body.week ?? cfg.current_week ?? 1);
    const seasonYear = Number(cfg.season_year ?? 2026);
    const baseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    console.warn(`[nfl-weekly-transition] MANUAL RUN: ${competition} ${seasonYear} week=${currentWeek}`);

    const call = async (fn: string, payload: object) => {
      const res = await fetch(`${baseUrl}/functions/v1/${fn}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { ok: res.ok, data: await res.json().catch(() => ({})) };
    };

    const steps: Record<string, unknown> = {};

    const imp = await call("nfl-import-schedule", { competition, week: currentWeek });
    steps.import_schedule = { status: imp.ok ? "completed" : "failed", games_imported: imp.data?.imported ?? 0 };

    const odds = await call("nfl-fetch-odds", { competition, week: currentWeek });
    steps.fetch_odds = { status: odds.ok ? "completed" : "failed", games_updated: odds.data?.updated ?? 0 };

    const rank = await call("nfl-rank-games", { competition, week: currentWeek });
    steps.rank_games = { status: rank.ok ? "completed" : "failed", games_ranked: rank.data?.updated ?? 0 };

    const open = await call("nfl-open-picks", { competition });
    steps.open_picks = { status: open.ok ? "completed" : "failed" };

    const hasFailures = Object.values(steps).some((s: any) => s.status === "failed");
    return json({ success: !hasFailures, status: hasFailures ? "completed_with_errors" : "success",
      competition, season_year: seasonYear, week: currentWeek, steps }, hasFailures ? 207 : 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
