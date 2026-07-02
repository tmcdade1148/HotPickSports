import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
  { auth: { persistSession: false } }
);

const TEAM_MAP: Record<string, string[]> = {
  ARI:["Arizona Cardinals","Cardinals"],ATL:["Atlanta Falcons","Falcons"],
  BAL:["Baltimore Ravens","Ravens"],BUF:["Buffalo Bills","Bills"],
  CAR:["Carolina Panthers","Panthers"],CHI:["Chicago Bears","Bears"],
  CIN:["Cincinnati Bengals","Bengals"],CLE:["Cleveland Browns","Browns"],
  DAL:["Dallas Cowboys","Cowboys"],DEN:["Denver Broncos","Broncos"],
  DET:["Detroit Lions","Lions"],GB:["Green Bay Packers","Packers"],
  HOU:["Houston Texans","Texans"],IND:["Indianapolis Colts","Colts"],
  JAX:["Jacksonville Jaguars","Jaguars"],KC:["Kansas City Chiefs","Chiefs"],
  LAC:["Los Angeles Chargers","Chargers"],LAR:["Los Angeles Rams","Rams"],
  LV:["Las Vegas Raiders","Raiders"],MIA:["Miami Dolphins","Dolphins"],
  MIN:["Minnesota Vikings","Vikings"],NE:["New England Patriots","Patriots"],
  NO:["New Orleans Saints","Saints"],NYG:["New York Giants","Giants"],
  NYJ:["New York Jets","Jets"],PHI:["Philadelphia Eagles","Eagles"],
  PIT:["Pittsburgh Steelers","Steelers"],SEA:["Seattle Seahawks","Seahawks"],
  SF:["San Francisco 49ers","49ers"],TB:["Tampa Bay Buccaneers","Buccaneers"],
  TEN:["Tennessee Titans","Titans"],WAS:["Washington Commanders","Commanders"],
  WSH:["Washington Commanders","Commanders"],
};

