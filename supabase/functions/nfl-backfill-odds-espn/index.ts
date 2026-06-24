import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// nfl-backfill-odds-espn — one-off / on-demand odds backfill for PAST weeks.
//
// Why this exists: nfl-fetch-odds hits The Odds API's *live* endpoint, which
// only returns upcoming games — useless for weeks that already happened (e.g.
// the nfl_2025_sim sandbox, whose weeks 1-14 had no odds, so nfl-rank-games
// fell back to kickoff order). ESPN's CORE API retains the closing line
// (spread + moneylines + total) for completed games, free, and is already the
// data provider the app calls elsewhere. This reads those and writes them onto
// season_games so nfl-rank-games (force=true) can produce real, market-based
// competitiveness ranks instead of a Thursday-first kickoff sort.
//
// SAFETY: refuses any competition whose data_provider is "espn" (i.e. the live
// nfl_2026 season). It only writes odds onto sim/demo competitions, and only
// ever touches the spread / moneyline / over_under columns — never scores,
// ranks, picks, or frozen_rank. Re-ranking is a separate, explicit step.
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
  { auth: { persistSession: false } }
);

// ESPN core API. game_id is `sim_<espnEventId>` in sim competitions, or the bare
// ESPN id in espn-driven ones; strip the sim_ prefix to recover the event id.
function espnEventId(gameId: string): string {
  return gameId.replace(/^sim_/, "");
}

// ESPN american values arrive as strings like "-7.5" / "+7.5"; Number("+7.5")
// is NaN, so strip a leading '+'. Returns null on anything non-numeric.
function parseAmerican(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/^\+/, ""));
  return Number.isFinite(n) ? n : null;
}

// Pull the home-team spread + both moneylines + total from one ESPN odds item.
// Prefer the closing point spread (home perspective); fall back to the item's
// top-level `spread` (also home-relative in ESPN's payload).
function extractOdds(item: any): { spread: number | null; homeML: number | null; awayML: number | null; ou: number | null } {
  const homeClose = item?.homeTeamOdds?.close?.pointSpread?.american;
  const spread = parseAmerican(homeClose) ?? (typeof item?.spread === "number" ? item.spread : null);
  const homeML = typeof item?.homeTeamOdds?.moneyLine === "number" ? item.homeTeamOdds.moneyLine : null;
  const awayML = typeof item?.awayTeamOdds?.moneyLine === "number" ? item.awayTeamOdds.moneyLine : null;
  const ou = typeof item?.overUnder === "number" ? item.overUnder : null;
  return { spread, homeML, awayML, ou };
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const competition: string = body.competition;
    if (!competition) return json({ error: "competition required" }, 400);

    // Accept a single `week` or a `weeks` array.
    const weeks: number[] = Array.isArray(body.weeks)
      ? body.weeks.map((w: unknown) => Number(w)).filter((w: number) => Number.isFinite(w))
      : (Number(body.week) ? [Number(body.week)] : []);
    if (weeks.length === 0) return json({ error: "week or weeks[] required" }, 400);

    const { data: configRows } = await supabase
      .from("competition_config").select("key, value").eq("competition", competition);
    const cfg = Object.fromEntries((configRows ?? []).map((r) => [r.key, r.value]));

    // SAFETY GUARD — never write odds onto the live espn-driven season.
    const provider = String(cfg.data_provider ?? "").replace(/^"|"$/g, "");
    if (provider === "espn") {
      return json({ error: `refused: ${competition} is espn-driven (live). Backfill is for sim/demo only.` }, 403);
    }

    const seasonYear = Number(cfg.season_year ?? 2025);
    const perWeek: Record<number, unknown> = {};

    for (const week of weeks) {
      const { data: games, error: gamesErr } = await supabase
        .from("season_games")
        .select("game_id, home_team, away_team")
        .eq("competition", competition).eq("season_year", seasonYear).eq("week", week);

      if (gamesErr) { perWeek[week] = { error: gamesErr.message }; continue; }
      if (!games || games.length === 0) { perWeek[week] = { error: "no games" }; continue; }

      let updated = 0, noOdds = 0, failed = 0;
      const errors: string[] = [];

      for (const g of games) {
        const id = espnEventId(g.game_id);
        try {
          const res = await fetch(
            `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${id}/competitions/${id}/odds`
          );
          if (!res.ok) { failed++; errors.push(`${g.game_id}: espn ${res.status}`); continue; }
          const data = await res.json();
          const items: any[] = data?.items ?? [];
          // Prefer the standard ESPN BET closing line (priority 0); else first item.
          const item = items.find((it) => it?.provider?.name === "ESPN BET")
            ?? items.find((it) => it?.provider?.priority === 0)
            ?? items[0];
          if (!item) { noOdds++; continue; }

          const { spread, homeML, awayML, ou } = extractOdds(item);
          const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (spread !== null) update.spread = spread;
          if (homeML !== null) update.home_moneyline = homeML;
          if (awayML !== null) update.away_moneyline = awayML;
          if (ou !== null) update.over_under = ou;

          if (!("spread" in update) && !("home_moneyline" in update) && !("away_moneyline" in update)) {
            noOdds++; continue;
          }

          // .select() so an RLS-filtered / no-op write surfaces instead of
          // silently "succeeding" with zero rows.
          const { data: rows, error: updErr } = await supabase
            .from("season_games").update(update)
            .eq("game_id", g.game_id).eq("competition", competition).eq("season_year", seasonYear)
            .select("game_id");
          if (updErr) { failed++; errors.push(`${g.game_id}: ${updErr.message}`); }
          else if (!rows || rows.length === 0) { failed++; errors.push(`${g.game_id}: 0 rows updated`); }
          else updated++;
        } catch (e) {
          failed++; errors.push(`${g.game_id}: ${String(e)}`);
        }
      }

      perWeek[week] = { total: games.length, updated, noOdds, failed, errors };
    }

    return json({ success: true, competition, season_year: seasonYear, weeks: perWeek }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
