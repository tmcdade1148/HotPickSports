import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const PLAYOFF_WEEK_MAP: Record<number, number> = { 1:19, 2:20, 3:21, 4:21, 5:22 };

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const competition = body.competition ?? "nfl_2026";

    const { data: configRows } = await supabase
      .from("competition_config").select("key, value").eq("competition", competition);
    const cfg = Object.fromEntries((configRows ?? []).map((r) => [r.key, r.value]));

    if (!cfg.is_active) return json({ success: true, reason: "competition_inactive", updated: 0 }, 200);
    if (cfg.scoring_locked) return json({ success: true, reason: "scoring_locked", updated: 0 }, 200);

    const seasonYear = Number(cfg.season_year ?? 2026);

    const espnRes = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
    if (!espnRes.ok) throw new Error(`ESPN API error: ${espnRes.status}`);

    const espnData = await espnRes.json();
    const seasonType = espnData.season?.type ?? 2;
    const isPlayoffs = seasonType === 3;

    let updatedCount = 0, skippedCount = 0;
    const updates: unknown[] = [];

    for (const event of espnData.events ?? []) {
      try {
        const comp = event.competitions?.[0];
        if (!comp) { skippedCount++; continue; }

        const homeTeam = comp.competitors?.find((c: any) => c.homeAway === "home");
        const awayTeam = comp.competitors?.find((c: any) => c.homeAway === "away");
        if (!homeTeam || !awayTeam) { skippedCount++; continue; }

        const homeAbbr = homeTeam.team?.abbreviation;
        const awayAbbr = awayTeam.team?.abbreviation;
        if (!homeAbbr || !awayAbbr) { skippedCount++; continue; }

        const espnState = event.status?.type?.state?.toLowerCase();
        let status = "SCHEDULED";
        if (espnState === "in") status = "IN_PROGRESS";
        else if (espnState === "post") status = "FINAL";

        const homeScore = parseInt(homeTeam.score ?? "0");
        const awayScore = parseInt(awayTeam.score ?? "0");
        const currentPeriod = event.status?.period ?? null;
        const gameClock = event.status?.displayClock ?? null;

        const homeLS = homeTeam.linescores ?? [];
        const awayLS = awayTeam.linescores ?? [];
        const getScore = (ls: any[], period: number) => {
          const entry = ls.find((x) => x.period === period);
          return entry ? parseInt(entry.value) || 0 : null;
        };

        let winnerTeam = null;
        if (status === "FINAL") {
          if (homeScore > awayScore) winnerTeam = homeAbbr;
          else if (awayScore > homeScore) winnerTeam = awayAbbr;
        }

        const espnWeek = event.week?.number ?? 1;
        const dbWeek = isPlayoffs ? (PLAYOFF_WEEK_MAP[espnWeek] ?? 18 + espnWeek) : espnWeek;

        const updateData: Record<string, unknown> = {
          status, home_score: homeScore, away_score: awayScore,
          winner_team: winnerTeam, current_period: currentPeriod,
          game_clock: gameClock, updated_at: new Date().toISOString(),
        };

        const q1h = getScore(homeLS,1), q1a = getScore(awayLS,1);
        const q2h = getScore(homeLS,2), q2a = getScore(awayLS,2);
        const q3h = getScore(homeLS,3), q3a = getScore(awayLS,3);
        if (q1h !== null) updateData.q1_home_score = q1h;
        if (q1a !== null) updateData.q1_away_score = q1a;
        if (q2h !== null) updateData.q2_home_score = q2h;
        if (q2a !== null) updateData.q2_away_score = q2a;
        if (q3h !== null) updateData.q3_home_score = q3h;
        if (q3a !== null) updateData.q3_away_score = q3a;

        const { data, error } = await supabase
          .from("season_games")
          .update(updateData)
          .eq("competition", competition)
          .eq("season_year", seasonYear)
          .eq("week", dbWeek)
          .eq("home_team", homeAbbr)
          .eq("away_team", awayAbbr)
          .select("game_id");

        if (error) {
          console.error(`[nfl-update-scores] Error ${awayAbbr}@${homeAbbr}:`, error.message);
        } else if (data && data.length > 0) {
          updatedCount++;
          updates.push({ game: `${awayAbbr}@${homeAbbr}`, status, score: `${awayScore}-${homeScore}`, winner: winnerTeam, week: dbWeek });
        } else {
          skippedCount++;
          console.log(`[nfl-update-scores] No match: ${awayAbbr}@${homeAbbr} (${competition} ${seasonYear} Wk${dbWeek})`);
        }
      } catch (gameErr) {
        skippedCount++;
      }
    }

    return json({ success: true, updated: updatedCount, skipped: skippedCount, updates, isPlayoffs }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
