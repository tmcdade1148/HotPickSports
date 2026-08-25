import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
  { auth: { persistSession: false } }
);

// ============================================================================
// ESPN HOSTS (v29, 2026-08-25) — read this before changing a URL.
//
// site.api.espn.com is DEAD to us. Akamai returns a hard 403 "Access Denied"
// from BOTH Supabase networks: the Edge runtime (two invocations, 500 "ESPN API
// error 403") and the Postgres network (net.http_get -> 403, a 447-byte Access
// Denied page). Verified 2026-08-25 — the same block that moved
// nfl-update-scores off that host on 2026-08-21, which this function was never
// updated for. Any code path that names that host again is a defect, not a
// fallback.
//
// PRIMARY — site.web.api.espn.com. The only unblocked host that serves an
// EXPLICITLY specified (seasontype, week, dates) triple. Probed 2026-08-25 from
// the Postgres network: 200, 249KB, 16 events, flat payload (events at the top
// level), echoing season.type=2 season.year=2026 week.number=1 exactly as
// asked. That echo is what makes the identity check below possible.
//
// FALLBACK — cdn.espn.com. 200 with full data, nested one level under
// content.sbData, and — critically — IT CANNOT BE TARGETED. It serves whatever
// ESPN considers the current horizon and nothing else. Probed 2026-08-25: plain
// ?xhr=1 returned PRESEASON week 3 (season.type=1); adding &week=1&year=2026
// returned a 202 with an EMPTY body — the same tarpit v28 hit when it tried
// &seasontype=1. So the fallback is a second chance, not a second way to ask.
// It helps when the current horizon happens to BE the week we want, and the
// identity check turns every other case into a clean refusal instead of a
// wrong-week import.
//
// Bursts get tarpitted (empty 202s). Attempts are SPACED, never stacked, and
// the real retry loop is the hourly Tuesday cron — not this function.
// ============================================================================

type EspnHost = "site.web.api" | "cdn";

const ESPN_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

const ATTEMPT_TIMEOUT_MS = 10000;
const ATTEMPT_SPACING_MS = 5000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const WEEK_TO_ESPN: Record<number, { seasonType: number; espnWeek: number; phase: string }> = {
  19: { seasonType: 3, espnWeek: 1, phase: "WILDCARD" },
  20: { seasonType: 3, espnWeek: 2, phase: "DIVISIONAL" },
  21: { seasonType: 3, espnWeek: 3, phase: "CONFERENCE" },
  22: { seasonType: 3, espnWeek: 5, phase: "SUPERBOWL" },
};

// ESPN moneylines are strings ("-198", "+164") nested under
// odds.moneyline.<side>.close.odds, with .open.odds as a fallback
// before a line closes. NOT under homeTeamOdds, which has no such key.
function espnML(odds: any, side: "home" | "away"): number | null {
  const raw = odds?.moneyline?.[side]?.close?.odds
           ?? odds?.moneyline?.[side]?.open?.odds;
  if (raw === null || raw === undefined) return null;
  const n = Number(String(raw).replace(/^\+/, ""));
  return Number.isFinite(n) ? n : null;
}

function espnSpread(odds: any): number | null {
  // odds.spread is numeric and home-relative (negative = home favored),
  // matching probFromSpread. odds.details is a display label, not data.
  return typeof odds?.spread === "number" && Number.isFinite(odds.spread)
    ? odds.spread : null;
}

