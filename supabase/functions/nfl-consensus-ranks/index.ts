// nfl-consensus-ranks
// Independent, multi-book CONSENSUS ranking for a HotPick week.
//
// Why this exists: nfl-fetch-odds writes ONE bookmaker's line (bookmakers[0])
// into season_games, and nfl-rank-games ranks from that. This function is the
// independent check: it takes the MEDIAN de-vigged win probability across every
// book the Odds API returns, ranks from that, and stores the result in an
// isolated audit row. It never touches season_games.
//
// Runs on Supabase (not the operator's laptop), so it works whether or not any
// desktop app is open. Callable by pg_cron or on demand from the console.
//
// v2: refuses to overwrite the audit row once a week is FROZEN. Previously the
// recurring job kept recomputing after the freeze, destroying the record of what
// the week was actually frozen against and making the console's comparison drift
// (a correctly-frozen week displayed large deltas against hours-newer odds).
// The freeze-time ranking is preserved permanently in rank_freeze_snapshot.

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

/* ---- math: identical to nfl-rank-games ---- */
function rawProb(o: number): number {
  if (o === 0) return 0.5;
  if (o > 0) return 100.0 / (o + 100.0);
  const a = Math.abs(o); return a / (a + 100.0);
}
function deVig(h: number, a: number): number {
  const ph = rawProb(h), pa = rawProb(a), v = ph + pa;
  return v <= 0 ? 0.5 : ph / v;
}
function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const t = 1.0/(1.0+p*Math.abs(x));
  return s*(1.0-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x));
}
function normalCDF(x: number){ return 0.5*(1+erf(x/Math.SQRT2)); }
function probFromSpread(s: number){ return 1-normalCDF(s/13.86); }
function clamp01(x: number){ return Math.max(0, Math.min(1, x)); }
function median(xs: number[]): number {
  const s = xs.slice().sort((a,b)=>a-b); const n = s.length;
  return n===0 ? 0.5 : (n%2 ? s[(n-1)/2] : (s[n/2-1]+s[n/2])/2);
}

