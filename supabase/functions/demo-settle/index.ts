// demo-settle — settle the calling user's nfl_demo week server-side.
// Spec: docs/DEMO_WEEK_SPEC.md §6.
//
// The new-user demo runs on the immutable nfl_demo game rows (status stays
// 'scheduled'; the outcome lives in winner_team). This function reads the
// caller's already-saved demo picks, scores them against winner_team using the
// shared scoring math, and upserts the caller's season_user_totals row. It
// never mutates game rows, so concurrent demo runs are safe (spec §4).
//
// Scoring stays server-side (Hard Rule #3 — never client-side). Sandbox-scoped
// to nfl_demo, so exempt from admin_audit_log (Hard Rule #17).

import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {scorePicks} from './scoring.ts';

const COMPETITION = 'nfl_demo';
const SEASON_YEAR = 2026;
const WEEK = 1;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {status: 200, headers: CORS_HEADERS});
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // Resolve the caller from their JWT (passed by supabase.functions.invoke).
    const authHeader = req.headers.get('Authorization') ?? '';
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: {headers: {Authorization: authHeader}},
      auth: {persistSession: false},
    });
    const {data: userData, error: userErr} = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({success: false, error: 'auth required'}, 401);
    }
    const userId = userData.user.id;

    // Service-role client for the scored write (RLS-bypassing, server-only).
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: {persistSession: false},
    });

    // Guard on competition_config (parity with nfl-calculate-scores).
    const {data: cfgRows} = await admin
      .from('competition_config').select('key, value').eq('competition', COMPETITION);
    const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, r.value]));
    if (!cfg.is_active) return json({success: false, error: 'demo_inactive'}, 409);
    if (cfg.scoring_locked) return json({success: false, error: 'scoring_locked'}, 409);

    // Demo games — read WITHOUT a FINAL-status filter (they stay 'scheduled';
    // the outcome is in winner_team). This is why demo-settle can't reuse the
    // production scorer's query, only its math.
    const {data: games, error: gamesErr} = await admin
      .from('season_games')
      .select('game_id, winner_team, rank, frozen_rank')
      .eq('competition', COMPETITION).eq('season_year', SEASON_YEAR).eq('week', WEEK);
    if (gamesErr) return json({success: false, error: gamesErr.message}, 500);

    // The caller's saved demo picks.
    const {data: picks, error: picksErr} = await admin
      .from('season_picks')
      .select('user_id, game_id, picked_team, is_hotpick, power_up')
      .eq('competition', COMPETITION).eq('season_year', SEASON_YEAR).eq('week', WEEK)
      .eq('user_id', userId);
    if (picksErr) return json({success: false, error: picksErr.message}, 500);
    if (!picks || picks.length === 0) {
      return json({success: false, error: 'no_picks'}, 400);
    }

    const {userScores} = scorePicks(games ?? [], picks);
    const agg = userScores.find((u) => u.user_id === userId) ?? {
      user_id: userId, week_points: 0, correct_picks: 0, total_picks: 0,
      is_hotpick_correct: null, hotpick_rank: null,
      double_down_used: false, double_down_delta: 0,
    };

    const {error: upsertErr} = await admin
      .from('season_user_totals')
      .upsert({
        user_id: userId, competition: COMPETITION, season_year: SEASON_YEAR,
        week: WEEK, phase: 'REGULAR',
        week_points: agg.week_points, playoff_points: 0,
        correct_picks: agg.correct_picks, total_picks: agg.total_picks,
        is_hotpick_correct: agg.is_hotpick_correct, hotpick_rank: agg.hotpick_rank,
        is_no_show: false,
        double_down_used: agg.double_down_used, double_down_delta: agg.double_down_delta,
        scored_at: new Date().toISOString(),
      }, {onConflict: 'user_id,competition,season_year,week'});
    if (upsertErr) return json({success: false, error: upsertErr.message}, 500);

    return json({
      success: true,
      week_points: agg.week_points,
      correct_picks: agg.correct_picks,
      total_picks: agg.total_picks,
      is_hotpick_correct: agg.is_hotpick_correct,
      hotpick_rank: agg.hotpick_rank,
    });
  } catch (err) {
    return json({success: false, error: String(err)}, 500);
  }
});
