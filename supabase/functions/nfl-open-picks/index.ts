import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
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
      .from("season_games").select("game_id, frozen_rank, kickoff_at")
      .eq("competition", competition).eq("season_year", seasonYear).eq("week", currentWeek);

    if (gamesError || !games || games.length === 0) {
      return json({ success: false, reason: "no_games_found", competition, week: currentWeek }, 400);
    }

    const unranked = games.filter((g) => g.frozen_rank === null);
    if (unranked.length > 0) {
      console.warn(`[nfl-open-picks] ${unranked.length} games have no frozen_rank`);
    }

    // Per-game locking: every game locks at its OWN kickoff time, never before.
    // (Replaces the old two-wave scheme where all Sunday 1pm+ games locked
    // together at the first Sunday 1pm "anchor".)
    for (const game of games) {
      const { error } = await supabase
        .from("season_games")
        .update({ lock_at: game.kickoff_at })  // lock at this game's own kickoff
        .eq("game_id", game.game_id)
        .eq("competition", competition);

      if (error) console.warn(`[nfl-open-picks] Failed to set lock_at for ${game.game_id}: ${error.message}`);
    }

    const { error: updateError } = await supabase.from("competition_config")
      .upsert({ competition, key: "picks_locked", value: false }, { onConflict: "competition,key" });

    if (updateError) return json({ success: false, error: updateError.message }, 500);

    // ── SmackTalk: post "picks open" to all pools ──
    await postToAllPools(supabase, competition, "pick_lock",
      () => `Week ${currentWeek} picks are open. Make your move.`);

    console.log(`[nfl-open-picks] Picks open for ${competition} week=${currentWeek}; each game locks at its own kickoff.`);
    return json({ success: true, competition, season_year: seasonYear, week: currentWeek,
      games_available: games.length, unranked_games: unranked.length, picks_locked: false }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function postToAllPools(
  sb: any, competition: string, messageType: string, textFn: (poolId: string) => string
) {
  const { data: pools } = await sb
    .from("pools").select("id").eq("competition", competition).eq("is_archived", false);
  await Promise.allSettled(
    (pools ?? []).map((p: any) =>
      sb.rpc("post_system_message", { p_pool_id: p.id, p_text: textFn(p.id), p_message_type: messageType })
    )
  );
}
