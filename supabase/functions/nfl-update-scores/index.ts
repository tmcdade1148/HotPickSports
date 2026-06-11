import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapPlayoffWeek } from "../_shared/scoring.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
  { auth: { persistSession: false } }
);

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

        const homeScore = parseInt(homeTeam.score ?? "0", 10);
        const awayScore = parseInt(awayTeam.score ?? "0", 10);
        const currentPeriod = event.status?.period ?? null;
        const gameClock = event.status?.displayClock ?? null;

        const homeLS = homeTeam.linescores ?? [];
        const awayLS = awayTeam.linescores ?? [];
        const getScore = (ls: any[], period: number) => {
          const entry = ls.find((x) => x.period === period);
          return entry ? parseInt(entry.value, 10) || 0 : null;
        };

        let winnerTeam = null;
        if (status === "FINAL") {
          if (homeScore > awayScore) winnerTeam = homeAbbr;
          else if (awayScore > homeScore) winnerTeam = awayAbbr;
        }

        const espnWeek = event.week?.number ?? 1;
        // In the postseason, map only the rounds we score; skip unmapped weeks
        // (Pro Bowl = 4, or anything unexpected) rather than guessing a DB week.
        let dbWeek: number;
        if (isPlayoffs) {
          const mapped = mapPlayoffWeek(espnWeek);
          if (mapped === null) { skippedCount++; continue; }
          dbWeek = mapped;
        } else {
          dbWeek = espnWeek;
        }

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

    // In the postseason there are only a handful of games, so any skip is
    // suspicious (most likely a team-abbreviation mismatch, e.g. WSH vs WAS,
    // leaving a real game un-scored). Surface it loudly. Regular-season skips
    // are normal (the scoreboard spans states/weeks) so we don't warn there.
    if (isPlayoffs && skippedCount > 0) {
      console.warn(`[nfl-update-scores] ⚠️ PLAYOFFS: ${skippedCount} game(s) skipped/unmatched for ${competition} ${seasonYear} — check for team-abbreviation mismatches; a real game may be un-scored.`);
    }

    return json({ success: true, updated: updatedCount, skipped: skippedCount, updates, isPlayoffs }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
