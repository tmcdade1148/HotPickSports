import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
  { auth: { persistSession: false } }
);

/**
 * Fetch ALL matching rows, paging past PostgREST's 1000-row default cap.
 * `apply` adds the .select()/.eq() filters; .range() is added per page.
 * Award math iterates the full result set, so a silent truncation at 1000
 * rows would corrupt season/week winners once the user base grows.
 */
async function fetchAll<T = any>(
  table: string,
  apply: (q: any) => any,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await apply(supabase.from(table)).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * compute-hardware — Award computation engine.
 *
 * Computes weekly and season-end awards, writes to user_hardware.
 * All writes use ON CONFLICT DO NOTHING — idempotent and safe to re-run.
 *
 * Triggers:
 * - weekly_settle: after all games in a week reach status = complete
 * - season_settle: after is_season_complete = true
 * - manual_override: Tom triggers from admin panel
 */
Deno.serve(async (req) => {
  // Auth gate (verify_jwt=false). compute-hardware is invoked two ways, so allow
  // EITHER:
  //   (a) pg_cron: x-cron-secret header == CRON_SHARED_SECRET (value from Vault), OR
  //   (b) a super-admin client (HardwareAdminScreen) presenting a valid user JWT.
  // The cron shared secret is decoupled from SB_SECRET_KEY (the DB key).
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  let authorized = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  if (!authorized) {
    const authz = req.headers.get("Authorization") ?? "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: prof } = await supabase
          .from("profiles").select("is_super_admin").eq("id", user.id).single();
        authorized = !!prof?.is_super_admin;
      }
    }
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const trigger = body.trigger ?? "weekly_settle";
    const competition = body.competition ?? "nfl_2026";
    const seasonYear = body.season_year ?? 2026;
    const week = body.week ?? null;

    // Read competition config
    const { data: configRows } = await supabase
      .from("competition_config").select("key, value").eq("competition", competition);
    const cfg = Object.fromEntries((configRows ?? []).map((r: any) => [r.key, r.value]));

    if (cfg.scoring_locked) return json({ success: true, reason: "scoring_locked" }, 200);

    const results: Record<string, any> = {};

    if (trigger === "weekly_settle" || trigger === "manual_override") {
      const targetWeek = week ?? Number(cfg.current_week ?? 1);
      results.sharpshooter = await computeSharpshooterWeek(competition, seasonYear, targetWeek);
      results.gunslinger = await computeGunslingerWeek(competition, seasonYear, targetWeek);
      results.contrarian = await computeContrarianWeek(competition, seasonYear, targetWeek);
      results.perfect = await computePerfectWeek(competition, seasonYear, targetWeek);
    }

    if (trigger === "season_settle" || trigger === "manual_override") {
      if (trigger === "season_settle" && !cfg.is_season_complete) {
        return json({ success: true, reason: "season_not_complete" }, 200);
      }
      results.champion = await computePoolChampion(competition, seasonYear);
      results.podium = await computePodium(competition, seasonYear);
      results.comeback = await computeBiggestComeback(competition, seasonYear);
      results.iron_poolie = await computeIronPoolie(competition, seasonYear);
      results.season_sharpshooter = await computeSeasonSharpshooter(competition, seasonYear);
      results.hotpick_artist = await computeHotPickArtist(competition, seasonYear);
      results.season_tactician = await computeSeasonTactician(competition, seasonYear);
    }

    return json({ success: true, trigger, competition, week, results }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

// ---------------------------------------------------------------------------
// WEEKLY AWARDS
// ---------------------------------------------------------------------------

async function computeSharpshooterWeek(competition: string, seasonYear: number, week: number) {
  // Highest regular pick win rate per pool. Min 10 picks. Ties: both awarded.
  const picks = await fetchAll<{ user_id: string; is_correct: boolean; is_hotpick: boolean }>(
    "season_picks",
    q => q.select("user_id, is_correct, is_hotpick")
      .eq("competition", competition).eq("week", week).eq("is_hotpick", false),
  );

  const members = await activePoolMembers(competition);

  if (!members) return { awarded: 0 };

  // Build user->pools map
  const userPools = new Map<string, string[]>();
  for (const m of members) {
    if (!userPools.has(m.user_id)) userPools.set(m.user_id, []);
    userPools.get(m.user_id)!.push(m.pool_id);
  }

  // Aggregate per user: correct/total regular picks
  const userStats = new Map<string, { correct: number; total: number }>();
  for (const p of picks) {
    if (!userStats.has(p.user_id)) userStats.set(p.user_id, { correct: 0, total: 0 });
    const s = userStats.get(p.user_id)!;
    s.total += 1;
    if (p.is_correct) s.correct += 1;
  }

  // Per pool: find highest pick rate (min 10 picks)
  const poolWinners = new Map<string, { userId: string; rate: number; correct: number; total: number }[]>();

  for (const [userId, stats] of userStats) {
    if (stats.total < 10) continue;
    const rate = Math.round((stats.correct / stats.total) * 1000) / 1000;
    const pools = userPools.get(userId) ?? [];
    for (const poolId of pools) {
      if (!poolWinners.has(poolId)) poolWinners.set(poolId, []);
      poolWinners.get(poolId)!.push({ userId, rate, correct: stats.correct, total: stats.total });
    }
  }

  // Get pool sizes
  const poolSizes = new Map<string, number>();
  for (const m of members) {
    poolSizes.set(m.pool_id, (poolSizes.get(m.pool_id) ?? 0) + 1);
  }

  const rows: any[] = [];
  for (const [poolId, candidates] of poolWinners) {
    candidates.sort((a, b) => b.rate - a.rate);
    const bestRate = candidates[0].rate;
    const winners = candidates.filter(c => c.rate === bestRate);
    for (const w of winners) {
      rows.push({
        user_id: w.userId,
        hardware_slug: "sharpshooter_week",
        hardware_name: "Sharpshooter",
        category: "weekly",
        scope: "pool",
        competition,
        season_year: seasonYear,
        week,
        pool_id: poolId,
        context_json: {
          correct: w.correct,
          total: w.total,
          pick_rate: w.rate,
          pool_size: poolSizes.get(poolId) ?? 0,
          week,
        },
      });
    }
  }

  return await upsertAwards(rows);
}

async function computeGunslingerWeek(competition: string, seasonYear: number, week: number) {
  // Rank 12+ HotPick AND won. Highest rank winner per pool. Ties: both awarded.
  const hotpicks = await fetchAll<{ user_id: string; game_id: string; picked_team: string; is_correct: boolean }>(
    "season_picks",
    q => q.select("user_id, game_id, picked_team, is_correct")
      .eq("competition", competition).eq("week", week).eq("is_hotpick", true).eq("is_correct", true),
  );

  if (hotpicks.length === 0) return { awarded: 0 };

  // Get game frozen_ranks
  const gameIds = [...new Set(hotpicks.map(h => h.game_id))];
  const { data: games } = await supabase
    .from("season_games")
    .select("game_id, frozen_rank")
    .in("game_id", gameIds);

  const rankMap = new Map((games ?? []).map(g => [g.game_id, g.frozen_rank ?? 0]));

  // Filter to rank 12+
  const qualified = hotpicks
    .map(h => ({ ...h, rank: rankMap.get(h.game_id) ?? 0 }))
    .filter(h => h.rank >= 12);

  if (qualified.length === 0) return { awarded: 0 };

  const members = await activePoolMembers(competition);

  const userPools = new Map<string, string[]>();
  for (const m of members ?? []) {
    if (!userPools.has(m.user_id)) userPools.set(m.user_id, []);
    userPools.get(m.user_id)!.push(m.pool_id);
  }

  // Per pool: highest rank winner
  const poolCandidates = new Map<string, { userId: string; rank: number; team: string }[]>();
  for (const q of qualified) {
    const pools = userPools.get(q.user_id) ?? [];
    for (const poolId of pools) {
      if (!poolCandidates.has(poolId)) poolCandidates.set(poolId, []);
      poolCandidates.get(poolId)!.push({ userId: q.user_id, rank: q.rank, team: q.picked_team });
    }
  }

  const rows: any[] = [];
  for (const [poolId, candidates] of poolCandidates) {
    candidates.sort((a, b) => b.rank - a.rank);
    const bestRank = candidates[0].rank;
    const winners = candidates.filter(c => c.rank === bestRank);
    for (const w of winners) {
      rows.push({
        user_id: w.userId,
        hardware_slug: "gunslinger_week",
        hardware_name: "The Gunslinger",
        category: "weekly",
        scope: "pool",
        competition,
        season_year: seasonYear,
        week,
        pool_id: poolId,
        context_json: {
          hotpick_rank: w.rank,
          hotpick_team: w.team,
          hotpick_won: true,
          points_earned: w.rank,
          week,
        },
      });
    }
  }

  return await upsertAwards(rows);
}

async function computeContrarianWeek(competition: string, seasonYear: number, week: number) {
  // Against pool majority on 8+ games AND top 3 weekly AND hotpick correct
  const picks = await fetchAll<{ user_id: string; game_id: string; picked_team: string; is_hotpick: boolean; is_correct: boolean }>(
    "season_picks",
    q => q.select("user_id, game_id, picked_team, is_hotpick, is_correct")
      .eq("competition", competition).eq("week", week),
  );

  const stats = await fetchAll<{ game_id: string; pool_id: string; team_a: string; team_b: string; team_a_pick_count: number; team_b_pick_count: number; total_picks: number }>(
    "game_pick_stats",
    q => q.select("game_id, pool_id, team_a, team_b, team_a_pick_count, team_b_pick_count, total_picks")
      .eq("competition", competition).eq("week", week),
  );

  const weekTotals = await fetchAll<{ user_id: string; week_points: number }>(
    "season_user_totals",
    q => q.select("user_id, week_points").eq("competition", competition).eq("week", week),
  );

  const members = await activePoolMembers(competition);

  if (!members) return { awarded: 0 };

  // Build pool majority map: pool_id -> game_id -> majority team
  const majorityMap = new Map<string, Map<string, string>>();
  for (const s of stats) {
    if (!majorityMap.has(s.pool_id)) majorityMap.set(s.pool_id, new Map());
    const majorityTeam = s.team_a_pick_count >= s.team_b_pick_count ? s.team_a : s.team_b;
    majorityMap.get(s.pool_id)!.set(s.game_id, majorityTeam);
  }

  // User picks by game
  const userPicks = new Map<string, Map<string, { team: string; isHotpick: boolean; isCorrect: boolean }>>();
  for (const p of picks) {
    if (!userPicks.has(p.user_id)) userPicks.set(p.user_id, new Map());
    userPicks.get(p.user_id)!.set(p.game_id, {
      team: p.picked_team,
      isHotpick: p.is_hotpick,
      isCorrect: p.is_correct ?? false,
    });
  }

  // User pool memberships
  const userPoolsMap = new Map<string, string[]>();
  for (const m of members) {
    if (!userPoolsMap.has(m.user_id)) userPoolsMap.set(m.user_id, []);
    userPoolsMap.get(m.user_id)!.push(m.pool_id);
  }

  // Week points by user (for ranking)
  const weekPoints = new Map<string, number>();
  for (const t of weekTotals ?? []) {
    weekPoints.set(t.user_id, t.week_points ?? 0);
  }

  // Total games this week
  const allGameIds = new Set(picks.map(p => p.game_id));
  const totalGames = allGameIds.size;

  const rows: any[] = [];

  // For each pool, check each user
  const poolUserIds = new Map<string, Set<string>>();
  for (const m of members) {
    if (!poolUserIds.has(m.pool_id)) poolUserIds.set(m.pool_id, new Set());
    poolUserIds.get(m.pool_id)!.add(m.user_id);
  }

  for (const [poolId, userIds] of poolUserIds) {
    const poolMajority = majorityMap.get(poolId);
    if (!poolMajority) continue;

    // Rank users by week points for this pool
    const poolRanking = [...userIds]
      .map(uid => ({ userId: uid, pts: weekPoints.get(uid) ?? 0 }))
      .sort((a, b) => b.pts - a.pts);

    for (const uid of userIds) {
      const picks = userPicks.get(uid);
      if (!picks) continue;

      // Check hotpick was correct
      let hotpickCorrect = false;
      for (const [, pick] of picks) {
        if (pick.isHotpick && pick.isCorrect) hotpickCorrect = true;
      }
      if (!hotpickCorrect) continue;

      // Count against-majority picks
      let againstCount = 0;
      let againstWins = 0;
      for (const [gameId, pick] of picks) {
        if (pick.isHotpick) continue; // only regular picks
        const majority = poolMajority.get(gameId);
        if (majority && pick.team !== majority) {
          againstCount += 1;
          if (pick.isCorrect) againstWins += 1;
        }
      }

      if (againstCount < 8) continue;

      // Check top 3 in pool
      const userRank = poolRanking.findIndex(r => r.userId === uid) + 1;
      if (userRank > 3) continue;

      rows.push({
        user_id: uid,
        hardware_slug: "contrarian_week",
        hardware_name: "The Contrarian",
        category: "weekly",
        scope: "pool",
        competition,
        season_year: seasonYear,
        week,
        pool_id: poolId,
        context_json: {
          against_majority_count: againstCount,
          against_majority_wins: againstWins,
          contrarian_rate: Math.round((againstCount / totalGames) * 100) / 100,
          week_rank: userRank,
          week,
        },
      });
    }
  }

  return await upsertAwards(rows);
}

async function computePerfectWeek(competition: string, seasonYear: number, week: number) {
  // 15/15 regular picks correct AND hotpick correct. Platform-scope.
  const picks = await fetchAll<{ user_id: string; is_correct: boolean; is_hotpick: boolean; game_id: string; picked_team: string }>(
    "season_picks",
    q => q.select("user_id, is_correct, is_hotpick, game_id, picked_team")
      .eq("competition", competition).eq("week", week),
  );

  // Aggregate per user
  const userAgg = new Map<string, {
    regularCorrect: number; regularTotal: number;
    hotpickCorrect: boolean; hotpickRank: number; hotpickTeam: string;
  }>();

  for (const p of picks) {
    if (!userAgg.has(p.user_id)) {
      userAgg.set(p.user_id, {
        regularCorrect: 0, regularTotal: 0,
        hotpickCorrect: false, hotpickRank: 0, hotpickTeam: "",
      });
    }
    const agg = userAgg.get(p.user_id)!;
    if (p.is_hotpick) {
      agg.hotpickCorrect = p.is_correct === true;
      agg.hotpickTeam = p.picked_team ?? "";
    } else {
      agg.regularTotal += 1;
      if (p.is_correct) agg.regularCorrect += 1;
    }
  }

  // Get hotpick frozen_ranks
  const hotpickPicks = picks.filter(p => p.is_hotpick);
  const gameIds = [...new Set(hotpickPicks.map(p => p.game_id))];
  const { data: games } = await supabase
    .from("season_games")
    .select("game_id, frozen_rank")
    .in("game_id", gameIds);
  const rankMap = new Map((games ?? []).map(g => [g.game_id, g.frozen_rank ?? 0]));

  for (const p of hotpickPicks) {
    const agg = userAgg.get(p.user_id);
    if (agg) agg.hotpickRank = rankMap.get(p.game_id) ?? 0;
  }

  const rows: any[] = [];
  for (const [userId, agg] of userAgg) {
    if (agg.regularCorrect === 15 && agg.regularTotal === 15 && agg.hotpickCorrect) {
      rows.push({
        user_id: userId,
        hardware_slug: "perfect_week",
        hardware_name: "Perfect Week",
        category: "weekly",
        scope: "platform",
        competition,
        season_year: seasonYear,
        week,
        pool_id: null,
        context_json: {
          correct: 15,
          total: 15,
          hotpick_rank: agg.hotpickRank,
          hotpick_team: agg.hotpickTeam,
          total_points: 15 + agg.hotpickRank,
          week,
          competition,
        },
      });
    }
  }

  return await upsertAwards(rows);
}

// ---------------------------------------------------------------------------
// SEASON-END AWARDS
// ---------------------------------------------------------------------------

async function computePoolChampion(competition: string, seasonYear: number) {
  return await computePodiumAward(competition, seasonYear, 1, "pool_champion", "Pool Champion");
}

async function computePodium(competition: string, seasonYear: number) {
  const r2 = await computePodiumAward(competition, seasonYear, 2, "podium_2nd", "Runner Up");
  const r3 = await computePodiumAward(competition, seasonYear, 3, "podium_3rd", "Third Place");
  return { second: r2, third: r3 };
}

async function computePodiumAward(
  competition: string, seasonYear: number,
  targetRank: number, slug: string, name: string
) {
  // Get all pools for this competition
  const { data: pools } = await supabase
    .from("pools")
    .select("id, name")
    .eq("competition", competition)
    .is("deleted_at", null);

  if (!pools) return { awarded: 0 };

  const { data: allMembers } = await supabase
    .from("pool_members")
    .select("user_id, pool_id")
    .eq("status", "active")
    .in("pool_id", pools.map(p => p.id));

  const { data: totals } = await supabase
    .from("season_user_totals")
    .select("user_id, week_points, is_hotpick_correct, hotpick_rank")
    .eq("competition", competition)
    .eq("phase", "REGULAR");

  if (!allMembers || !totals) return { awarded: 0 };

  // Sum points per user
  const userPoints = new Map<string, { total: number; hpWins: number; hpTotal: number; weeks: number }>();
  for (const t of totals) {
    if (!userPoints.has(t.user_id)) userPoints.set(t.user_id, { total: 0, hpWins: 0, hpTotal: 0, weeks: 0 });
    const u = userPoints.get(t.user_id)!;
    u.total += t.week_points ?? 0;
    u.weeks += 1;
    if (t.is_hotpick_correct === true) u.hpWins += 1;
    if (t.is_hotpick_correct !== null) u.hpTotal += 1;
  }

  const poolNameMap = new Map(pools.map(p => [p.id, p.name]));

  const rows: any[] = [];
  for (const pool of pools) {
    const poolMembers = allMembers.filter(m => m.pool_id === pool.id);
    const standings = poolMembers
      .map(m => ({
        userId: m.user_id,
        pts: userPoints.get(m.user_id)?.total ?? 0,
        hp: userPoints.get(m.user_id),
      }))
      .sort((a, b) => b.pts - a.pts);

    if (standings.length < targetRank) continue;
    const winner = standings[targetRank - 1];
    const hp = winner.hp;

    rows.push({
      user_id: winner.userId,
      hardware_slug: slug,
      hardware_name: name,
      category: "season",
      scope: "pool",
      competition,
      season_year: seasonYear,
      week: null,
      pool_id: pool.id,
      context_json: {
        final_rank: targetRank,
        final_points: winner.pts,
        pool_size: poolMembers.length,
        pool_name: poolNameMap.get(pool.id) ?? "",
        weeks_played: hp?.weeks ?? 0,
        hotpick_record: `${hp?.hpWins ?? 0}-${(hp?.hpTotal ?? 0) - (hp?.hpWins ?? 0)}`,
        competition,
      },
    });
  }

  return await upsertAwards(rows);
}

async function computeBiggestComeback(competition: string, seasonYear: number) {
  // Replay cumulative standings per pool per week, find largest rank swing
  const { data: pools } = await supabase
    .from("pools").select("id, name").eq("competition", competition).is("deleted_at", null);
  const { data: members } = await supabase
    .from("pool_members").select("user_id, pool_id").eq("status", "active")
    .in("pool_id", (pools ?? []).map(p => p.id));
  const { data: totals } = await supabase
    .from("season_user_totals").select("user_id, week, week_points")
    .eq("competition", competition).eq("phase", "REGULAR").order("week");

  if (!pools || !members || !totals) return { awarded: 0 };

  // Cumulative points per user per week
  const cumByUser = new Map<string, Map<number, number>>();
  for (const t of totals) {
    if (!cumByUser.has(t.user_id)) cumByUser.set(t.user_id, new Map());
    const prev = cumByUser.get(t.user_id)!;
    const lastWeek = t.week - 1;
    const prevPts = prev.get(lastWeek) ?? 0;
    prev.set(t.week, prevPts + (t.week_points ?? 0));
  }

  const poolNameMap = new Map(pools.map(p => [p.id, p.name]));
  const rows: any[] = [];

  for (const pool of pools) {
    const poolMemberIds = members.filter(m => m.pool_id === pool.id).map(m => m.user_id);
    if (poolMemberIds.length < 3) continue;

    // For each week, rank pool members by cumulative points
    const weeks = [...new Set(totals.map(t => t.week))].sort((a, b) => a - b);
    const maxWeek = weeks[weeks.length - 1];

    // Track worst rank and final rank per user
    const userRankHistory = new Map<string, { worstRank: number; worstWeek: number; finalRank: number; weeksPlayed: number }>();

    for (const w of weeks) {
      const weekStandings = poolMemberIds
        .map(uid => ({ uid, pts: cumByUser.get(uid)?.get(w) ?? 0 }))
        .sort((a, b) => b.pts - a.pts);

      for (let i = 0; i < weekStandings.length; i++) {
        const uid = weekStandings[i].uid;
        const rank = i + 1;
        if (!userRankHistory.has(uid)) {
          userRankHistory.set(uid, { worstRank: rank, worstWeek: w, finalRank: rank, weeksPlayed: 0 });
        }
        const h = userRankHistory.get(uid)!;
        if (rank > h.worstRank) {
          h.worstRank = rank;
          h.worstWeek = w;
        }
        if (w === maxWeek) h.finalRank = rank;
      }
    }

    // Count weeks played per user
    for (const uid of poolMemberIds) {
      const userWeeks = totals.filter(t => t.user_id === uid);
      const h = userRankHistory.get(uid);
      if (h) h.weeksPlayed = userWeeks.length;
    }

    // Find biggest comeback (min 6 weeks)
    let bestSwing = 0;
    let bestUsers: { uid: string; h: typeof userRankHistory extends Map<string, infer V> ? V : never }[] = [];

    for (const [uid, h] of userRankHistory) {
      if (h.weeksPlayed < 6) continue;
      const swing = h.worstRank - h.finalRank;
      if (swing > bestSwing) {
        bestSwing = swing;
        bestUsers = [{ uid, h }];
      } else if (swing === bestSwing && swing > 0) {
        bestUsers.push({ uid, h });
      }
    }

    for (const { uid, h } of bestUsers) {
      rows.push({
        user_id: uid,
        hardware_slug: "biggest_comeback",
        hardware_name: "Biggest Comeback",
        category: "season",
        scope: "pool",
        competition,
        season_year: seasonYear,
        week: null,
        pool_id: pool.id,
        context_json: {
          low_rank: h.worstRank,
          low_rank_week: h.worstWeek,
          final_rank: h.finalRank,
          rank_swing: h.worstRank - h.finalRank,
          pool_size: poolMemberIds.length,
          pool_name: poolNameMap.get(pool.id) ?? "",
        },
      });
    }
  }

  return await upsertAwards(rows);
}

async function computeIronPoolie(competition: string, seasonYear: number) {
  // is_no_show = false for all 18 regular season weeks. Per pool.
  const { data: totals } = await supabase
    .from("season_user_totals")
    .select("user_id, week, is_no_show")
    .eq("competition", competition)
    .eq("phase", "REGULAR");

  const { data: pools } = await supabase
    .from("pools").select("id, name").eq("competition", competition).is("deleted_at", null);
  const { data: members } = await supabase
    .from("pool_members").select("user_id, pool_id").eq("status", "active")
    .in("pool_id", (pools ?? []).map(p => p.id));

  if (!totals || !pools || !members) return { awarded: 0 };

  // Find users with 18 weeks, no no-shows
  const userWeeks = new Map<string, { submitted: number; total: number }>();
  for (const t of totals) {
    if (!userWeeks.has(t.user_id)) userWeeks.set(t.user_id, { submitted: 0, total: 0 });
    const u = userWeeks.get(t.user_id)!;
    u.total += 1;
    if (!t.is_no_show) u.submitted += 1;
  }

  const poolNameMap = new Map(pools.map(p => [p.id, p.name]));
  const rows: any[] = [];

  for (const [userId, stats] of userWeeks) {
    if (stats.submitted < 18 || stats.total < 18) continue;
    // Award per pool they're in
    const userMemberships = members.filter(m => m.user_id === userId);
    for (const m of userMemberships) {
      rows.push({
        user_id: userId,
        hardware_slug: "iron_poolie",
        hardware_name: "Iron Poolie",
        category: "season",
        scope: "pool",
        competition,
        season_year: seasonYear,
        week: null,
        pool_id: m.pool_id,
        context_json: {
          weeks_submitted: stats.submitted,
          weeks_possible: 18,
          participation_rate: 1.0,
          pool_name: poolNameMap.get(m.pool_id) ?? "",
        },
      });
    }
  }

  return await upsertAwards(rows);
}

async function computeSeasonSharpshooter(competition: string, seasonYear: number) {
  // Best regular pick win rate across full season. Min 15 weeks. Platform-wide.
  const picks = await fetchAll<{ user_id: string; is_correct: boolean; is_hotpick: boolean; week: number }>(
    "season_picks",
    q => q.select("user_id, is_correct, is_hotpick, week")
      .eq("competition", competition).eq("is_hotpick", false),
  );

  const userStats = new Map<string, { correct: number; total: number; weeks: Set<number> }>();
  for (const p of picks) {
    if (!userStats.has(p.user_id)) userStats.set(p.user_id, { correct: 0, total: 0, weeks: new Set() });
    const s = userStats.get(p.user_id)!;
    s.total += 1;
    s.weeks.add(p.week);
    if (p.is_correct) s.correct += 1;
  }

  let bestRate = 0;
  let winners: { userId: string; correct: number; total: number; weeks: number }[] = [];

  for (const [userId, stats] of userStats) {
    if (stats.weeks.size < 15) continue;
    const rate = Math.round((stats.correct / stats.total) * 1000) / 1000;
    if (rate > bestRate) {
      bestRate = rate;
      winners = [{ userId, correct: stats.correct, total: stats.total, weeks: stats.weeks.size }];
    } else if (rate === bestRate) {
      winners.push({ userId, correct: stats.correct, total: stats.total, weeks: stats.weeks.size });
    }
  }

  const rows = winners.map(w => ({
    user_id: w.userId,
    hardware_slug: "season_sharpshooter",
    hardware_name: "Season Sharpshooter",
    category: "season",
    scope: "platform",
    competition,
    season_year: seasonYear,
    week: null,
    pool_id: null,
    context_json: {
      correct: w.correct,
      total: w.total,
      pick_rate: bestRate,
      weeks_played: w.weeks,
      competition,
    },
  }));

  return await upsertAwards(rows);
}

async function computeHotPickArtist(competition: string, seasonYear: number) {
  // Best HotPick win rate. Min 15 HotPicks submitted. Platform-wide.
  const picks = await fetchAll<{ user_id: string; game_id: string; is_correct: boolean }>(
    "season_picks",
    q => q.select("user_id, game_id, is_correct")
      .eq("competition", competition).eq("is_hotpick", true),
  );

  // Get frozen_ranks for avg rank calc
  const gameIds = [...new Set(picks.map(p => p.game_id))];
  const { data: games } = await supabase
    .from("season_games").select("game_id, frozen_rank").in("game_id", gameIds);
  const rankMap = new Map((games ?? []).map(g => [g.game_id, g.frozen_rank ?? 0]));

  const userStats = new Map<string, { correct: number; total: number; rankSum: number }>();
  for (const p of picks) {
    if (!userStats.has(p.user_id)) userStats.set(p.user_id, { correct: 0, total: 0, rankSum: 0 });
    const s = userStats.get(p.user_id)!;
    s.total += 1;
    s.rankSum += rankMap.get(p.game_id) ?? 0;
    if (p.is_correct) s.correct += 1;
  }

  let bestRate = 0;
  let winners: { userId: string; correct: number; total: number; avgRank: number }[] = [];

  for (const [userId, stats] of userStats) {
    if (stats.total < 15) continue;
    const rate = Math.round((stats.correct / stats.total) * 1000) / 1000;
    const avgRank = Math.round((stats.rankSum / stats.total) * 10) / 10;
    if (rate > bestRate) {
      bestRate = rate;
      winners = [{ userId, correct: stats.correct, total: stats.total, avgRank }];
    } else if (rate === bestRate) {
      winners.push({ userId, correct: stats.correct, total: stats.total, avgRank });
    }
  }

  const rows = winners.map(w => ({
    user_id: w.userId,
    hardware_slug: "hotpick_artist",
    hardware_name: "HotPick Artist",
    category: "season",
    scope: "platform",
    competition,
    season_year: seasonYear,
    week: null,
    pool_id: null,
    context_json: {
      hotpick_correct: w.correct,
      hotpick_total: w.total,
      hotpick_rate: bestRate,
      avg_rank_chosen: w.avgRank,
      competition,
    },
  }));

  return await upsertAwards(rows);
}

async function computeSeasonTactician(competition: string, seasonYear: number) {
  // Rank 1-6 HotPick for 12+ weeks AND positive total points. Platform-wide.
  const picks = await fetchAll<{ user_id: string; game_id: string; is_correct: boolean; week: number }>(
    "season_picks",
    q => q.select("user_id, game_id, is_correct, week")
      .eq("competition", competition).eq("is_hotpick", true),
  );

  const gameIds = [...new Set(picks.map(p => p.game_id))];
  const { data: games } = await supabase
    .from("season_games").select("game_id, frozen_rank").in("game_id", gameIds);
  const rankMap = new Map((games ?? []).map(g => [g.game_id, g.frozen_rank ?? 0]));

  // User season totals
  const { data: totals } = await supabase
    .from("season_user_totals")
    .select("user_id, week_points, is_hotpick_correct")
    .eq("competition", competition)
    .eq("phase", "REGULAR");

  const userSeasonPts = new Map<string, { total: number; hpWins: number; hpTotal: number }>();
  for (const t of totals ?? []) {
    if (!userSeasonPts.has(t.user_id)) userSeasonPts.set(t.user_id, { total: 0, hpWins: 0, hpTotal: 0 });
    const u = userSeasonPts.get(t.user_id)!;
    u.total += t.week_points ?? 0;
    if (t.is_hotpick_correct === true) u.hpWins += 1;
    if (t.is_hotpick_correct !== null) u.hpTotal += 1;
  }

  // Count low-rank HotPick weeks per user
  const userLowRankWeeks = new Map<string, { count: number; rankSum: number; weeks: number }>();
  for (const p of picks) {
    const rank = rankMap.get(p.game_id) ?? 0;
    if (!userLowRankWeeks.has(p.user_id)) userLowRankWeeks.set(p.user_id, { count: 0, rankSum: 0, weeks: 0 });
    const u = userLowRankWeeks.get(p.user_id)!;
    u.weeks += 1;
    u.rankSum += rank;
    if (rank >= 1 && rank <= 6) u.count += 1;
  }

  const rows: any[] = [];
  for (const [userId, stats] of userLowRankWeeks) {
    if (stats.count < 12) continue;
    const seasonPts = userSeasonPts.get(userId);
    if (!seasonPts || seasonPts.total <= 0) continue;

    const avgRank = Math.round((stats.rankSum / stats.weeks) * 10) / 10;
    rows.push({
      user_id: userId,
      hardware_slug: "season_tactician",
      hardware_name: "The Tactician",
      category: "season",
      scope: "platform",
      competition,
      season_year: seasonYear,
      week: null,
      pool_id: null,
      context_json: {
        low_rank_hotpick_weeks: stats.count,
        avg_hotpick_rank: avgRank,
        season_total_points: seasonPts.total,
        hotpick_record: `${seasonPts.hpWins}-${seasonPts.hpTotal - seasonPts.hpWins}`,
        competition,
      },
    });
  }

  return await upsertAwards(rows);
}

// ---------------------------------------------------------------------------
// SHARED
// ---------------------------------------------------------------------------

// Active pool memberships scoped to ONE competition's (non-deleted) pools.
// Weekly award functions use this so (a) picks in competition X never map an
// award onto a user's pool in another competition, and (b) the member scan
// stays competition-bounded instead of reading every active membership on the
// platform. Mirrors the pool→member scoping the season-end functions already use.
async function activePoolMembers(competition: string): Promise<{ user_id: string; pool_id: string }[]> {
  const { data: pools } = await supabase
    .from("pools").select("id").eq("competition", competition).is("deleted_at", null);
  const poolIds = (pools ?? []).map((p: any) => p.id);
  if (poolIds.length === 0) return [];
  const { data: members } = await supabase
    .from("pool_members").select("user_id, pool_id").eq("status", "active").in("pool_id", poolIds);
  return members ?? [];
}

async function upsertAwards(rows: any[]) {
  if (rows.length === 0) return { awarded: 0 };

  let inserted = 0;
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("user_hardware")
      .upsert(chunk, { onConflict: "user_id,hardware_slug,competition,week,pool_id", ignoreDuplicates: true });
    if (!error) inserted += chunk.length;
  }
  return { awarded: inserted };
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
