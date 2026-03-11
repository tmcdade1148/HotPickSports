import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const WEEK_TO_ESPN: Record<number, { seasonType: number; espnWeek: number; phase: string }> = {
  19: { seasonType: 3, espnWeek: 1, phase: "WILDCARD" },
  20: { seasonType: 3, espnWeek: 2, phase: "DIVISIONAL" },
  21: { seasonType: 3, espnWeek: 3, phase: "CONFERENCE" },
  22: { seasonType: 3, espnWeek: 5, phase: "SUPERBOWL" },
};

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const competition = body.competition ?? "nfl_2026";
    const week = Number(body.week);
    if (!week) return json({ error: "Missing week parameter" }, 400);

    const { data: configRows } = await supabase
      .from("competition_config").select("key, value").eq("competition", competition);
    const cfg = Object.fromEntries((configRows ?? []).map((r) => [r.key, r.value]));
    if (!cfg.is_active) return json({ success: true, reason: "competition_inactive" }, 200);
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
        home_score: homeTeam.score ? parseInt(homeTeam.score) : null,
        away_score: awayTeam.score ? parseInt(awayTeam.score) : null,
        home_record: cleanRecord(homeTeam.records?.[0]?.summary ?? null),
        away_record: cleanRecord(awayTeam.records?.[0]?.summary ?? null),
        spread: odds?.details ? parseFloat(odds.details) : null,
        home_moneyline: odds?.homeTeamOdds?.moneyLine ? parseInt(odds.homeTeamOdds.moneyLine) : null,
        away_moneyline: odds?.awayTeamOdds?.moneyLine ? parseInt(odds.awayTeamOdds.moneyLine) : null,
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
    if (error) return json({ error: error.message }, 500);

    console.log(`[nfl-import-schedule] Imported ${rows.length} games`);

    if (week !== 22) {
      const rankRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/nfl-rank-games`, {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ competition, week }),
      });
      const rankData = await rankRes.json().catch(() => ({}));
      console.log(`[nfl-import-schedule] Ranked ${rankData.updated ?? 0} games`);
    }

    return json({ success: true, competition, season_year: seasonYear, week, phase, imported: rows.length }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
