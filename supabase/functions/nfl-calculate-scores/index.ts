import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const BASE_WIN_POINTS = 1;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const competition = body.competition ?? "nfl_2026";
    const autoDetect = body.auto_detect ?? false;

    const { data: configRows } = await supabase
      .from("competition_config").select("key, value").eq("competition", competition);
    const cfg = Object.fromEntries((configRows ?? []).map((r) => [r.key, r.value]));

    if (!cfg.is_active) return json({ success: true, reason: "competition_inactive" }, 200);
    if (cfg.scoring_locked) return json({ success: true, reason: "scoring_locked" }, 200);

    const seasonYear = Number(cfg.season_year ?? 2026);

    if (autoDetect || !body.week) {
      const { data: finalGames, error: detectError } = await supabase
        .from("season_games").select("week")
        .eq("competition", competition).eq("season_year", seasonYear)
        .ilike("status", "%FINAL%").order("week", { ascending: false });

      if (detectError) return json({ success: false, error: detectError.message }, 500);

      const weeks = [...new Set((finalGames ?? []).map((g) => g.week))];
      const results = [];
      for (const week of weeks) {
        const result = await scoreWeek(competition, seasonYear, week);
        results.push({ week, ...result });
      }
      return json({ success: true, auto_detect: true, weeks_scored: results.length, results }, 200);
    }

    const week = Number(body.week);
    if (!week) return json({ error: "week required or use auto_detect: true" }, 400);
    const result = await scoreWeek(competition, seasonYear, week);
    return json({ success: true, competition, season_year: seasonYear, week, ...result }, 200);

  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

async function scoreWeek(competition: string, seasonYear: number, week: number) {
  let phase = "REGULAR";
  if (week === 19) phase = "WILDCARD";
  else if (week === 20) phase = "DIVISIONAL";
  else if (week === 21) phase = "CONFERENCE";
  else if (week === 22) phase = "SUPERBOWL";

  const { data: games, error: gamesError } = await supabase
    .from("season_games")
    .select("game_id, home_team, away_team, rank, frozen_rank, winner_team")
    .eq("competition", competition).eq("season_year", seasonYear).eq("week", week)
    .ilike("status", "%FINAL%");

  if (gamesError) return { users_scored: 0, final_games: 0, error: gamesError.message };
  if (!games || games.length === 0) return { users_scored: 0, final_games: 0 };

  const gameMap = new Map(games.map((g) => [g.game_id, { ...g, effectiveRank: g.frozen_rank ?? g.rank ?? 1 }]));

  const { data: picks, error: picksError } = await supabase
    .from("season_picks")
    .select("user_id, game_id, picked_team, is_hotpick, power_up")
    .eq("competition", competition).eq("season_year", seasonYear).eq("week", week);

  if (picksError) return { users_scored: 0, final_games: games.length, error: picksError.message };

  const aggByUser = new Map<string, any>();
  // Track per-pick results to write back to season_picks
  const pickResults: { user_id: string; game_id: string; is_correct: boolean; points: number }[] = [];

  for (const p of picks ?? []) {
    const game = gameMap.get(p.game_id);
    if (!game || !game.winner_team) continue;

    const isWin = p.picked_team === game.winner_team;
    const isHotpick = !!p.is_hotpick;
    const isDoubleDown = p.power_up === "double_down";
    const rank = game.effectiveRank;

    let agg = aggByUser.get(p.user_id) ?? {
      user_id: p.user_id, week_points: 0, correct_picks: 0,
      total_picks: 0, is_hotpick_correct: null, hotpick_rank: null,
      double_down_used: false, double_down_delta: 0,
    };

    agg.total_picks += 1;

    let pickPoints = 0;
    if (isHotpick) {
      agg.hotpick_rank = rank;
      if (isWin) {
        pickPoints = isDoubleDown ? rank * 2 : rank;
        agg.week_points += pickPoints;
        agg.correct_picks += 1;
        agg.is_hotpick_correct = true;
        if (isDoubleDown) { agg.double_down_used = true; agg.double_down_delta = rank; }
      } else {
        pickPoints = -rank;
        agg.week_points -= rank;
        if (agg.is_hotpick_correct === null) agg.is_hotpick_correct = false;
      }
    } else if (isWin) {
      pickPoints = BASE_WIN_POINTS;
      agg.week_points += BASE_WIN_POINTS;
      agg.correct_picks += 1;
    }

    pickResults.push({ user_id: p.user_id, game_id: p.game_id, is_correct: isWin, points: pickPoints });
    aggByUser.set(p.user_id, agg);
  }

  // Write per-pick results (points, is_correct) back to season_picks
  if (pickResults.length > 0) {
    for (const pr of pickResults) {
      await supabase.from("season_picks").update({ is_correct: pr.is_correct, points: pr.points })
        .eq("user_id", pr.user_id).eq("game_id", pr.game_id).eq("competition", competition);
    }
  }

  const userAggs = Array.from(aggByUser.values());

  // Write 0-rows for users who submitted picks this week but none match any final game yet.
  // Without this, their season_user_totals row isn't created until one of their picked games
  // becomes final — causing the pts-earned widget on the home screen to show "—" (null)
  // for the entire time before their first game settles.
  const scoredUserIds = new Set(userAggs.map((u) => u.user_id));
  const picksUserIds = new Set((picks ?? []).map((p) => p.user_id));
  for (const uid of picksUserIds) {
    if (!scoredUserIds.has(uid)) {
      userAggs.push({
        user_id: uid, week_points: 0, correct_picks: 0,
        total_picks: 0, is_hotpick_correct: null, hotpick_rank: null,
        double_down_used: false, double_down_delta: 0,
      });
    }
  }

  if (userAggs.length === 0) return { users_scored: 0, final_games: games.length };

  const userIds = userAggs.map((u) => u.user_id);
  const { data: existingRows } = await supabase
    .from("season_user_totals").select("user_id, mulligan_used")
    .eq("competition", competition).eq("season_year", seasonYear).eq("week", week)
    .in("user_id", userIds);

  const mulliganMap = new Map((existingRows ?? []).map((r) => [r.user_id, r.mulligan_used ?? false]));

  const { error: upsertError } = await supabase
    .from("season_user_totals")
    .upsert(
      userAggs.map((u) => ({
        user_id: u.user_id, competition, season_year: seasonYear, week, phase,
        week_points: u.week_points,
        playoff_points: week >= 19 ? u.week_points : 0,
        correct_picks: u.correct_picks, total_picks: u.total_picks,
        is_hotpick_correct: u.is_hotpick_correct,
        hotpick_rank: u.hotpick_rank, is_no_show: false,
        double_down_used: u.double_down_used, double_down_delta: u.double_down_delta,
        mulligan_used: mulliganMap.get(u.user_id) ?? false,
        scored_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,competition,season_year,week" }
    );

  if (upsertError) return { users_scored: 0, final_games: games.length, error: upsertError.message };
  return { users_scored: scoredUserIds.size, final_games: games.length };
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
