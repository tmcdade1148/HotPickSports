import {create} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {DbSeasonPick, DbSeasonGame} from '@shared/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Week state machine: picks_open → locked → live → settling → complete */
export type WeekState =
  | 'picks_open'
  | 'locked'
  | 'live'
  | 'settling'
  | 'complete';

export interface GameScore {
  homeScore: number;
  awayScore: number;
  status: string;
  currentPeriod: number | null;
  gameClock: string | null;
}

export interface WeekResult {
  weekPoints: number;
  correctPicks: number;
  totalPicks: number;
  hotPickCorrect: boolean | null;
  rankDelta: number;
  newRank: number;
}

export interface Standing {
  userId: string;
  displayName: string;
  totalPoints: number;
  rank: number;
}

/** Pre-computed pick stats per game per pool (from game_pick_stats table) */
export interface GamePickStats {
  gameId: string;
  teamA: string;
  teamB: string;
  teamAPickCount: number;
  teamBPickCount: number;
  totalPicks: number;
  hotpickTeamACount: number;
  hotpickTeamBCount: number;
  hotpickTotal: number;
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface NFLState {
  competition: string;
  currentWeek: number;
  currentPhase: string;
  weekState: WeekState;
  picksDeadline: Date | null;
  /** When Week 1 picks open — drives PRE_SEASON "Picks open in:" countdown. */
  picksOpenAt: Date | null;
  /** Opening game kickoff date — drives PRE_SEASON "Season starts in:" countdown. */
  seasonOpenerAt: Date | null;
  /** First Sunday 1pm ET kickoff this week — all Sunday+ games lock at this time. */
  sundayLockAnchor: Date | null;
  userHotPick: DbSeasonPick | null;
  userHotPickGame: DbSeasonGame | null;
  liveScores: Record<string, GameScore>;
  weekResult: WeekResult | null;
  poolStandings: Standing[];

  // picks_open state data
  highestRankedGame: DbSeasonGame | null;
  weekFirstKickoff: Date | null;
  userPickCount: number;
  totalGamesThisWeek: number;

  // Standings data (for StandingsBadge)
  userSeasonTotal: number;
  userPoolRank: number | null;
  activePoolMemberCount: number;

  // ScoreModule data
  lastWeekNet: number | null; // null in Week 1

  // Game Day Engagement
  gamePickStats: Record<string, GamePickStats>; // gameId → stats for active pool
  pathBackNarrative: string | null; // computed narrative for current user
  hotPickGameStatus: 'pending' | 'live' | 'complete' | null;
  /** Kickoff time of the next scheduled game this week — drives gap countdown in the kickoff pill */
  nextKickoff: Date | null;

  // Actions
  initialize: (competition: string) => Promise<void>;
  setWeekState: (state: WeekState) => void;
  setCurrentWeek: (week: number) => void;
  setLiveScore: (gameId: string, score: GameScore) => void;
  setWeekResult: (result: WeekResult | null) => void;
  setPoolStandings: (standings: Standing[]) => void;
  fetchCompetitionConfig: () => Promise<void>;
  fetchUserHotPick: (userId: string) => Promise<void>;
  fetchHighestRankedGame: () => Promise<void>;
  fetchUserPickStatus: (userId: string) => Promise<void>;
  fetchPoolStandings: (userId: string, poolId: string) => Promise<void>;
  fetchUserSeasonScore: (userId: string) => Promise<void>;
  loadGamePickStats: (poolId: string) => Promise<void>;
  computePathBackNarrative: (userId: string) => void;
  fetchLiveScores: () => Promise<void>;
  fetchNextKickoff: () => Promise<void>;
  subscribeToGamePickStats: (poolId: string) => () => void;
  subscribeToLiveScores: () => () => void;
  subscribeToCompetitionConfig: () => () => void;
}

export const useNFLStore = create<NFLState>((set, get) => ({
  competition: 'nfl_2026',
  currentWeek: 1,
  currentPhase: 'REGULAR',
  weekState: 'picks_open',
  picksDeadline: null,
  picksOpenAt: null,
  seasonOpenerAt: null,
  sundayLockAnchor: null,
  userHotPick: null,
  userHotPickGame: null,
  liveScores: {},
  weekResult: null,
  poolStandings: [],

  // picks_open state data
  highestRankedGame: null,
  weekFirstKickoff: null,
  userPickCount: 0,
  totalGamesThisWeek: 0,

  // Standings data (for StandingsBadge)
  userSeasonTotal: 0,
  userPoolRank: null,
  activePoolMemberCount: 0,

  // ScoreModule data
  lastWeekNet: null,

  // Game Day Engagement
  gamePickStats: {},
  pathBackNarrative: null,
  hotPickGameStatus: null,
  nextKickoff: null,

  initialize: async (competition: string) => {
    const alreadyInitialized = get().competition === competition && get().currentWeek > 0;
    if (!alreadyInitialized) {
      // Full state reset on first init or competition change
      set({
        competition,
        userHotPickGame: null,
        liveScores: {},
        weekResult: null,
        poolStandings: [],
        highestRankedGame: null,
        weekFirstKickoff: null,
        userPickCount: 0,
        totalGamesThisWeek: 0,
        userSeasonTotal: 0,
        userPoolRank: null,
        activePoolMemberCount: 0,
        lastWeekNet: null,
        gamePickStats: {},
        pathBackNarrative: null,
        hotPickGameStatus: null,
      });
    }
    // Always fetch competition config — even when already initialized.
    // The store default values (competition: 'nfl_2026', currentWeek: 1) match
    // the skip guard, meaning fetchCompetitionConfig() was never called on first
    // app open. This left weekState stuck at the default 'picks_open' instead
    // of reading the actual DB state (e.g. 'live'). Fetching every time here
    // ensures weekState, currentWeek, and currentPhase are always fresh.
    await get().fetchCompetitionConfig();
    if (!alreadyInitialized) {
      await get().fetchHighestRankedGame();
    }
  },

  setWeekState: (weekState: WeekState) => set({weekState}),

  setCurrentWeek: (week: number) => set({currentWeek: week}),

  setLiveScore: (gameId, score) =>
    set(state => ({
      liveScores: {...state.liveScores, [gameId]: score},
    })),

  setWeekResult: result => set({weekResult: result}),

  setPoolStandings: standings => set({poolStandings: standings}),

  fetchCompetitionConfig: async () => {
    const {competition} = get();

    const {data: config} = await supabase
      .from('competition_config')
      .select('key, value')
      .eq('competition', competition);

    if (!config) {
      return;
    }

    const cfg: Record<string, unknown> = {};
    for (const row of config) {
      cfg[row.key] = row.value;
    }

    const currentWeek =
      typeof cfg.current_week === 'number' ? cfg.current_week : 1;

    // Derive weekState from config values
    let weekState: WeekState = 'picks_open';
    if (cfg.week_state && typeof cfg.week_state === 'string') {
      weekState = cfg.week_state as WeekState;
    }

    // Parse picks deadline if available
    let picksDeadline: Date | null = null;
    if (cfg.picks_deadline && typeof cfg.picks_deadline === 'string') {
      picksDeadline = new Date(cfg.picks_deadline);
    }

    // Parse PRE_SEASON countdown targets
    let picksOpenAt: Date | null = null;
    if (cfg.season_picks_open_at && typeof cfg.season_picks_open_at === 'string') {
      picksOpenAt = new Date(cfg.season_picks_open_at);
    }
    let seasonOpenerAt: Date | null = null;
    if (cfg.season_opener_date && typeof cfg.season_opener_date === 'string') {
      seasonOpenerAt = new Date(cfg.season_opener_date);
    }

    // Parse Sunday lock anchor — first Sunday 1pm ET kickoff this week
    let sundayLockAnchor: Date | null = null;
    if (cfg.sunday_lock_anchor && typeof cfg.sunday_lock_anchor === 'string') {
      sundayLockAnchor = new Date(cfg.sunday_lock_anchor);
    }

    // Parse current phase (REGULAR | PLAYOFFS | SUPERBOWL)
    const currentPhase =
      typeof cfg.current_phase === 'string' ? cfg.current_phase : 'REGULAR';

    set({currentWeek, weekState, picksDeadline, picksOpenAt, seasonOpenerAt, sundayLockAnchor, currentPhase});
  },

  fetchUserHotPick: async (userId: string) => {
    const {competition, currentWeek} = get();

    const {data: pick} = await supabase
      .from('season_picks')
      .select('*')
      .eq('user_id', userId)
      .eq('competition', competition)
      .eq('week', currentWeek)
      .eq('is_hotpick', true)
      .limit(1)
      .maybeSingle();

    set({userHotPick: (pick as DbSeasonPick) ?? null});

    // Fetch the game to get frozen_rank + team identifiers
    if (pick?.game_id) {
      const {data: game} = await supabase
        .from('season_games')
        .select('*')
        .eq('game_id', pick.game_id)
        .maybeSingle();

      set({userHotPickGame: (game as DbSeasonGame) ?? null});
    } else {
      set({userHotPickGame: null});
    }
  },

  fetchHighestRankedGame: async () => {
    const {competition, currentWeek, currentPhase} = get();

    const {data} = await supabase
      .from('season_games')
      .select('*')
      .eq('competition', competition)
      .eq('week', currentWeek)
      .not('frozen_rank', 'is', null)
      .order('frozen_rank', {ascending: false})
      .limit(1)
      .maybeSingle();

    set({highestRankedGame: (data as DbSeasonGame) ?? null});

    // Don't set weekFirstKickoff during PRE_SEASON — game kickoff_at values
    // are stale 2025 dates and would corrupt the countdown target logic.
    if (currentPhase === 'PRE_SEASON') return;

    // Fetch earliest kickoff this week for countdown
    const {data: earliest} = await supabase
      .from('season_games')
      .select('kickoff_at')
      .eq('competition', competition)
      .eq('week', currentWeek)
      .not('kickoff_at', 'is', null)
      .order('kickoff_at', {ascending: true})
      .limit(1)
      .maybeSingle();

    set({
      weekFirstKickoff: earliest?.kickoff_at
        ? new Date(earliest.kickoff_at)
        : null,
    });
  },

  fetchUserPickStatus: async (userId: string) => {
    const {competition, currentWeek} = get();

    // Fetch all games for this week (need status to compute effective total)
    const {data: games} = await supabase
      .from('season_games')
      .select('game_id, status')
      .eq('competition', competition)
      .eq('week', currentWeek);

    // Fetch this user's pick game IDs for this week
    const {data: picks} = await supabase
      .from('season_picks')
      .select('game_id')
      .eq('user_id', userId)
      .eq('competition', competition)
      .eq('week', currentWeek);

    const pickedGameIds = new Set((picks ?? []).map(p => p.game_id));
    const pickCount = pickedGameIds.size;

    // Effective total = picked games + games still scheduled (unpicked)
    // Unpicked games that are locked/in-progress/final are excluded — it's
    // impossible to pick them, so they shouldn't inflate the denominator
    // in messages like "15 of 16 picked".
    const scheduledUnpickedCount = (games ?? []).filter(
      g =>
        (g.status ?? '').toLowerCase() === 'scheduled' &&
        !pickedGameIds.has(g.game_id),
    ).length;

    set({
      userPickCount: pickCount,
      totalGamesThisWeek: pickCount + scheduledUnpickedCount,
    });
  },

  fetchPoolStandings: async (userId: string, poolId: string) => {
    const {competition, currentWeek, currentPhase, weekState} = get();
    const isPlayoffs = currentPhase !== 'REGULAR';
    // During an active week, exclude the current week's partial scores from
    // the season total. Points accumulate in WeekScoreModule separately.
    // Include the current week only once it's settling/complete (all games done).
    const weekInProgress =
      weekState === 'picks_open' || weekState === 'locked' || weekState === 'live';

    // 1. Get active pool member user IDs (pool-independent pattern)
    const {data: members} = await supabase
      .from('pool_members')
      .select('user_id')
      .eq('pool_id', poolId)
      .eq('status', 'active');

    const memberUserIds = members?.map(m => m.user_id) ?? [];
    set({activePoolMemberCount: memberUserIds.length});

    if (memberUserIds.length === 0) {
      set({poolStandings: [], userSeasonTotal: 0, userPoolRank: null});
      return;
    }

    // 2. Fetch season_user_totals filtered by current season phase
    //    Regular season and playoffs are separate leaderboards
    let query = supabase
      .from('season_user_totals')
      .select('user_id, week_points')
      .eq('competition', competition)
      .in('user_id', memberUserIds);

    if (isPlayoffs) {
      query = query.neq('phase', 'REGULAR');
    } else {
      query = query.eq('phase', 'REGULAR');
    }
    if (weekInProgress) {
      query = query.neq('week', currentWeek);
    }

    const {data: totalsData} = await query;

    // 3. Sum week_points per user for the current season phase
    const pointsByUser: Record<string, number> = {};
    for (const row of totalsData ?? []) {
      pointsByUser[row.user_id] =
        (pointsByUser[row.user_id] ?? 0) + (row.week_points ?? 0);
    }

    // 4. Fetch display names
    const {data: profiles} = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', memberUserIds);

    const nameMap: Record<string, string> = {};
    for (const p of profiles ?? []) {
      nameMap[p.id] = p.display_name ?? 'Poolie';
    }

    // 5. Build standings sorted by total points descending
    const standings: Standing[] = memberUserIds
      .map(uid => ({
        userId: uid,
        displayName: nameMap[uid] ?? 'Poolie',
        totalPoints: pointsByUser[uid] ?? 0,
        rank: 0, // assigned below
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((entry, idx) => ({...entry, rank: idx + 1}));

    set({poolStandings: standings});

    // 6. Find current user's standing
    const myStanding = standings.find(s => s.userId === userId);
    set({
      userSeasonTotal: myStanding?.totalPoints ?? 0,
      userPoolRank: myStanding?.rank ?? null,
    });
  },

  fetchUserSeasonScore: async (userId: string) => {
    const {competition, currentWeek, currentPhase, weekState} = get();
    const isPlayoffs = currentPhase !== 'REGULAR';
    // Exclude the current week's partial scores while games are in progress.
    // The season total reflects only completed weeks; WeekScoreModule shows
    // the current week's live earned points separately.
    const weekInProgress =
      weekState === 'picks_open' || weekState === 'locked' || weekState === 'live';

    // Pool-independent: query user's own season_user_totals
    // Filtered to current season phase (regular vs playoffs are separate)
    let query = supabase
      .from('season_user_totals')
      .select('week, week_points')
      .eq('user_id', userId)
      .eq('competition', competition);

    if (isPlayoffs) {
      query = query.neq('phase', 'REGULAR');
    } else {
      query = query.eq('phase', 'REGULAR');
    }
    if (weekInProgress) {
      query = query.neq('week', currentWeek);
    }

    const {data} = await query;

    // Sum week_points for the current season phase
    let total = 0;
    let lastWeekPoints: number | null = null;

    for (const row of data ?? []) {
      total += row.week_points ?? 0;
      if (row.week === currentWeek - 1) {
        lastWeekPoints = row.week_points ?? 0;
      }
    }

    // Determine if this is the first week of the current phase
    const phaseWeeks = (data ?? []).map(r => r.week).sort((a, b) => a - b);
    const isFirstWeekOfPhase =
      phaseWeeks.length === 0 || currentWeek <= (phaseWeeks[0] ?? currentWeek);

    set({
      userSeasonTotal: total,
      lastWeekNet: isFirstWeekOfPhase ? null : lastWeekPoints,
    });
  },

  // ---------------------------------------------------------------------------
  // Game Day Engagement
  // ---------------------------------------------------------------------------

  loadGamePickStats: async (poolId: string) => {
    const {competition, currentWeek} = get();

    const {data} = await supabase
      .from('game_pick_stats')
      .select('*')
      .eq('pool_id', poolId)
      .eq('competition', competition)
      .eq('week', currentWeek);

    if (!data) return;

    const stats: Record<string, GamePickStats> = {};
    for (const row of data) {
      stats[row.game_id] = {
        gameId: row.game_id,
        teamA: row.team_a,
        teamB: row.team_b,
        teamAPickCount: row.team_a_pick_count,
        teamBPickCount: row.team_b_pick_count,
        totalPicks: row.total_picks,
        hotpickTeamACount: row.hotpick_team_a_count,
        hotpickTeamBCount: row.hotpick_team_b_count,
        hotpickTotal: row.hotpick_total,
        computedAt: row.computed_at,
      };
    }
    set({gamePickStats: stats});
  },

  /**
   * Fetch current scores for all games this week and populate liveScores.
   * Call once on entering 'live' state; Realtime subscription handles updates.
   */
  fetchLiveScores: async () => {
    const {competition, currentWeek} = get();
    const {data} = await supabase
      .from('season_games')
      .select('game_id, home_score, away_score, current_period, game_clock, status')
      .eq('competition', competition)
      .eq('week', currentWeek)
      .in('status', ['IN_PROGRESS', 'LIVE', 'FINAL', 'COMPLETED', 'STATUS_FINAL']);

    const scores: Record<string, GameScore> = {};
    for (const row of data ?? []) {
      scores[row.game_id] = {
        homeScore: row.home_score ?? 0,
        awayScore: row.away_score ?? 0,
        currentPeriod: row.current_period ?? null,
        gameClock: row.game_clock ?? null,
        status: (row.status ?? '').toLowerCase(),
      };
    }
    set({liveScores: scores});
    await get().fetchNextKickoff();
  },

  /**
   * Fetch the kickoff time of the next scheduled game this week.
   * Called once when the week goes live and again whenever all in-progress
   * games finish (gap between game waves). Drives the gap countdown in the
   * kickoff pill.
   */
  fetchNextKickoff: async () => {
    const {competition, currentWeek} = get();
    const {data} = await supabase
      .from('season_games')
      .select('kickoff_at')
      .eq('competition', competition)
      .eq('week', currentWeek)
      .ilike('status', 'scheduled')
      .order('kickoff_at', {ascending: true})
      .limit(1)
      .maybeSingle();
    set({nextKickoff: data?.kickoff_at ? new Date(data.kickoff_at) : null});
  },

  /**
   * Subscribe to real-time updates on game_pick_stats for a pool.
   * Returns an unsubscribe function. Only call when weekState === 'live'.
   */
  subscribeToGamePickStats: (poolId: string) => {
    const channel = supabase
      .channel(`game-pick-stats-${poolId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_pick_stats',
          filter: `pool_id=eq.${poolId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!row) return;
          set(state => ({
            gamePickStats: {
              ...state.gamePickStats,
              [row.game_id]: {
                gameId: row.game_id,
                teamA: row.team_a,
                teamB: row.team_b,
                teamAPickCount: row.team_a_pick_count,
                teamBPickCount: row.team_b_pick_count,
                totalPicks: row.total_picks,
                hotpickTeamACount: row.hotpick_team_a_count,
                hotpickTeamBCount: row.hotpick_team_b_count,
                hotpickTotal: row.hotpick_total,
                computedAt: row.computed_at,
              },
            },
          }));
        },
      )
      .subscribe();

    // Return unsubscribe function
    return () => {
      supabase.removeChannel(channel);
    };
  },

  /**
   * Subscribe to real-time score updates on season_games for the current week.
   * Maps home_score/away_score/current_period/game_clock into liveScores.
   * Returns an unsubscribe function. Only call when weekState === 'live'.
   */
  subscribeToLiveScores: () => {
    const {competition, currentWeek} = get();
    const channel = supabase
      .channel(`live-scores-${competition}-week${currentWeek}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'season_games',
          filter: `competition=eq.${competition}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!row || row.week !== currentWeek) return;
          // If game reverted to scheduled (e.g. simulator reset), remove it from liveScores
          const status = (row.status ?? '').toLowerCase();
          if (status === 'scheduled' || status === 'pre') {
            set(state => {
              const next = {...state.liveScores};
              delete next[row.game_id];
              return {liveScores: next};
            });
            return;
          }
          const prevScores = get().liveScores;
          const updatedScores = {
            ...prevScores,
            [row.game_id]: {
              homeScore: row.home_score ?? 0,
              awayScore: row.away_score ?? 0,
              currentPeriod: row.current_period ?? null,
              gameClock: row.game_clock ?? null,
              status,
            },
          };
          // Also keep userHotPickGame in sync — LiveCard reads .status off it
          // to determine isHotPickFinal, which won't update otherwise.
          const {userHotPickGame} = get();
          const nextState: Partial<NFLState> = {liveScores: updatedScores};
          if (userHotPickGame && userHotPickGame.game_id === row.game_id) {
            nextState.userHotPickGame = {
              ...userHotPickGame,
              status: row.status ?? userHotPickGame.status,
              home_score: row.home_score ?? userHotPickGame.home_score,
              away_score: row.away_score ?? userHotPickGame.away_score,
              winner_team: row.winner_team ?? userHotPickGame.winner_team,
              current_period: row.current_period ?? null,
              game_clock: row.game_clock ?? null,
            };
          }
          set(nextState);
          // When the last in-progress game goes final, refresh the next scheduled kickoff
          // so the kickoff pill can show a gap countdown to the next wave.
          const wasAnyLive = Object.values(prevScores).some(
            s => s.status === 'in_progress' || s.status === 'live',
          );
          const isAnyLive = Object.values(updatedScores).some(
            s => s.status === 'in_progress' || s.status === 'live',
          );
          if (wasAnyLive && !isAnyLive) {
            get().fetchNextKickoff();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  /**
   * Subscribe to competition_config changes so week_state and current_phase
   * updates (e.g. from the season simulator) propagate to the app instantly
   * without requiring a reload. Returns an unsubscribe function.
   */
  subscribeToCompetitionConfig: () => {
    const {competition} = get();
    const channel = supabase
      .channel(`competition-config-${competition}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'competition_config',
          filter: `competition=eq.${competition}`,
        },
        () => {
          // Re-fetch config first, then clear stale per-user data so
          // SeasonEventCard's useEffects re-fetch based on the new state.
          // This handles simulator resets and admin phase transitions.
          get().fetchCompetitionConfig();
          set({
            userHotPick: null,
            userHotPickGame: null,
            userPickCount: 0,
            weekResult: null,
            poolStandings: [],
            liveScores: {},
            highestRankedGame: null,
            weekFirstKickoff: null,
            sundayLockAnchor: null,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  /**
   * Compute path back narrative for the current user.
   * Client-side display logic only — no scoring decisions made here.
   * Uses poolStandings + userHotPick + userHotPickGame from store.
   */
  computePathBackNarrative: (userId: string) => {
    const {poolStandings, userHotPick, userHotPickGame, liveScores} = get();

    // No HotPick designated or game already settled → no narrative
    if (!userHotPick || !userHotPickGame) {
      set({pathBackNarrative: null, hotPickGameStatus: null});
      return;
    }

    const gameStatus = userHotPickGame.status?.toLowerCase() ?? '';
    const isFinal = gameStatus.includes('final');
    const isLive = gameStatus === 'live';
    const isPending = gameStatus === 'scheduled' || gameStatus === 'pre';

    if (isFinal) {
      // Game settled — check if user won their HotPick
      const rank = userHotPickGame.frozen_rank ?? userHotPickGame.rank ?? 1;
      const winnerTeam = userHotPickGame.winner_team;
      const pickedTeam = userHotPick.picked_team;
      const won = winnerTeam === pickedTeam;

      if (won) {
        // Find how many spots user gained
        const myStanding = poolStandings.find(s => s.userId === userId);
        const gamesStillLive = Object.values(liveScores).filter(
          s => s.status === 'live' || s.status === 'in_progress',
        ).length;

        if (myStanding && myStanding.rank === 1) {
          set({
            pathBackNarrative: `Your HotPick hit. +${rank} pts.${gamesStillLive > 0 ? ` ${gamesStillLive} game${gamesStillLive !== 1 ? 's' : ''} still live.` : ''}`,
            hotPickGameStatus: 'complete',
          });
        } else {
          set({
            pathBackNarrative: `Your HotPick hit! +${rank} pts.`,
            hotPickGameStatus: 'complete',
          });
        }
      } else {
        // Lost — don't rub it in. No narrative.
        set({pathBackNarrative: null, hotPickGameStatus: 'complete'});
      }
      return;
    }

    const rank = userHotPickGame.frozen_rank ?? userHotPickGame.rank ?? 1;
    const team = userHotPick.picked_team ?? '';

    // Find user's current rank
    const currentRankIdx = poolStandings.findIndex(s => s.userId === userId);
    if (currentRankIdx < 0) {
      set({pathBackNarrative: null, hotPickGameStatus: isLive ? 'live' : 'pending'});
      return;
    }

    const currentPts = poolStandings[currentRankIdx].totalPoints;
    const winPts = currentPts + rank;

    // Simulate win: count how many spots user would jump
    const simulated = poolStandings
      .map(s => (s.userId === userId ? {...s, totalPoints: winPts} : s))
      .sort((a, b) => b.totalPoints - a.totalPoints);
    const winRankIdx = simulated.findIndex(s => s.userId === userId);
    const spotsGained = currentRankIdx - winRankIdx;

    if (isLive) {
      set({
        pathBackNarrative:
          spotsGained > 0
            ? `Your HotPick on ${team} is live. Win: +${rank} pts, you jump ${spotsGained} spot${spotsGained !== 1 ? 's' : ''}.`
            : `Your HotPick on ${team} is live. Win: +${rank} pts.`,
        hotPickGameStatus: 'live',
      });
    } else if (isPending) {
      const personAbove = currentRankIdx > 0 ? poolStandings[currentRankIdx - 1] : null;

      if (personAbove) {
        const gapAfterWin = personAbove.totalPoints - winPts;
        const narrative =
          gapAfterWin <= 0
            ? `Your HotPick (${team}, Rank ${rank}) kicks off soon. A win puts you ahead of ${personAbove.displayName}.`
            : `Your HotPick (${team}, Rank ${rank}) kicks off soon. A win puts you ${gapAfterWin} pt${gapAfterWin !== 1 ? 's' : ''} behind ${personAbove.displayName}.`;
        set({pathBackNarrative: narrative, hotPickGameStatus: 'pending'});
      } else {
        // User is in 1st — no "path back" needed, but show confidence
        set({
          pathBackNarrative: `You're leading. Your HotPick (${team}, Rank ${rank}) kicks off soon.`,
          hotPickGameStatus: 'pending',
        });
      }
    } else {
      set({pathBackNarrative: null, hotPickGameStatus: null});
    }
  },
}));
