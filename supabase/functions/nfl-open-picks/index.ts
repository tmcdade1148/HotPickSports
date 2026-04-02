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
      .from("season_games").select("game_id, frozen_rank, kickoff_at")
      .eq("competition", competition).eq("season_year", seasonYear).eq("week", currentWeek);

    if (gamesError || !games || games.length === 0) {
      return json({ success: false, reason: "no_games_found", competition, week: currentWeek }, 400);
    }

    const unranked = games.filter((g) => g.frozen_rank === null);
    if (unranked.length > 0) {
      console.warn(`[nfl-open-picks] ${unranked.length} games have no frozen_rank`);
    }

    // Compute per-game lock_at based on the locking strategy:
    // - Games before the Sunday 1pm ET wave lock at their own kickoff
    //   (Thursday night, early Saturday games, London/international games)
    // - All games from the Sunday 1pm ET wave onwards lock at the first Sunday 1pm kickoff
    //
    // Sunday anchor: earliest Sunday game at UTC hour >= 16 (1pm ET or later,
    // regardless of DST). This excludes international games at 9:30am ET (≈13:30 UTC).
    const standardSundayGames = games.filter((g) => {
      const d = new Date(g.kickoff_at);
      return d.getUTCDay() === 0 && d.getUTCHours() >= 16;
    });
    const sundayAnchorMs = standardSundayGames.length > 0
      ? Math.min(...standardSundayGames.map((g) => new Date(g.kickoff_at).getTime()))
      : null;
    const sundayAnchor = sundayAnchorMs !== null ? new Date(sundayAnchorMs) : null;

    for (const game of games) {
      const kickoffMs = new Date(game.kickoff_at).getTime();
      const lockAt = (!sundayAnchor || kickoffMs < sundayAnchorMs!)
        ? game.kickoff_at               // pre-Sunday-1pm wave: lock at own kickoff
        : sundayAnchor.toISOString();   // Sunday 1pm+ wave: lock at anchor

      const { error } = await supabase
        .from("season_games")
        .update({ lock_at: lockAt })
        .eq("game_id", game.game_id)
        .eq("competition", competition);

      if (error) console.warn(`[nfl-open-picks] Failed to set lock_at for ${game.game_id}: ${error.message}`);
    }

    // Write sunday_lock_anchor to competition_config so the client can
    // display "Sunday games lock in: X" countdown without querying games.
    await supabase.from("competition_config").upsert(
      {
        competition,
        key: "sunday_lock_anchor",
        value: sundayAnchor ? sundayAnchor.toISOString() : null,
        description: "ISO timestamp of the first Sunday 1pm ET kickoff this week. All Sunday+ games lock at this time. Null for weeks with no standard Sunday wave (rare).",
      },
      { onConflict: "competition,key" }
    );

    const { error: updateError } = await supabase.from("competition_config")
      .upsert({ competition, key: "picks_locked", value: false }, { onConflict: "competition,key" });

    if (updateError) return json({ success: false, error: updateError.message }, 500);

    console.log(`[nfl-open-picks] Picks open for ${competition} week=${currentWeek}, sunday_anchor=${sundayAnchor?.toISOString() ?? "none"}`);
    return json({ success: true, competition, season_year: seasonYear, week: currentWeek,
      games_available: games.length, unranked_games: unranked.length, picks_locked: false,
      sunday_anchor: sundayAnchor?.toISOString() ?? null }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
