import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapPlayoffWeek } from "../_shared/scoring.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
  { auth: { persistSession: false } }
);

// ESPN HOST: cdn.espn.com, NOT site.api.espn.com. And NO seasontype param.
//
// Live incident, preseason Wk2, 2026-08-21: site.api.espn.com began returning a
// hard Akamai 403 "Access Denied" to every request from Supabase. 24 failures
// per hour for 12+ hours, on BOTH nfl_2026 and nfl_2026_pre. The function threw
// at the fetch and never reached the update loop, so no game ever left
// SCHEDULED, so nfl-calculate-scores found no FINAL games (it re-scored Wk1 on a
// loop) and nfl-finalize-week reported "No completed unfinalized week found".
//
// Three things worth remembering:
//   1. pg_cron reported "succeeded" the entire time. net.http_post only QUEUES
//      the request; it never sees the response. Green cron, dead pipeline.
//      The truth lives in net._http_response -- check it FIRST next time.
//   2. A browser User-Agent did NOT fix it. The block is on the site.api host,
//      not the request signature. cdn.espn.com returns 200 with full data from
//      the same network with the same UA.
//   3. DO NOT add `&seasontype=1` back. On cdn.espn.com that combination returns
//      an EMPTY body -- the request hangs and json() throws "Unexpected end of
//      JSON input". Verified 2026-08-21.
//
// Preseason isolation does NOT come from the URL. It comes from the
// `.eq("competition", competition)` filter on the update below, combined with
// the game_id match -- see the long note at the update call. The plain URL
// returns whatever ESPN considers current (preseason now, regular season from
// September), which is exactly what both competitions want.
//
// The payload is the same scoreboard object as site.api returned, just nested
// one level under content.sbData -- events[].id, .week.number and
// .status.type.state are identical, so the parsing loop is unchanged. The
// `?? raw` fallback keeps us working if ESPN ever flattens it again.
const ESPN_SCOREBOARD_URL = "https://cdn.espn.com/core/nfl/scoreboard?xhr=1";

const ESPN_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

// One retry, fixed delay, fetch only. The 5-minute cron IS the outer retry
// loop, so more attempts inside one invocation buy latency, not reliability.
const RETRY_DELAY_MS = 2000;
const ATTEMPT_TIMEOUT_MS = 10000;

