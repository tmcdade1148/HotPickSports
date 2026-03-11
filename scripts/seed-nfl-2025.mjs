/**
 * seed-nfl-2025.mjs
 *
 * One-time script to load 2025 NFL regular season data into the season_games
 * table. Uses ESPN's public scoreboard API as the data source.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/seed-nfl-2025.mjs
 *
 * The script is idempotent — it deletes existing rows for the target
 * competition before inserting.
 */

import {createClient} from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://mzqtrpdiqhopjmxjccwy.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_SERVICE_ROLE_KEY env var.\n' +
      'Find it in Supabase Dashboard → Settings → API → service_role key.\n' +
      'Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/seed-nfl-2025.mjs',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {persistSession: false},
});

/** Competition string must match src/sports/nfl/config.ts */
const COMPETITION = 'nfl_2026';
const SEASON_YEAR = 2025;
const TOTAL_WEEKS = 18;

/** Weeks to load as "scheduled" (no scores) for dev testing of pick flow */
const SCHEDULED_WEEKS = new Set([18]);

const ESPN_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

// ---------------------------------------------------------------------------
// Team code mapping — ESPN abbreviation → our config codes
// ---------------------------------------------------------------------------

function mapTeamCode(espnAbbr) {
  // ESPN uses WSH; our config uses WAS
  if (espnAbbr === 'WSH') return 'WAS';
  return espnAbbr;
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

function mapStatus(espnStatusName) {
  switch (espnStatusName) {
    case 'STATUS_FINAL':
      return 'completed';
    case 'STATUS_IN_PROGRESS':
      return 'live';
    case 'STATUS_SCHEDULED':
    default:
      return 'scheduled';
  }
}

// ---------------------------------------------------------------------------
// ESPN API fetch
// ---------------------------------------------------------------------------

async function fetchWeek(week) {
  const url = `${ESPN_BASE}?week=${week}&seasontype=2`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ESPN API error for week ${week}: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.events || [];
}

// ---------------------------------------------------------------------------
// ESPN event → season_games row
// ---------------------------------------------------------------------------

function eventToRow(event, week) {
  const comp = event.competitions[0];
  const homeComp = comp.competitors.find(c => c.homeAway === 'home');
  const awayComp = comp.competitors.find(c => c.homeAway === 'away');

  const forceScheduled = SCHEDULED_WEEKS.has(week);
  const espnStatus = comp.status.type.name;
  const status = forceScheduled ? 'scheduled' : mapStatus(espnStatus);
  const isCompleted = status === 'completed';

  const homeScore = isCompleted ? parseInt(homeComp.score, 10) : null;
  const awayScore = isCompleted ? parseInt(awayComp.score, 10) : null;

  const homeTeam = mapTeamCode(homeComp.team.abbreviation);
  const awayTeam = mapTeamCode(awayComp.team.abbreviation);

  // Determine winner (null for ties or non-completed games)
  let winnerTeam = null;
  if (isCompleted && homeScore != null && awayScore != null) {
    if (homeScore > awayScore) winnerTeam = homeTeam;
    else if (awayScore > homeScore) winnerTeam = awayTeam;
  }

  // Quarter scores (ESPN provides linescores per period)
  const homeLS = isCompleted ? homeComp.linescores || [] : [];
  const awayLS = isCompleted ? awayComp.linescores || [] : [];

  // Records (e.g. "3-2")
  const homeRecordObj = (homeComp.records || []).find(r => r.type === 'total');
  const awayRecordObj = (awayComp.records || []).find(r => r.type === 'total');

  return {
    game_id: event.id,
    competition: COMPETITION,
    season_year: SEASON_YEAR,
    week,
    phase: 'regular',
    home_team: homeTeam,
    away_team: awayTeam,
    kickoff_at: event.date,
    home_score: homeScore,
    away_score: awayScore,
    status,
    winner_team: winnerTeam,
    // Odds — not available from ESPN scoreboard; leave null for dev
    spread: null,
    home_moneyline: null,
    away_moneyline: null,
    over_under: null,
    competitive_index: null,
    // Ranks assigned in post-processing step
    rank: null,
    frozen_rank: null,
    is_finalized: isCompleted,
    home_record: forceScheduled ? null : (homeRecordObj?.summary ?? null),
    away_record: forceScheduled ? null : (awayRecordObj?.summary ?? null),
    current_period: null,
    game_clock: null,
    // Quarter scores (only Q1-Q3 in our schema)
    q1_home_score: homeLS[0]?.value ?? null,
    q1_away_score: awayLS[0]?.value ?? null,
    q2_home_score: homeLS[1]?.value ?? null,
    q2_away_score: awayLS[1]?.value ?? null,
    q3_home_score: homeLS[2]?.value ?? null,
    q3_away_score: awayLS[2]?.value ?? null,
  };
}

// ---------------------------------------------------------------------------
// Rank assignment — closest games get highest rank (1-10)
// ---------------------------------------------------------------------------

function assignRanks(games) {
  const completed = games.filter(
    g => g.status === 'completed' && g.home_score != null,
  );
  const other = games.filter(
    g => g.status !== 'completed' || g.home_score == null,
  );

  // Sort by absolute score differential — closest games first
  completed.sort((a, b) => {
    const diffA = Math.abs(a.home_score - a.away_score);
    const diffB = Math.abs(b.home_score - b.away_score);
    return diffA - diffB;
  });

  const count = completed.length;
  completed.forEach((game, i) => {
    // Linearly distribute: index 0 (closest) = rank 10, last (blowout) = rank 1
    const rank = Math.max(
      1,
      Math.round(10 - (i / Math.max(count - 1, 1)) * 9),
    );
    game.rank = rank;
    game.frozen_rank = rank;
  });

  return [...completed, ...other];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    `\nSeeding NFL ${SEASON_YEAR} schedule as competition="${COMPETITION}"...\n`,
  );

  // Delete existing data for this competition (makes re-runs idempotent)
  const {error: deleteError} = await supabase
    .from('season_games')
    .delete()
    .eq('competition', COMPETITION);

  if (deleteError) {
    console.error('Failed to clear existing data:', deleteError.message);
    process.exit(1);
  }
  console.log('Cleared existing season_games for', COMPETITION);

  let totalInserted = 0;

  for (let week = 1; week <= TOTAL_WEEKS; week++) {
    // Small delay between ESPN requests to be polite
    if (week > 1) {
      await new Promise(r => setTimeout(r, 500));
    }

    process.stdout.write(`  Week ${String(week).padStart(2)}... `);

    const events = await fetchWeek(week);
    let rows = events.map(e => eventToRow(e, week));
    rows = assignRanks(rows);

    const {error} = await supabase.from('season_games').insert(rows);

    if (error) {
      console.log(`ERROR: ${error.message}`);
    } else {
      const completed = rows.filter(r => r.status === 'completed').length;
      const scheduled = rows.filter(r => r.status === 'scheduled').length;
      console.log(
        `${rows.length} games (${completed} completed, ${scheduled} scheduled)`,
      );
      totalInserted += rows.length;
    }
  }

  console.log(`\nDone! ${totalInserted} total games inserted.\n`);
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