// One attempt against one host. Returns the slate or the reason it isn't one.
// Five failure modes are told apart and reported by name — non-2xx, timeout,
// empty body, unparseable JSON, no events array — plus the wrong-week case
// below. That classification is what made the Aug 2026 failures legible; keep
// it. A 202, an empty body or a missing events array is a FAILURE of this
// attempt, never a slate.
async function attemptSlate(
  url: string, seasonType: number, espnWeek: number, seasonYear: number,
): Promise<{ events: any[] } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: ESPN_HEADERS,
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };

    const text = await res.text();
    if (text.length === 0) return { error: "empty body (the 202 tarpit looks like this)" };

    let raw: any;
    try { raw = JSON.parse(text); } catch { return { error: `unparseable body (${text.length}b)` }; }

    // cdn nests the scoreboard under content.sbData; site.web.api is flat.
    // `?? raw` covers both shapes with one code path.
    const sb = raw?.content?.sbData ?? raw;
    if (!Array.isArray(sb?.events)) return { error: `no events array (body ${text.length}b)` };

    // IDENTITY CHECK — this is what makes an untargetable fallback safe.
    //
    // The fallback serves the current horizon, not the week we asked for, and
    // the week it actually served is stated only inside the payload. Without
    // this check a Tuesday fallback could hand back week N's games while we are
    // prepping week N+1, and the importer would cheerfully delete N+1's rows
    // and re-insert N's games stamped `week: N+1`. The stale-id guards below do
    // NOT catch that: with equal game counts nothing looks like a shrink, and
    // before picks open there are no picks to conflict with. Wrong slate, clean
    // bill of health, silent corruption of a week nobody has looked at yet.
    //
    // Checked only when there is something to write. An empty events array
    // writes nothing and so cannot corrupt anything, and a not-yet-published
    // future week legitimately returns one — it takes the zero-events early
    // return in the handler.
    if (sb.events.length > 0) {
      const gotType = sb.season?.type, gotYear = sb.season?.year, gotWeek = sb.week?.number;
      if (gotType !== seasonType || gotYear !== seasonYear || gotWeek !== espnWeek) {
        return { error: `wrong slate — wanted seasontype=${seasonType} year=${seasonYear} week=${espnWeek}, got seasontype=${gotType} year=${gotYear} week=${gotWeek}` };
      }
    }

    return { events: sb.events };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }; // incl. timeout
  }
}