// A single bad ESPN response used to kill the whole run: .json() threw, the
// function returned 500, and no game moved until the next cron tick. Measured
// 2026-08-22: 16 "Unexpected end of JSON input" failures in a 6-hour window
// (~8% of ticks), plus one request that never came back at all (a null row in
// net._http_response) -- which is why the timeout matters as much as the retry.
//
// Five failure modes funnel through the same retry: non-2xx, timeout, empty
// body, unparseable JSON, and a parsed body with no events array. An EMPTY
// events array is accepted -- an offseason scoreboard legitimately has none.
//
// Both attempts failing throws, which the handler's catch turns into
// success:false / HTTP 500. That is deliberate: a dead fetch must be loudly
// visible in net._http_response. Reporting success on no data is the exact
// pattern that hid the Aug 20 blackout for 12 hours.
async function fetchScoreboard(): Promise<{ data: any; attempts: number }> {
  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(ESPN_SCOREBOARD_URL, {
        headers: ESPN_HEADERS,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      if (!res.ok) { lastErr = `HTTP ${res.status}`; }
      else {
        const text = await res.text();
        if (text.length === 0) { lastErr = "empty body"; }
        else {
          try {
            const raw = JSON.parse(text);
            // cdn.espn.com nests the scoreboard under content.sbData; the
            // `?? raw` fallback keeps us working if ESPN ever flattens it.
            const sb = raw?.content?.sbData ?? raw;
            if (!Array.isArray(sb?.events)) {
              lastErr = `no events array (body ${text.length}b)`;
            } else {
              return { data: sb, attempts: attempt };
            }
          } catch { lastErr = `unparseable body (${text.length}b)`; }
        }
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e); // incl. timeout
    }
    if (attempt === 1) {
      console.warn(`[nfl-update-scores] attempt 1 failed (${lastErr}), retrying`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw new Error(`ESPN fetch failed after 2 attempts: ${lastErr}`);
}

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

    // Reported for observability only -- it no longer selects a URL. See the
    // note above: isolation is the competition filter, not the endpoint.
    const espnSeasonType = String(cfg.espn_season_type ?? "").replace(/^\"|\"$/g, "");
    const isPreseason = espnSeasonType === "1";

    // Throws only if BOTH attempts fail, and it throws here -- before the
    // update loop -- so a failed fetch writes nothing. Keep that ordering.
    const { data: espnData, attempts } = await fetchScoreboard();

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
        // dbWeek is REPORTING ONLY -- it is no longer part of the row match. See
        // the game_id note below.
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

        // Match on game_id, NOT on week + team abbreviations.
        //
        // season_games.game_id IS ESPN's event.id -- nfl-import-schedule writes
        // `game_id: event.id` and the column is the table's PRIMARY KEY. Matching
        // on it directly removes two long-standing failure modes:
        //
        //  1. WEEK NUMBERING. ESPN indexes seasontype=1 week 1 as the Hall of
        //     Fame Game, so our preseason weeks 1-3 are ESPN weeks 2-4.
        //     nfl-import-schedule applies that offset (`espnWeek = week + 1`);
        //     this function never did, so it looked for our Wk2 while scoring
        //     our Wk1 and every game silently failed to match. Live incident,
        //     preseason Wk1, 2026-08-13: "No match: DAL@SEA (nfl_2026_pre 2026
        //     Wk2)", 16 of 16 skipped, no game ever reached FINAL, so
        //     finalize-week and calculate-scores were both blocked behind it.
        //     game_id has no such offset to get wrong.
        //
        //  2. TEAM ABBREVIATIONS. The old match keyed on home_team/away_team,
        //     so a drift like WSH vs WAS would leave a real game un-scored. That
        //     hazard is now structurally gone.
        //
        // KEEP the competition filter. game_id is globally unique, but the
        // regular-season job also runs during preseason (the scoreboard returns
        // whatever ESPN considers current, which is preseason right now), so
        // without this guard nfl_2026 could write scores onto nfl_2026_pre rows.
        // This filter IS the preseason isolation -- see the header note.
        const { data, error } = await supabase
          .from("season_games")
          .update(updateData)
          .eq("game_id", event.id)
          .eq("competition", competition)
          .select("game_id");

        if (error) {
          console.error(`[nfl-update-scores] Error ${awayAbbr}@${homeAbbr}:`, error.message);
        } else if (data && data.length > 0) {
          updatedCount++;
          updates.push({ game: `${awayAbbr}@${homeAbbr}`, status, score: `${awayScore}-${homeScore}`, winner: winnerTeam, week: dbWeek });
        } else {
          skippedCount++;
          console.log(`[nfl-update-scores] No match: ${awayAbbr}@${homeAbbr} id=${event.id} (${competition} ${seasonYear} espnWk${espnWeek})`);
        }
      } catch (gameErr) {
        skippedCount++;
      }
    }

    // In the postseason there are only a handful of games, so any skip is
    // suspicious. Surface it loudly. Regular-season skips are normal (the
    // scoreboard spans states/weeks) so we don't warn there.
    if (isPlayoffs && skippedCount > 0) {
      console.warn(`[nfl-update-scores] PLAYOFFS: ${skippedCount} game(s) skipped/unmatched for ${competition} ${seasonYear} -- a real game may be un-scored.`);
    }

    // `attempts` is here so every invocation self-reports in net._http_response:
    // 1 on a clean tick, 2 when the retry saved the run.
    return json({ success: true, competition, updated: updatedCount,
      skipped: skippedCount, attempts, updates, isPlayoffs, isPreseason,
      espnSeasonType: seasonType }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
