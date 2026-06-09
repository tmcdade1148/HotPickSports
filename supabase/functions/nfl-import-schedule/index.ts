import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
  { auth: { persistSession: false } }
);

const WEEK_TO_ESPN: Record<number, { seasonType: number; espnWeek: number; phase: string }> = {
  19: { seasonType: 3, espnWeek: 1, phase: "WILDCARD" },
  20: { seasonType: 3, espnWeek: 2, phase: "DIVISIONAL" },
  21: { seasonType: 3, espnWeek: 3, phase: "CONFERENCE" },
  22: { seasonType: 3, espnWeek: 5, phase: "SUPERBOWL" },
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

    // Week: explicit param wins; otherwise derive from the clock so the cron
    // (which passes no week) preps the right week. See deriveWeek().
    week = Number(body.week) || deriveWeek(cfg);
    if (!week) return json({ success: true, reason: "no_active_week" }, 200);

    const seasonYear = Number(cfg.season_year ?? 2026);

    let seasonType: number, espnWeek: number, phase: string;
    if (week <= 18) { seasonType = 2; espnWeek = week; phase = "REGULAR"; }
    else if (WEEK_TO_ESPN[week]) { ({ seasonType, espnWeek, phase } = WEEK_TO_ESPN[week]); }
    else return json({ error: `Invalid week: ${week}` }, 400);

    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=${seasonType}&week=${espnWeek}`;
    const espnRes = await fetch(espnUrl);
    if (!espnRes.ok) throw new Error(`ESPN API error ${espnRes.status}`);
    const espnData = await espnRes.json();
    const events = espnData.events ?? [];

    if (events.length === 0) {
      await markReadiness(competition, week, { games_status: "ok", games_count: 0, games_at: new Date().toISOString() });
      return json({ success: true, competition, season_year: seasonYear, week, imported: 0, warning: "No games found" }, 200);
    }

    const cleanRecord = (r: string | null) => {
      if (!r) return null;
      const parts = r.split("-");
      return parts.length === 3 && parts[2] === "0" ? `${parts[0]}-${parts[1]}` : r;
    };

    const rows = events.map((event: any) => {
      const comp = event.competitions[0];
      const homeTeam = comp.competitors.find((c: any) => c.homeAway === "home");
      const awayTeam = comp.competitors.find((c: any) => c.homeAway === "away");
      const odds = comp.odds?.[0];
      const espnStatus = comp.status?.type?.name ?? "";
      let status = "SCHEDULED";
      if (espnStatus.includes("FINAL")) status = "FINAL";
      else if (espnStatus.includes("PROGRESS") || espnStatus === "IN") status = "IN_PROGRESS";
      const rank = week === 22 ? 16 : null;
      return {
        game_id: event.id, competition, season_year: seasonYear, week, phase,
        home_team: homeTeam.team.abbreviation, away_team: awayTeam.team.abbreviation,
        kickoff_at: event.date, status,
        home_score: homeTeam.score ? parseInt(homeTeam.score, 10) : null,
        away_score: awayTeam.score ? parseInt(awayTeam.score, 10) : null,
        home_record: cleanRecord(homeTeam.records?.[0]?.summary ?? null),
        away_record: cleanRecord(awayTeam.records?.[0]?.summary ?? null),
        spread: odds?.details ? parseFloat(odds.details) : null,
        home_moneyline: odds?.homeTeamOdds?.moneyLine ? parseInt(odds.homeTeamOdds.moneyLine, 10) : null,
        away_moneyline: odds?.awayTeamOdds?.moneyLine ? parseInt(odds.awayTeamOdds.moneyLine, 10) : null,
        rank, frozen_rank: rank, is_finalized: false,
      };
    });

    const { data: existing } = await supabase
      .from("season_games").select("game_id")
      .eq("competition", competition).eq("season_year", seasonYear).eq("week", week);
    if (existing && existing.length > 0) {
      const newIds = rows.map((r: any) => r.game_id);
      const toDelete = existing.filter((g) => !newIds.includes(g.game_id)).map((g) => g.game_id);
      if (toDelete.length > 0) {
        await supabase.from("season_games").delete()
          .eq("competition", competition).eq("season_year", seasonYear).eq("week", week).in("game_id", toDelete);
      }
    }

    const { error } = await supabase.from("season_games").upsert(rows, { onConflict: "game_id" });
    if (error) {
      await markReadiness(competition, week, { games_status: "failed", games_at: new Date().toISOString() });
      return json({ error: error.message }, 500);
    }

    // §5b — games loaded OK.
    await markReadiness(competition, week, { games_status: "ok", games_count: rows.length, games_at: new Date().toISOString() });

    console.log(`[nfl-import-schedule] Imported ${rows.length} games`);

    // Ranking is intentionally NOT done here. frozen_rank is set by
    // nfl-rank-games AFTER nfl-fetch-odds runs (REFERENCE.md §7), so ranks are
    // computed from the Odds-API numbers — not ESPN's import-time scoreboard
    // odds. Freezing inline at import would lock ranks on the weaker source and,
    // via Hard Rule #6 (immutable frozen_rank), make the fetch-odds -> rank-games
    // steps inert. The Tuesday cron (odds 10:00, rank 10:15) and
    // nfl-weekly-transition both run rank after odds.

    return json({ success: true, competition, season_year: seasonYear, week, phase, imported: rows.length }, 200);
  } catch (err) {
    if (week) await markReadiness(competition, week, { games_status: "failed", games_at: new Date().toISOString() });
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Derive which week to prep when the caller (cron) passes none. Explicit week
// always wins upstream. After a week wraps up (settling/complete) the NEXT week
// is what needs prepping for admin_advance_week's gate; otherwise it's the
// current week (covers the Week-1 initial open while week_state is idle).
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
// readiness write never breaks the prep step itself. Partial column set; sibling
// columns (odds_*, ranks_*) are preserved on conflict.
async function markReadiness(competition: string, week: number, fields: Record<string, unknown>) {
  try {
    await supabase.from("week_readiness").upsert(
      { competition, week_number: week, updated_at: new Date().toISOString(), ...fields },
      { onConflict: "competition,week_number" },
    );
  } catch (_e) { /* best-effort */ }
}