// Attempt ladder: primary, primary, fallback, fallback — spaced, never burst.
// The HOST SWITCH is the point of the ladder; the duplicate attempt per host
// only covers a single flaky response. Throws when all four fail, which the
// handler turns into a loud 500 plus a 'failed' readiness row.
async function fetchSlate(
  seasonType: number, espnWeek: number, seasonYear: number,
): Promise<{ events: any[]; host: EspnHost; url: string }> {
  const primaryUrl = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=${seasonType}&week=${espnWeek}&dates=${seasonYear}`;
  const fallbackUrl = "https://cdn.espn.com/core/nfl/scoreboard?xhr=1";
  const ladder: Array<{ host: EspnHost; url: string }> = [
    { host: "site.web.api", url: primaryUrl },
    { host: "site.web.api", url: primaryUrl },
    { host: "cdn", url: fallbackUrl },
    { host: "cdn", url: fallbackUrl },
  ];

  const failures: string[] = [];
  for (let i = 0; i < ladder.length; i++) {
    if (i > 0) await sleep(ATTEMPT_SPACING_MS);
    const { host, url } = ladder[i];
    const outcome = await attemptSlate(url, seasonType, espnWeek, seasonYear);
    if ("events" in outcome) return { events: outcome.events, host, url };
    console.warn(`[nfl-import-schedule] attempt ${i + 1}/${ladder.length} ${host}: ${outcome.error}`);
    failures.push(`${host}: ${outcome.error}`);
  }
  throw new Error(`ESPN fetch failed after ${ladder.length} attempts — ${failures.join(" | ")}`);
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
  // Hoisted so the catch block can record a readiness failure (§5b).
  let competition = "nfl_2026";
  let week = 0;
  try {
    const body = await req.json().catch(() => ({}));
    competition = body.competition ?? "nfl_2026";

    const { data: configRows } = await supabase
      .from("competition_config").select("key, value").eq("competition", competition);
    const cfg = Object.fromEntries((configRows ?? []).map((r) => [r.key, r.value]));

    // Guard (260611): the ESPN importer must never run against a competition it
    // doesn't own. Simulator/demo game_ids are seeded (sim_*) and match zero
    // ESPN event ids, so the stale-id cleanup below would DELETE the entire
    // week before inserting — destroying the App Review sandbox. Config-driven
    // via data_provider (covers sim + demo + future providers); fail closed if
    // the key is missing. Refuse loudly — never silently no-op.
    const provider = String(cfg.data_provider ?? "").replace(/^"|"$/g, "");
    if (provider !== "espn") {
      const msg = `refused: ${competition} is not an espn-driven competition (data_provider=${provider || "missing"}); sims are driven by the simulator, not the importer.`;
      console.error(`[nfl-import-schedule] ${msg}`);
      return json({ success: false, error: msg }, 403);
    }

    if (!cfg.is_active) return json({ success: true, reason: "competition_inactive" }, 200);

    // Week: explicit param wins; otherwise derive from the clock so the cron
    // (which passes no week) preps the right week. See deriveWeek().
    week = Number(body.week) || deriveWeek(cfg);
    if (!week) return json({ success: true, reason: "no_active_week" }, 200);

    const seasonYear = Number(cfg.season_year ?? 2026);

    // Preseason isolation: espn_season_type is a preseason-only config key. When
    // set to '1', force ESPN seasontype=1 and label rows PRESEASON. Absent (every
    // regular competition, incl. nfl_2026) => isPreseason=false => the existing
    // seasontype 2 (regular) / 3 (playoff) mapping below runs EXACTLY as before.
    const espnSeasonType = String(cfg.espn_season_type ?? "").replace(/^"|"$/g, "");
    const isPreseason = espnSeasonType === "1";

    let seasonType: number, espnWeek: number, phase: string;
    // ESPN indexes seasontype=1 week 1 as the Hall of Fame Game, so our
    // preseason weeks 1-3 are ESPN weeks 2-4. The offset also excludes
    // the HOF game automatically.
    if (isPreseason) { seasonType = 1; espnWeek = week + 1; phase = "PRESEASON"; }
    else if (week <= 18) { seasonType = 2; espnWeek = week; phase = "REGULAR"; }
    else if (WEEK_TO_ESPN[week]) { ({ seasonType, espnWeek, phase } = WEEK_TO_ESPN[week]); }
    else return json({ error: `Invalid week: ${week}` }, 400);

    // Throws on total failure — before any write, so a failed fetch changes
    // nothing. Keep that ordering: reporting success on no data is the pattern
    // that hid the Aug 20 blackout for 12 hours.
    const slate = await fetchSlate(seasonType, espnWeek, seasonYear);
    const events = slate.events;

    if (events.length === 0) {
      await markReadiness(competition, week, { games_status: "ok", games_count: 0, games_at: new Date().toISOString() });
      return json({ success: true, competition, season_year: seasonYear, week, imported: 0, espnHost: slate.host, warning: "No games found" }, 200);
    }

    // Read existing odds BEFORE the mapping so the coalesce below can preserve
    // them. nfl-fetch-odds is the primary odds source; a re-import must never
    // blank a value it wrote (same discipline as frozen_rank, Hard Rule #6).
    // Cron ordering (import :05, odds :10) hides this — it is not a guarantee.
    const { data: existing } = await supabase
      .from("season_games").select("game_id, spread, home_moneyline, away_moneyline")
      .eq("competition", competition).eq("season_year", seasonYear).eq("week", week);
    const prior = new Map(
      (existing ?? []).map((g: any) => [g.game_id, g])
    );

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
      const was = prior.get(event.id);
      const espnStatus = comp.status?.type?.name ?? "";
      let status = "SCHEDULED";
      if (espnStatus.includes("FINAL")) status = "FINAL";
      else if (espnStatus.includes("PROGRESS") || espnStatus === "IN") status = "IN_PROGRESS";
      // rank / frozen_rank are deliberately ABSENT — see the ranking note below.
      return {
        game_id: event.id, competition, season_year: seasonYear, week, phase,
        home_team: homeTeam.team.abbreviation, away_team: awayTeam.team.abbreviation,
        kickoff_at: event.date, status,
        home_score: homeTeam.score ? parseInt(homeTeam.score, 10) : null,
        away_score: awayTeam.score ? parseInt(awayTeam.score, 10) : null,
        home_record: cleanRecord(homeTeam.records?.[0]?.summary ?? null),
        away_record: cleanRecord(awayTeam.records?.[0]?.summary ?? null),
        spread: espnSpread(odds) ?? was?.spread ?? null,
        home_moneyline: espnML(odds, "home") ?? was?.home_moneyline ?? null,
        away_moneyline: espnML(odds, "away") ?? was?.away_moneyline ?? null,
        is_finalized: false,
      };
    });

    if (existing && existing.length > 0) {
      const newIds = new Set(rows.map((r: any) => r.game_id));
      const toDelete = existing.filter((g) => !newIds.has(g.game_id)).map((g) => g.game_id);

      if (toDelete.length > 0) {
        // GUARD 1 — a game somebody has picked never disappears on a robot's
        // say-so. Matched on game_id + competition only: game_id is the
        // season_games PRIMARY KEY, so it is already week-unique, and this
        // guard is only ever allowed to be more protective, never less.
        const { data: picked, error: picksError } = await supabase
          .from("season_picks").select("game_id")
          .eq("competition", competition).in("game_id", toDelete);
        if (picksError) throw new Error(`pick-conflict check failed: ${picksError.message}`);

        if (picked && picked.length > 0) {
          const ids = [...new Set(picked.map((p: any) => p.game_id))];
          await markGamesFailed(competition, week);
          console.error(`[nfl-import-schedule] SLATE_CONFLICT ${competition} wk${week}: ${ids.join(", ")}`);
          return json({ success: false, competition, week, espnHost: slate.host, deleted: 0,
            error: `SLATE_CONFLICT: fetched slate drops game(s) that have picks: ${ids.join(", ")}` }, 500);
        }

        // GUARD 2 — refuse a wholesale shrink. A real schedule change moves a
        // game or two; it does not remove a third of a week. A slate that
        // arrives short is a partial page, not news.
        if (rows.length < existing.length && toDelete.length > 2) {
          await markGamesFailed(competition, week);
          console.error(`[nfl-import-schedule] SLATE_SHRUNK ${competition} wk${week}: ${rows.length} fetched vs ${existing.length} stored`);
          return json({ success: false, competition, week, espnHost: slate.host, deleted: 0,
            error: `SLATE_SHRUNK: fetched ${rows.length} games vs ${existing.length} stored, dropping ${toDelete.length}; treating the response as a partial page` }, 500);
        }

        await supabase.from("season_games").delete()
          .eq("competition", competition).eq("season_year", seasonYear).eq("week", week).in("game_id", toDelete);
      }
    }

    const { error } = await supabase.from("season_games").upsert(rows, { onConflict: "game_id" });
    if (error) {
      await markGamesFailed(competition, week);
      return json({ error: error.message }, 500);
    }

    // Week 22 (Super Bowl): the single game is always rank 16 (REFERENCE.md §7).
    // Its own statement — not part of the batch payload — so the rank columns
    // stay out of the conflict-update path for weeks 1–21.
    if (week === 22) {
      const { error: sbRankError } = await supabase.from("season_games")
        .update({ rank: 16, frozen_rank: 16 })
        .eq("competition", competition).eq("season_year", seasonYear).eq("week", week);
      if (sbRankError) {
        await markGamesFailed(competition, week);
        return json({ error: sbRankError.message }, 500);
      }
    }

    // §5b — games loaded OK.
    await markReadiness(competition, week, { games_status: "ok", games_count: rows.length, games_at: new Date().toISOString() });

    console.log(`[nfl-import-schedule] Imported ${rows.length} games from ${slate.host}`);

    // Ranking is intentionally NOT done here (weeks 1–21). frozen_rank is set by
    // open_week_picks when picks open (REFERENCE.md §7); nfl-rank-games writes
    // the provisional `rank` AFTER nfl-fetch-odds runs, so ranks are computed
    // from the Odds-API numbers — not ESPN's import-time scoreboard odds. The
    // rank columns are omitted from the upsert payload entirely: PostgREST only
    // updates columns present in the body, so a re-import of an already-ranked
    // week can no longer overwrite frozen_rank (Hard Rule #6 — 260611
    // FrozenRankImmutability spec). New games get the column default (null)
    // until the week opens. This is also what makes the hourly Tuesday
    // reconciliation safe to repeat.

    return json({ success: true, competition, season_year: seasonYear, week, phase,
      imported: rows.length, espnHost: slate.host, espnUrl: slate.url }, 200);
  } catch (err) {
    if (week) await markGamesFailed(competition, week);
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

// Every failure path writes the SAME row. Two columns matter beyond the status:
//
//   games_count: null       — the 2026-08-25 failure left a stale `16` sitting
//                             next to games_status='failed', so the readiness
//                             row reported a plausible slate it did not have.
//                             A row that says nothing beats a row that lies.
//
//   ready_notified_at: null — notify_week_ready fires once per row and never
//                             again while this column is set. Nulling it
//                             re-arms the "week is ready to open" push to super
//                             admins, so the RECOVERY announces itself instead
//                             of landing silently an hour later.
async function markGamesFailed(competition: string, week: number) {
  await markReadiness(competition, week, {
    games_status: "failed",
    games_count: null,
    games_at: new Date().toISOString(),
    ready_notified_at: null,
  });
}
