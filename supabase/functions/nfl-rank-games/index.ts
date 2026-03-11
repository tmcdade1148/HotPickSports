import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

function rawProb(odds: number): number {
  if (odds === 0) return 0.5;
  if (odds > 0) return 100.0 / (odds + 100.0);
  const abs = Math.abs(odds);
  return abs / (abs + 100.0);
}
function deVig(homeML: number, awayML: number): number {
  const ph = rawProb(homeML), pa = rawProb(awayML);
  const vig = ph + pa;
  return vig <= 0 ? 0.5 : ph / vig;
}
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const y = 1.0 - ((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return sign * y;
}
function normalCDF(x: number): number { return 0.5*(1+erf(x/Math.SQRT2)); }
function probFromSpread(spread: number): number { return 1-normalCDF(spread/13.86); }
function clamp01(x: number): number { return Math.max(0,Math.min(1,x)); }
function homeWinProb(g: any): number {
  if (g.home_moneyline !== null && g.away_moneyline !== null) return clamp01(deVig(g.home_moneyline, g.away_moneyline));
  if (g.spread !== null) return clamp01(probFromSpread(g.spread));
  return 0.5;
}
function rankGames(rows: any[]) {
  const scored = rows.map((g) => {
    const pHome = homeWinProb(g);
    const competitiveness = 1.0 - 2.0 * Math.abs(pHome - 0.5);
    return { game_id: g.game_id, kickoff: new Date(g.kickoff_at), pHome, competitiveness };
  });
  scored.sort((a, b) => {
    if (a.competitiveness !== b.competitiveness) return b.competitiveness - a.competitiveness;
    if (Math.abs(a.pHome-0.5) !== Math.abs(b.pHome-0.5)) return Math.abs(a.pHome-0.5)-Math.abs(b.pHome-0.5);
    return a.kickoff.getTime() - b.kickoff.getTime();
  });
  return scored.map((g, idx) => ({ game_id: g.game_id, rank: scored.length - idx }));
}
function applyPlayoffEscalation(ranked: any[], week: number) {
  if (week === 22) return ranked.map((g) => ({ ...g, rank: 16 }));
  const offsets: Record<number,number> = { 19:2, 20:5, 21:8 };
  const offset = offsets[week] ?? 0;
  return ranked.map((g) => ({ ...g, rank: g.rank + offset }));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const body = await req.json().catch(() => ({}));
    const competition = body.competition ?? "nfl_2026";
    const week = Number(body.week);
    const force = Boolean(body.force);
    if (!week) return json({ error: "Missing week parameter" }, 400);

    const { data: configRows } = await supabase
      .from("competition_config").select("key, value").eq("competition", competition);
    const cfg = Object.fromEntries((configRows ?? []).map((r) => [r.key, r.value]));
    const seasonYear = Number(cfg.season_year ?? 2026);

    const { data: games, error: gamesError } = await supabase
      .from("season_games")
      .select("game_id, kickoff_at, frozen_rank, home_moneyline, away_moneyline, spread")
      .eq("competition", competition).eq("season_year", seasonYear).eq("week", week);

    if (gamesError) return json({ error: gamesError.message }, 500);
    if (!games || games.length === 0) return json({ competition, season_year: seasonYear, week, updated: 0, message: "No games found" }, 200);

    const alreadyFrozen = games.filter((g) => g.frozen_rank !== null);
    if (alreadyFrozen.length > 0 && !force) {
      return json({ competition, season_year: seasonYear, week, updated: 0, frozen: alreadyFrozen.length, message: "Ranks already frozen. Use force=true to re-rank." }, 200);
    }

    const baseRanked = rankGames(games);
    const ranked = applyPlayoffEscalation(baseRanked, week);
    const errors: string[] = [];

    for (const r of ranked) {
      const { error } = await supabase.from("season_games")
        .update({ rank: r.rank, frozen_rank: r.rank })
        .eq("game_id", r.game_id).eq("competition", competition).eq("season_year", seasonYear);
      if (error) errors.push(`${r.game_id}: ${error.message}`);
    }

    return json({ success: true, competition, season_year: seasonYear, week, updated: ranked.length, frozen: ranked.length, errors, rankings: ranked }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