Deno.serve(async (req) => {
  // Cron auth gate (verify_jwt=false): require the dedicated cron shared secret.
  // CRON_SHARED_SECRET (Edge Secret) is compared to the x-cron-secret header that
  // pg_cron sends (value from Vault by reference). Decoupled from SB_SECRET_KEY.
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  // Hoisted so the catch block can record a readiness failure (§5b).
  let competition = "nfl_2026";
  let week = 0;
  try {
    const body = await req.json().catch(() => ({}));
    competition = body.competition ?? "nfl_2026";

    const { data: configRows } = await supabase
      .from("competition_config").select("key, value").eq("competition", competition);
    const cfg = Object.fromEntries((configRows ?? []).map((r) => [r.key, r.value]));
    if (!cfg.is_active) return json({ success: true, reason: "competition_inactive" }, 200);

    // Week: explicit param wins; otherwise derive from the clock (cron passes none).
    week = Number(body.week) || deriveWeek(cfg);
    if (!week) return json({ success: true, reason: "no_active_week" }, 200);

    const seasonYear = Number(cfg.season_year ?? 2026);

    // Preseason isolation: espn_season_type is a preseason-only config key ('1' =>
    // preseason). Unlike the two ESPN-driven functions, this one reads from the
    // Odds API, whose single `americanfootball_nfl` sport key already covers
    // preseason games — there is no seasontype parameter to pin. So the branch
    // reads the key for parity/observability and the fetch URL is UNCHANGED. Absent
    // (every regular competition, incl. nfl_2026) => isPreseason=false, same result.
    const espnSeasonType = String(cfg.espn_season_type ?? "").replace(/^"|"$/g, "");
    const isPreseason = espnSeasonType === "1";

    const { data: games, error: gamesError } = await supabase
      .from("season_games")
      .select("game_id, home_team, away_team, spread, home_moneyline, away_moneyline")
      .eq("competition", competition).eq("season_year", seasonYear).eq("week", week);

    if (gamesError || !games || games.length === 0) {
      await markReadiness(competition, week, { odds_status: "failed", odds_error: "No games for week (run import-schedule first)", odds_at: new Date().toISOString() });
      return json({ error: "No games found", competition, season_year: seasonYear, week }, 404);
    }

    const oddsApiKey = Deno.env.get("ODDS_API_KEY") ?? "";
    if (!oddsApiKey) {
      await markReadiness(competition, week, { odds_status: "failed", odds_error: "Missing ODDS_API_KEY", odds_expected: games.length, odds_at: new Date().toISOString() });
      return json({ error: "Missing ODDS_API_KEY" }, 500);
    }

    const oddsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${oddsApiKey}&regions=us&markets=spreads,h2h&oddsFormat=american`
    );
    if (!oddsRes.ok) throw new Error(`Odds API error ${oddsRes.status}`);
    const oddsData = await oddsRes.json();

    let updated = 0, skipped = 0, preserved = 0;
    const errors: string[] = [];

    for (const game of games) {
      const homeNames = TEAM_MAP[game.home_team] ?? [game.home_team];
      const awayNames = TEAM_MAP[game.away_team] ?? [game.away_team];

      const oddsGame = oddsData.find((og: any) => {
        const hm = homeNames.some((n) => og.home_team?.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(og.home_team?.toLowerCase()));
        const am = awayNames.some((n) => og.away_team?.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(og.away_team?.toLowerCase()));
        return hm && am;
      });

      if (!oddsGame) {
        if (game.spread !== null || game.home_moneyline !== null || game.away_moneyline !== null) preserved++;
        else errors.push(`No odds: ${game.away_team}@${game.home_team}`);
        continue;
      }

      const bookmaker = oddsGame.bookmakers?.[0];
      if (!bookmaker) { skipped++; continue; }

      const spreadsMarket = bookmaker.markets?.find((m: any) => m.key === "spreads");
      const h2hMarket = bookmaker.markets?.find((m: any) => m.key === "h2h");
      const homeSpread = spreadsMarket?.outcomes?.find((o: any) => homeNames.some((n) => o.name?.toLowerCase().includes(n.toLowerCase())))?.point ?? null;
      const homeML = h2hMarket?.outcomes?.find((o: any) => homeNames.some((n) => o.name?.toLowerCase().includes(n.toLowerCase())))?.price ?? null;
      const awayML = h2hMarket?.outcomes?.find((o: any) => awayNames.some((n) => o.name?.toLowerCase().includes(n.toLowerCase())))?.price ?? null;

      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (homeSpread !== null) updateData.spread = homeSpread;
      if (homeML !== null) updateData.home_moneyline = homeML;
      if (awayML !== null) updateData.away_moneyline = awayML;

      if (!("spread" in updateData) && !("home_moneyline" in updateData) && !("away_moneyline" in updateData)) { skipped++; continue; }

      const { error: updateError } = await supabase.from("season_games").update(updateData).eq("game_id", game.game_id);
      if (updateError) errors.push(`Update failed: ${game.game_id}`);
      else updated++;
    }

    // §5b — odds present = games updated this run plus those whose existing odds
    // were preserved. The gate (§5c) compares odds_count against odds_expected.
    const oddsPresent = updated + preserved;
    await markReadiness(competition, week, {
      odds_status: "ok",
      odds_count: oddsPresent,
      odds_expected: games.length,
      odds_error: oddsPresent < games.length ? `${games.length - oddsPresent} game(s) missing odds` : null,
      odds_at: new Date().toISOString(),
    });

    return json({ success: true, competition, season_year: seasonYear, week, preseason: isPreseason, updated, skipped, preserved, total: games.length, errors,
      apiUsage: { used: oddsRes.headers.get("x-requests-used"), remaining: oddsRes.headers.get("x-requests-remaining") } }, 200);
  } catch (err) {
    if (week) await markReadiness(competition, week, { odds_status: "failed", odds_error: String(err), odds_at: new Date().toISOString() });
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Derive which week to prep when the caller (cron) passes none. After a week
// wraps up (settling/complete) prep the NEXT week (for the advance gate);
// otherwise the current week (covers the Week-1 initial open while idle).
function deriveWeek(cfg: Record<string, any>): number {
  const strip = (v: any) => String(v ?? "").replace(/^"|"$/g, "");
  // Auto-prep only runs inside the weekly cycle — never off-season / pre-season,
  // which would prematurely import and FREEZE ranks on stale odds (Hard Rule #6).
  const phase = strip(cfg.current_phase);
  if (!["REGULAR", "PLAYOFFS", "SUPERBOWL"].includes(phase)) return 0;
  const current = Number(strip(cfg.current_week)) || 0;
  const ws = strip(cfg.week_state);
  if (!current) return 0;
  return (ws === "settling" || ws === "complete") ? current + 1 : current;
}

// §5b — best-effort upsert of this step's slice of week_readiness. Wrapped so a
// readiness write never breaks the prep step. Partial column set; sibling columns
// (games_*, ranks_*) are preserved on conflict.
async function markReadiness(competition: string, week: number, fields: Record<string, unknown>) {
  try {
    await supabase.from("week_readiness").upsert(
      { competition, week_number: week, updated_at: new Date().toISOString(), ...fields },
      { onConflict: "competition,week_number" },
    );
  } catch (_e) { /* best-effort */ }
}
