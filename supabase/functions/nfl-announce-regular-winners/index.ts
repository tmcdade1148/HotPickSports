import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Posts a "regular season winner" announcement to each pool's Chirps feed when
// the regular season closes (REGULAR_COMPLETE), before the playoff scoreboard
// resets. The per-pool winner comes from compute_pool_standings — the SAME
// canonical ranking the Ladder, the crown trigger, and the podium hardware read,
// so the crown can never disagree with them on a tie. Champion = row(s) with
// title_rank = 1 (points, then HotPick points); a shared title_rank 1 → co-champions.
// Idempotent: a pool that already has a 'regular_season_winner' message is skipped.
//
// NOTE: Production fires this automatically via the
// announce_regular_winners_on_phase DB trigger when current_phase flips to
// REGULAR_COMPLETE. This function is kept as a MANUAL backfill / re-run tool and
// MUST stay in lockstep with that trigger (both read compute_pool_standings).

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
  { auth: { persistSession: false } }
);

interface Standing {
  user_id: string;
  total_points: number;
  hotpick_points: number;
  standing_rank: number;
  title_rank: number;
  is_tied: boolean;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const competition = body.competition ?? "nfl_2026";

    const { data: pools } = await supabase
      .from("pools")
      .select("id")
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

      // Canonical standings (service-role can call the internal keystone).
      const { data: standings, error } = await supabase.rpc("compute_pool_standings", {
        p_pool_id: pool.id,
      });
      if (error || !standings || standings.length === 0) { skipped++; continue; }

      const rows = standings as Standing[];
      const champions = rows.filter((s) => s.title_rank === 1);
      if (champions.length === 0) { skipped++; continue; }

      // Title decided on HotPick points: points were tied at the top AND the
      // HotPick-points rung left a single champion.
      const topShared = rows.filter((s) => s.standing_rank === 1).length > 1;
      const decidedByHotpick = topShared && champions.length === 1;
      const winnerPts = champions[0].total_points;

      // Names for the champion(s).
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, poolie_name, first_name, last_name")
        .in("id", champions.map((c) => c.user_id));
      const nameById = new Map((profiles ?? []).map((p) => [p.id, formatName(p)]));
      const names = champions
        .map((c) => nameById.get(c.user_id) ?? "A player")
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        .join(" & ");

      const text = champions.length > 1
        ? `\u{1F3C6} Regular season's in the books! ${names} share the crown as co-champions ` +
          `with ${winnerPts} pts each. The playoff board resets now — everyone starts fresh.`
        : `\u{1F3C6} Regular season's in the books! ${names} takes the crown with ${winnerPts} pts.` +
          (decidedByHotpick ? ` Level on points — the title was decided on HotPick points.` : ``) +
          ` The playoff board resets now — everyone starts fresh.`;

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
