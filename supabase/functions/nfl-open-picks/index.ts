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

    if (!cfg.is_active) return json({ success: true, reason: "competition_inactive" }, 200);

    const currentWeek = Number(cfg.current_week ?? 1);
    const seasonYear = Number(cfg.season_year ?? 2026);

    const { data: games, error: gamesError } = await supabase
      .from("season_games").select("game_id, frozen_rank")
      .eq("competition", competition).eq("season_year", seasonYear).eq("week", currentWeek);

    if (gamesError || !games || games.length === 0) {
      return json({ success: false, reason: "no_games_found", competition, week: currentWeek }, 400);
    }

    const unranked = games.filter((g) => g.frozen_rank === null);
    if (unranked.length > 0) {
      console.warn(`[nfl-open-picks] ${unranked.length} games have no frozen_rank`);
    }

    const { error: updateError } = await supabase.from("competition_config")
      .upsert({ competition, key: "picks_locked", value: false }, { onConflict: "competition,key" });

    if (updateError) return json({ success: false, error: updateError.message }, 500);

    console.log(`[nfl-open-picks] Picks open for ${competition} week=${currentWeek}`);
    return json({ success: true, competition, season_year: seasonYear, week: currentWeek,
      games_available: games.length, unranked_games: unranked.length, picks_locked: false }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