function matches(names: string[], apiName: string): boolean {
  const a = String(apiName||"").toLowerCase();
  return names.some(n => a.includes(n.toLowerCase()) || n.toLowerCase().includes(a));
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const competition: string = body.competition ?? "nfl_2026";
    const force = Boolean(body.force);

    const { data: configRows } = await supabase
      .from("competition_config").select("key, value").eq("competition", competition);
    const cfg = Object.fromEntries((configRows ?? []).map((r) => [r.key, r.value]));
    const strip = (v: any) => String(v ?? "").replace(/^"|"$/g, "");

    if (!cfg.is_active) return json({ success: true, reason: "competition_inactive", competition }, 200);

    const seasonYear = Number(strip(cfg.season_year) || 2026);
    const week = Number(body.week) || Number(strip(cfg.current_week)) || 0;
    if (!week) return json({ success: true, reason: "no_week", competition }, 200);

    const { data: allGames, error: gErr } = await supabase
      .from("season_games")
      .select("game_id, home_team, away_team, kickoff_at, phase, rank, frozen_rank")
      .eq("competition", competition).eq("season_year", seasonYear).eq("week", week);
    if (gErr) return json({ error: gErr.message }, 500);
    if (!allGames || allGames.length === 0)
      return json({ success: false, reason: "no_games", competition, week }, 404);

    const phaseCounts: Record<string, number> = {};
    for (const g of allGames) phaseCounts[g.phase] = (phaseCounts[g.phase] ?? 0) + 1;
    const phase = body.phase
      ?? Object.entries(phaseCounts).sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0]))[0][0];
    const games = allGames.filter(g => g.phase === phase);

    // ---- FROZEN GUARD ----
    // Once the week is frozen the consensus row is historical evidence of what it
    // was frozen against. Recomputing it destroys that and makes the console
    // compare frozen ranks to newer odds. Refuse unless explicitly forced.
    const frozenCount = games.filter(g => g.frozen_rank !== null).length;
    if (frozenCount > 0 && !force) {
      return json({
        success: true, reason: "week_frozen", competition, week, phase,
        frozen: frozenCount, of: games.length,
        message: "Week is frozen; consensus left untouched so it still reflects the freeze. Use force=true to recompute for analysis (this overwrites the audit row; the freeze-time ranking is preserved in rank_freeze_snapshot).",
      }, 200);
    }

    const oddsApiKey = Deno.env.get("ODDS_API_KEY") ?? "";
    if (!oddsApiKey) return json({ error: "Missing ODDS_API_KEY" }, 500);

    const isPreseason = strip(cfg.espn_season_type) === "1" || phase === "PRESEASON";
    const sportKey = isPreseason ? "americanfootball_nfl_preseason" : "americanfootball_nfl";

    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/`
      + `?apiKey=${oddsApiKey}&regions=us&markets=h2h,spreads&oddsFormat=american`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Odds API error ${res.status}`);
    const events = await res.json();
    if (!Array.isArray(events) || events.length === 0) {
      return json({ success: false, reason: "no_odds_published", competition, week, phase, sportKey,
        message: "Odds API returned no events for this sport key yet (preseason lines post ~2-3 days out)." }, 200);
    }

    type Scored = { game_id: string; matchup: string; p: number; comp: number; books: number;
                    source: string; kickoff: number; server: number | null };
    const scored: Scored[] = [];
    const missing: string[] = [];

    for (const g of games) {
      const homeNames = TEAM_MAP[g.home_team] ?? [g.home_team];
      const awayNames = TEAM_MAP[g.away_team] ?? [g.away_team];
      const ev = events.find((e: any) => matches(homeNames, e.home_team) && matches(awayNames, e.away_team));

      const mlProbs: number[] = [];
      const spreads: number[] = [];
      if (ev) {
        for (const bk of (ev.bookmakers ?? [])) {
          const h2h = (bk.markets ?? []).find((m: any) => m.key === "h2h");
          if (h2h) {
            const hp = (h2h.outcomes ?? []).find((o: any) => matches(homeNames, o.name))?.price;
            const ap = (h2h.outcomes ?? []).find((o: any) => matches(awayNames, o.name))?.price;
            if (typeof hp === "number" && typeof ap === "number") mlProbs.push(clamp01(deVig(hp, ap)));
          }
          const sp = (bk.markets ?? []).find((m: any) => m.key === "spreads");
          if (sp) {
            const pt = (sp.outcomes ?? []).find((o: any) => matches(homeNames, o.name))?.point;
            if (typeof pt === "number") spreads.push(pt);
          }
        }
      }

      let p: number, books: number, source: string;
      if (mlProbs.length)      { p = median(mlProbs);                          books = mlProbs.length; source = "ml"; }
      else if (spreads.length) { p = clamp01(probFromSpread(median(spreads))); books = spreads.length; source = "spread"; }
      else                     { p = 0.5; books = 0; source = "none"; missing.push(`${g.away_team}@${g.home_team}`); }

      scored.push({
        game_id: g.game_id, matchup: `${g.away_team}@${g.home_team}`,
        p, comp: 1.0 - 2.0*Math.abs(p - 0.5), books, source,
        kickoff: new Date(g.kickoff_at).getTime(),
        server: g.frozen_rank ?? g.rank ?? null,
      });
    }

    scored.sort((a,b) => {
      if (a.comp !== b.comp) return b.comp - a.comp;
      const da = Math.abs(a.p-0.5), db = Math.abs(b.p-0.5);
      if (da !== db) return da - db;
      return a.kickoff - b.kickoff;
    });
    const n = scored.length;
    const playoffOffset: Record<number, number> = { 19:2, 20:5, 21:8 };
    const offset = (phase === "PRESEASON") ? 0 : (playoffOffset[week] ?? 0);
    const ranked = scored.map((g, i) => ({
      ...g, rank: (week === 22 && phase !== "PRESEASON") ? 16 : (n - i) + offset
    }));

    const byComp = ranked.slice().sort((a,b)=> b.comp - a.comp);
    const close = new Set<string>();
    for (let i=0;i<byComp.length;i++){
      const prev = i>0 ? Math.abs(byComp[i].comp - byComp[i-1].comp) : 9;
      const next = i<byComp.length-1 ? Math.abs(byComp[i].comp - byComp[i+1].comp) : 9;
      if (Math.min(prev, next) < 0.015) close.add(byComp[i].game_id);
    }

    const distinct = new Set(ranked.map(g => g.p.toFixed(6))).size;
    const agree = ranked.filter(g => g.server != null && g.server === g.rank).length;
    const serverRanked = ranked.filter(g => g.server != null).length;

    const audit = {
      competition, season_year: seasonYear, week, phase,
      computed_at: new Date().toISOString(),
      method: "consensus_median",
      source: "nfl-consensus-ranks",
      sport_key: sportKey,
      games: ranked.length,
      matched_odds: ranked.filter(g => g.books > 0).length,
      distinct_probs: distinct,
      rows: ranked.sort((a,b)=>a.rank-b.rank).map(g => ({
        game_id: g.game_id, matchup: g.matchup, consensus_rank: g.rank,
        server_rank: g.server, p_home: Number(g.p.toFixed(4)),
        n_books: g.books, source: g.source, close: close.has(g.game_id),
      })),
    };

    const key = `${competition}_${phase}_w${week}`;
    await supabase.from("competition_config")
      .delete().eq("competition", "rank_audit").eq("key", key);
    const { error: insErr } = await supabase.from("competition_config")
      .insert({ competition: "rank_audit", key, value: audit });
    if (insErr) return json({ error: `audit write failed: ${insErr.message}` }, 500);

    return json({
      success: true, competition, season_year: seasonYear, week, phase, sportKey,
      audit_key: key, games: ranked.length, matched_odds: audit.matched_odds,
      missing_odds: missing, distinct_probs: distinct,
      agree_with_server: `${agree}/${serverRanked}`,
      apiUsage: { used: res.headers.get("x-requests-used"), remaining: res.headers.get("x-requests-remaining") },
      rankings: audit.rows.map(r => ({ rank: r.consensus_rank, matchup: r.matchup, p_home: r.p_home, books: r.n_books })),
    }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
