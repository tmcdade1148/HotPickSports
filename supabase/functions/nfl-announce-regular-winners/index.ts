import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Posts a "regular season winner" announcement to each pool's Chirps feed when
// the regular season closes (REGULAR_COMPLETE), before the playoff scoreboard
// resets. Per-pool winner is computed from the final REGULAR-phase standings
// (scoped to the pool's members + pool_start_date), ties broken alphabetically
// to match the app's Ladder. Idempotent: a pool that already has a
// 'regular_season_winner' message is skipped, so it's safe to re-run.
//
// NOTE: Production fires this automatically via the
// announce_regular_winners_on_phase DB trigger when current_phase flips to
// REGULAR_COMPLETE. This function is kept as a MANUAL backfill / re-run tool
// (e.g. to announce for pools created after the flip, or if the trigger was
// added after a competition had already advanced).

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const competition = body.competition ?? "nfl_2026";

    const { data: pools } = await supabase
      .from("pools")
      .select("id, pool_start_date")
      .eq("competition", competition)
      .eq("is_archived", false);

    let announced = 0;
    let skipped = 0;

    for (const pool of pools ?? []) {
      // Idempotency — already announced for this pool.
      const { data: existing } = await supabase
        .from("smack_messages")
        .select("id")
        .eq("pool_id", pool.id)
        .eq("message_type", "regular_season_winner")
        .limit(1);
      if (existing && existing.length > 0) { skipped++; continue; }

      const { data: members } = await supabase
        .from("pool_members")
        .select("user_id")
        .eq("pool_id", pool.id)
        .eq("status", "active");
      const memberIds = (members ?? []).map((m) => m.user_id);
      if (memberIds.length === 0) { skipped++; continue; }

      // First week on/after the pool's start date (mid-season pools start later).
      let startWeek = 1;
      if (pool.pool_start_date) {
        const { data: firstGame } = await supabase
          .from("season_games")
          .select("week")
          .eq("competition", competition)
          .gte("kickoff_at", pool.pool_start_date)
          .order("kickoff_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (firstGame?.week) startWeek = firstGame.week;
      }

      // Final regular-season standings for this pool's members.
      const { data: totals } = await supabase
        .from("season_user_totals")
        .select("user_id, week_points")
        .eq("competition", competition)
        .in("user_id", memberIds)
        .eq("phase", "REGULAR")
        .gte("week", startWeek);

      const byUser: Record<string, number> = {};
      for (const t of totals ?? []) {
        byUser[t.user_id] = (byUser[t.user_id] ?? 0) + (t.week_points ?? 0);
      }
      const ids = Object.keys(byUser);
      if (ids.length === 0) { skipped++; continue; }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, poolie_name, first_name, last_name")
        .in("id", ids);
      const names: Record<string, string> = {};
      for (const p of profiles ?? []) names[p.id] = formatName(p);

      // Top points, ties A→Z by name (matches the Ladder).
      ids.sort((a, b) =>
        byUser[b] !== byUser[a]
          ? byUser[b] - byUser[a]
          : (names[a] ?? "").localeCompare(names[b] ?? "", undefined, { sensitivity: "base" })
      );
      const winnerId = ids[0];
      const winnerName = names[winnerId] ?? "A player";
      const winnerPts = byUser[winnerId];

      const text =
        `\u{1F3C6} Regular season's in the books! ${winnerName} takes the crown with ` +
        `${winnerPts} pts. The playoff board resets now — everyone starts fresh.`;

      await supabase.rpc("post_system_message", {
        p_pool_id: pool.id,
        p_text: text,
        p_message_type: "regular_season_winner",
      });
      announced++;
    }

    return json({ success: true, competition, announced, skipped }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

// Mirrors formatLeaderboardName in seasonStore: poolie_name, else first + last
// initial, else "A player".
function formatName(p: { poolie_name: string | null; first_name: string | null; last_name: string | null }): string {
  if (p.poolie_name) return p.poolie_name;
  if (p.first_name) return `${p.first_name}${p.last_name ? ` ${p.last_name.charAt(0)}.` : ""}`;
  return "A player";
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
