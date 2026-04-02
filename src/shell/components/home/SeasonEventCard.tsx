import React, {useEffect, useMemo, useCallback} from 'react';
import {useFocusEffect, useNavigation} from '@react-navigation/native';

// ---------------------------------------------------------------------------
// Lock display helpers
// ---------------------------------------------------------------------------

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Thursday" from a Date */
function formatLockDay(date: Date): string {
  return DAYS[date.getDay()];
}

/** "8:20 PM" from a Date */
function formatLockTime(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const minStr = minutes < 10 ? `0${minutes}` : String(minutes);
  return `${hours}:${minStr} ${ampm}`;
}
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {ChevronDown, MessageCircle} from 'lucide-react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {supabase} from '@shared/config/supabase';
import type {SeasonConfig} from '@shared/types/templates';
import type {DbPool} from '@shared/types/database';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {PicksOpenCard} from './PicksOpenCard';
import {LockedCard} from './LockedCard';
import {LiveCard} from './LiveCard';
import {SettlingCard} from './SettlingCard';
import {CompleteCard} from './CompleteCard';
import {CardFooter} from './CardFooter';
import {WeekScoreModule} from './WeekScoreModule';
import {LastWeekRecap} from './LastWeekRecap';
import {useTheme, useBrand} from '@shell/theme';
import {useCountdown} from '@shared/hooks/useCountdown';

interface SeasonEventCardProps {
  config: SeasonConfig;
  /** Navigate to EventDetail for this event (drives CTA button) */
  onNavigateToEvent?: () => void;
}

/**
 * SeasonEventCard — Smart Home Screen card for season-template events.
 *
 * Responsibilities:
 *   1. Initializes nflStore with competition config on mount
 *   2. Fetches user pick status when weekState is picks_open
 *   3. Computes pool-scoped "poolies submitted" count via local state
 *   4. Subscribes to Realtime for live updates during picks_open
 *   5. Renders CardHeader with pool switcher + week/phase label
 *   6. Dispatches to the correct week-state sub-component
 */
export function SeasonEventCard({config, onNavigateToEvent}: SeasonEventCardProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  // ── Store subscriptions ──────────────────────────────────────────────
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const picksDeadline = useNFLStore(s => s.picksDeadline);
  const userHotPick = useNFLStore(s => s.userHotPick);
  const userHotPickGame = useNFLStore(s => s.userHotPickGame);
  const liveScores = useNFLStore(s => s.liveScores);
  const weekResult = useNFLStore(s => s.weekResult);
  const poolStandings = useNFLStore(s => s.poolStandings);
  const highestRankedGame = useNFLStore(s => s.highestRankedGame);
  const weekFirstKickoff = useNFLStore(s => s.weekFirstKickoff);
  const picksOpenAt = useNFLStore(s => s.picksOpenAt);
  const seasonOpenerAt = useNFLStore(s => s.seasonOpenerAt);
  const sundayLockAnchor = useNFLStore(s => s.sundayLockAnchor);
  const userPickCount = useNFLStore(s => s.userPickCount);
  const totalGamesThisWeek = useNFLStore(s => s.totalGamesThisWeek);
  const isWeekComplete = useSeasonStore(s => s.isWeekComplete);
  const seasonGames = useSeasonStore(s => s.games);
  const fetchWeekGames = useSeasonStore(s => s.fetchWeekGames);
  const userSeasonTotal = useNFLStore(s => s.userSeasonTotal);
  const nextKickoff = useNFLStore(s => s.nextKickoff);

  const initialize = useNFLStore(s => s.initialize);
  const fetchUserPickStatus = useNFLStore(s => s.fetchUserPickStatus);
  const fetchUserHotPick = useNFLStore(s => s.fetchUserHotPick);
  const fetchPoolStandings = useNFLStore(s => s.fetchPoolStandings);
  const fetchUserSeasonScore = useNFLStore(s => s.fetchUserSeasonScore);
  const fetchLiveScores = useNFLStore(s => s.fetchLiveScores);
  const subscribeToLiveScores = useNFLStore(s => s.subscribeToLiveScores);
  const subscribeToCompetitionConfig = useNFLStore(s => s.subscribeToCompetitionConfig);

  const userId = useGlobalStore(s => s.user?.id ?? null);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const userPools = useGlobalStore(s => s.visiblePools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);
  // Subscribe to manualGlobalJoins so isPoolVisible re-evaluates on load
  useGlobalStore(s => s.manualGlobalJoins);

  const activePool = userPools.find(p => p.id === activePoolId);

  // ── 1. Initialize nflStore on mount ──────────────────────────────────
  useEffect(() => {
    initialize(config.competition);
  }, [config.competition, initialize]);

  // ── 1b. Always-on competition_config subscription ────────────────────
  // Re-fetches week_state + current_phase whenever the simulator (or admin)
  // updates competition_config — no app reload needed to see phase changes.
  useEffect(() => {
    const unsub = subscribeToCompetitionConfig();
    return unsub;
  }, [subscribeToCompetitionConfig]);

  // ── 2a. Fetch pool standings for StandingsBadge ───────────────────────
  // Also depends on weekState: the season total excludes the current week
  // while games are in progress, and includes it once the week is settling/complete.
  useEffect(() => {
    if (userId && activePoolId && currentPhase !== 'PRE_SEASON') {
      fetchPoolStandings(userId, activePoolId);
    }
  }, [userId, activePoolId, currentPhase, weekState, fetchPoolStandings]);

  // ── 2b. Fetch pool-independent season score for ScoreModule ──────────
  useEffect(() => {
    if (userId) {
      fetchUserSeasonScore(userId);
    }
  }, [userId, currentPhase, weekState, fetchUserSeasonScore]);

  // ── 3. Fetch user pick status + HotPick when picks are relevant ───────
  useEffect(() => {
    if (!userId || !weekState) {
      return;
    }
    // Need HotPick data during picks_open (for the card preview) and during
    // live/settling (for LiveCard and SettlingCard to display the game)
    if (weekState === 'picks_open' || weekState === 'live' || weekState === 'settling') {
      fetchUserHotPick(userId);
    }
    // Fetch pick count during picks_open AND live — picks are still open for
    // individual games until their lock_at, so the incomplete-picks warning
    // must stay accurate throughout the live state.
    if (weekState === 'picks_open' || weekState === 'live') {
      fetchUserPickStatus(userId);
    }
  }, [weekState, userId, currentWeek, fetchUserPickStatus, fetchUserHotPick]);

  // ── 3b. Fetch season games for lock detection on Home Screen ─────
  useEffect(() => {
    if (weekState === 'picks_open' || weekState === 'live' || weekState === 'settling') {
      fetchWeekGames(currentWeek);
    }
  }, [weekState, currentWeek, fetchWeekGames]);

  // ── 3c. Re-fetch pick status + HotPick + season games on Home tab focus ──
  useFocusEffect(
    useCallback(() => {
      if (userId && (weekState === 'picks_open' || weekState === 'live')) {
        fetchUserPickStatus(userId);
        fetchUserHotPick(userId);
      }
      if (weekState === 'picks_open' || weekState === 'live' || weekState === 'settling') {
        fetchWeekGames(currentWeek);
      }
    }, [userId, weekState, currentWeek, fetchUserPickStatus, fetchUserHotPick, fetchWeekGames]),
  );

  // ── 4. Realtime subscription for picks_open state ────────────────────
  useEffect(() => {
    if (weekState !== 'picks_open' || !activePoolId) {
      return;
    }

    const channel = supabase
      .channel(`season_picks:${config.competition}:week${currentWeek}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'season_picks',
          filter: `competition=eq.${config.competition}`,
        },
        () => {
          if (userId) {
            fetchUserPickStatus(userId);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    weekState,
    activePoolId,
    config.competition,
    currentWeek,
    userId,
    fetchUserPickStatus,
  ]);

  // ── 4b. Subscribe to season_games changes (lock_at, status) so the
  //        Home screen sees lock state updates without switching tabs ────
  const subscribeToGameScores = useSeasonStore(s => s.subscribeToGameScores);
  useEffect(() => {
    if (weekState !== 'live' && weekState !== 'settling') return;
    const unsub = subscribeToGameScores();
    return unsub;
  }, [weekState, subscribeToGameScores]);

  // ── 5. Live score fetch + Realtime subscription during 'live' ────────
  useEffect(() => {
    if (weekState !== 'live') return;
    fetchLiveScores();
    const unsub = subscribeToLiveScores();
    return unsub;
  }, [weekState, fetchLiveScores, subscribeToLiveScores]);

  // ── Kickoff countdown ──────────────────────────────────────────────
  // In PRE_SEASON, always count down to picks opening — never use weekFirstKickoff
  // (those are stale game data dates, not the real season opener).
  // Source priority: competition_config.season_picks_open_at → config.picksOpenDate fallback.
  // During active weeks, count down to first kickoff.
  const countdownTarget = useMemo(() => {
    if (currentPhase === 'PRE_SEASON') {
      if (picksOpenAt) return picksOpenAt;
      if (config.picksOpenDate) return new Date(config.picksOpenDate);
      return null;
    }
    return weekFirstKickoff;
  }, [currentPhase, weekFirstKickoff, picksOpenAt, config.picksOpenDate]);
  const kickoff = useCountdown(countdownTarget);

  // Kickoff countdown (first game of the week)
  const firstGameKickoff = useCountdown(weekFirstKickoff);

  // PRE_SEASON secondary countdown — opening game kickoff
  const seasonOpenerCountdown = useCountdown(
    currentPhase === 'PRE_SEASON' ? seasonOpenerAt : null,
  );

  // Sunday 1pm ET lock anchor countdown — drives Phase 2/3 locking info
  const sundayLockCountdown = useCountdown(
    weekState === 'picks_open' ? sundayLockAnchor : null,
  );

  // ── Navigation for SmackTalk CTA ─────────────────────────────────
  const navigation = useNavigation<any>();

  // How many games are currently in progress this week?
  const liveGameCount = useMemo(
    () => Object.values(liveScores).filter(
      s => s.status === 'in_progress' || s.status === 'live',
    ).length,
    [liveScores],
  );
  const anyGameLive = liveGameCount > 0;

  // Countdown to next game kickoff (shown during gaps between game waves)
  const nextKickoffCountdown = useCountdown(weekState === 'live' ? nextKickoff : null);

  // Is the user's HotPick game currently in progress?
  const isHotPickGameLive = useMemo(() => {
    if (!userHotPickGame) return false;
    const status = (userHotPickGame.status ?? '').toUpperCase();
    return status === 'IN_PROGRESS' || status === 'LIVE';
  }, [userHotPickGame?.status]);

  // Short name for the user's HotPick team (e.g. "Chiefs")
  const hotPickTeamName = useMemo(() => {
    if (!userHotPick?.picked_team) return null;
    const team = config.teams.find(t => t.code === userHotPick.picked_team);
    return team?.shortName ?? userHotPick.picked_team;
  }, [userHotPick?.picked_team, config.teams]);

  const handleSmackTalkPress = useCallback(() => {
    navigation.navigate('SmackTalkTab' as never);
  }, [navigation]);

  // ── Glow color: partner secondary or HotPick teal ─────────────────
  const isBranded = !!(activePool?.brand_config as any)?.is_branded;
  const glowColor = isBranded
    ? (activePool?.brand_config as any)?.secondary_color || '#0E6666'
    : '#0E6666';

  return (
    <View style={styles.outerWrapper}>
      {/* Score + Kickoff pills row */}
      <View style={styles.pillRow}>
        {/* Score pill */}
        <View style={styles.scorePill}>
          <Text style={styles.scoreTotalLabel}>Season Total</Text>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreValue}>
              {userSeasonTotal ?? 0}
            </Text>
            <Text style={styles.scorePtsLabel}>pts</Text>
          </View>
        </View>

        {/* Kickoff pill */}
        {(kickoff.timeLeft || weekState === 'settling' || weekState === 'complete') && (
          <View style={styles.kickoffPill}>
            <View style={{flex: 1}}>
              {currentPhase === 'PRE_SEASON' ? (
                <>
                  {kickoff.timeLeft && !kickoff.hasExpired && (
                    <>
                      <Text style={styles.kickoffLabel}>Picks open in:</Text>
                      <Text style={styles.kickoffValue}>{kickoff.timeLeft}</Text>
                    </>
                  )}
                  {seasonOpenerCountdown.timeLeft && !seasonOpenerCountdown.hasExpired && (
                    <View style={[styles.subCountdownRow, {marginTop: kickoff.hasExpired ? 0 : spacing.xs}]}>
                      <Text style={styles.subCountdownLabel}>Season starts in:</Text>
                      <Text style={styles.subCountdownValue}>{seasonOpenerCountdown.timeLeft}</Text>
                    </View>
                  )}
                </>
              ) : weekState === 'picks_open' ? (
                <>
                  <Text style={styles.kickoffLabel}>
                    PICKS are <Text style={{fontWeight: '900', color: '#1b9a06'}}>LIVE!</Text>
                  </Text>
                  {weekFirstKickoff && !firstGameKickoff.hasExpired ? (
                    // Phase 1: first game hasn't locked yet
                    <>
                      <Text style={styles.lockInfoLine}>
                        {formatLockDay(weekFirstKickoff)}'s game locks at {formatLockTime(weekFirstKickoff)}
                      </Text>
                      {sundayLockAnchor && !sundayLockCountdown.hasExpired && (
                        <Text style={styles.lockInfoLine}>Sunday games lock at 1pm ET</Text>
                      )}
                    </>
                  ) : sundayLockAnchor && !sundayLockCountdown.hasExpired ? (
                    sundayLockCountdown.isUrgent ? (
                      // Phase 3: < 2h — bold red countdown
                      <View style={styles.subCountdownRow}>
                        <Text style={[styles.subCountdownLabel, styles.lockUrgent]}>
                          Remaining games lock in:
                        </Text>
                        <Text style={[styles.subCountdownValue, styles.lockUrgent]}>
                          {sundayLockCountdown.timeLeft}
                        </Text>
                      </View>
                    ) : (
                      // Phase 2: > 2h — show clock time
                      <Text style={styles.lockInfoLine}>
                        Remaining games lock at {formatLockTime(sundayLockAnchor)}
                      </Text>
                    )
                  ) : null}
                </>
              ) : weekState === 'locked' ? (
                <Text style={styles.kickoffLabel}>Picks are locked</Text>
              ) : weekState === 'live' ? (
                <>
                  {anyGameLive ? (
                    /* One or more games in progress */
                    <>
                      {isHotPickGameLive && hotPickTeamName ? (
                        <>
                          <Text style={[styles.kickoffLabel, {color: '#1b9a06', fontWeight: '700', fontStyle: 'italic'}]}>YOUR HOTPICK IS LIVE</Text>
                          <TouchableOpacity onPress={handleSmackTalkPress} activeOpacity={0.7}>
                            <Text style={styles.lockInfoLine}>
                              {'The '}
                              <Text style={{fontWeight: '700', color: colors.textPrimary}}>{hotPickTeamName}</Text>
                              {' are playing — talk smack →'}
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <Text style={[styles.kickoffLabel, {color: '#1b9a06', fontWeight: '700', fontStyle: 'italic'}]}>{liveGameCount === 1 ? 'GAME IN PROGRESS' : 'GAMES IN PROGRESS'}</Text>
                          <TouchableOpacity onPress={handleSmackTalkPress} activeOpacity={0.7}>
                            <Text style={styles.lockInfoLine}>{'Get into SmackTalk →'}</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  ) : nextKickoffCountdown.timeLeft && !nextKickoffCountdown.hasExpired ? (
                    /* Gap between game waves — countdown to next kickoff */
                    <>
                      <Text style={styles.kickoffLabel}>Next kickoff in:</Text>
                      <Text style={[styles.kickoffValue, {color: colors.textPrimary}]}>{nextKickoffCountdown.timeLeft}</Text>
                      <TouchableOpacity onPress={handleSmackTalkPress} activeOpacity={0.7}>
                        <Text style={styles.lockInfoLine}>{'While you wait — talk smack →'}</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    /* No live games and no valid countdown — between waves (sim) or week wrapping up */
                    <>
                      <Text style={[styles.kickoffLabel, {color: colors.textSecondary}]}>
                        {nextKickoff ? 'More games ahead' : 'Week wrapping up'}
                      </Text>
                      <TouchableOpacity onPress={handleSmackTalkPress} activeOpacity={0.7}>
                        <Text style={styles.lockInfoLine}>{'Get into SmackTalk →'}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              ) : weekState === 'settling' || weekState === 'complete' ? (
                <>
                  <Text style={styles.kickoffLabel}>WEEK {currentWeek} IS COMPLETE</Text>
                  <Text style={styles.lockInfoLine}>Week {currentWeek + 1} picks go live in the morning.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.kickoffLabel}>Picks go LIVE in:</Text>
                  {!kickoff.hasExpired && (
                    <Text style={styles.kickoffValue}>{kickoff.timeLeft}</Text>
                  )}
                </>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Week Score — between pills and week state card (hidden in PRE_SEASON) */}
      {currentPhase !== 'PRE_SEASON' && <WeekScoreModule />}

      {/* HotPick game card — above the picks card (hidden in PRE_SEASON) */}
      {currentPhase !== 'PRE_SEASON' && weekState === 'picks_open' && userHotPick && userHotPickGame && (
        <LiveCard
          currentWeek={currentWeek}
          userHotPick={userHotPick}
          userHotPickGame={userHotPickGame}
          liveScores={liveScores}
        />
      )}

      {/* Week state content — outside the card box (hidden in PRE_SEASON) */}
      {currentPhase !== 'PRE_SEASON' && renderWeekState({
        weekState,
        currentWeek,
        picksDeadline,
        userHotPick,
        userHotPickGame,
        liveScores,
        weekResult,
        poolStandings,
        userId,
        totalWeeks: config.totalWeeks,
        highestRankedGame,
        weekFirstKickoff,
        userHasSubmitted: userPickCount > 0,
        userPickCount,
        totalGames: totalGamesThisWeek,
        sundayLockAnchor,
        seasonGames,
        hotPickTeamName,
        isWeekComplete,
        teams: config.teams,
        onMakePicks: onNavigateToEvent ?? (() => {}),
        weekLabelColor: isBranded
          ? (activePool?.brand_config as any)?.highlight_color || undefined
          : undefined,
      })}

      {/* Pool Switcher moved to shared PoolSwitcherBar in MainTabNavigator */}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Week state renderer — dispatches to the correct sub-component
// ---------------------------------------------------------------------------

function renderWeekState(props: {
  weekState: string;
  currentWeek: number;
  picksDeadline: Date | null;
  userHotPick: any;
  userHotPickGame: any;
  liveScores: Record<string, any>;
  weekResult: any;
  poolStandings: any[];
  userId: string | null;
  totalWeeks: number;
  highestRankedGame: any;
  weekFirstKickoff: Date | null;
  userHasSubmitted: boolean;
  userPickCount: number;
  totalGames: number;
  sundayLockAnchor: Date | null;
  seasonGames: any[];
  hotPickTeamName: string | null;
  isWeekComplete: boolean;
  teams: any[];
  onMakePicks: () => void;
  weekLabelColor?: string;
}) {
  switch (props.weekState) {
    case 'picks_open':
      return (
        <>
        {props.currentWeek > 1 && <LastWeekRecap teams={props.teams} />}
        <PicksOpenCard
          deadline={props.picksDeadline}
          currentWeek={props.currentWeek}
          highestRankedGame={props.highestRankedGame}
          weekFirstKickoff={props.weekFirstKickoff}
          userHasSubmitted={props.userHasSubmitted}
          userPickCount={props.userPickCount}
          totalGames={props.totalGames}
          isWeekComplete={props.isWeekComplete}
          weekLabelColor={props.weekLabelColor}
          onMakePicks={props.onMakePicks}
        />
        </>
      );
    case 'locked':
      return <LockedCard currentWeek={props.currentWeek} />;
    case 'live': {
      const livePicksComplete = props.totalGames > 0 && props.userPickCount >= props.totalGames;
      const liveHasPartialPicks = props.userHasSubmitted && !livePicksComplete;
      // All games lock once the Sunday 1pm ET wave kicks off.
      // 1. sundayLockAnchor from competition_config (production — set by nfl-open-picks)
      // 2. Wave-lock from seasonGames + liveScores (simulator fallback — no anchor set)
      // 3. All games have liveScores entries (every game is live or final)
      const allGamesLocked = (() => {
        // Strategy 1: sundayLockAnchor (most reliable — production path)
        if (props.sundayLockAnchor != null && Date.now() >= props.sundayLockAnchor.getTime()) {
          return true;
        }
        // Strategy 2: check every game individually — lock_at passed, or active status
        const games = props.seasonGames;
        if (games.length > 0) {
          const now = Date.now();
          const isActiveFn = (s: string) => {
            const u = s.toUpperCase();
            return u === 'IN_PROGRESS' || u === 'LIVE' || u === 'FINAL' || u === 'STATUS_FINAL' || u === 'COMPLETED';
          };
          const getStatus = (g: any) => {
            const live = props.liveScores[g.game_id];
            return live?.status ?? g.status ?? '';
          };
          const allLocked = games.every(g => {
            if (isActiveFn(getStatus(g))) return true;
            if (g.lock_at && new Date(g.lock_at).getTime() <= now) return true;
            return false;
          });
          if (allLocked) return true;
        }
        // Strategy 3: every game has a liveScores entry
        if (props.totalGames > 0 && Object.keys(props.liveScores).length >= props.totalGames) {
          return true;
        }
        return false;
      })();
      return (
        <>
          <LiveCard
            currentWeek={props.currentWeek}
            userHotPick={props.userHotPick}
            userHotPickGame={props.userHotPickGame}
            liveScores={props.liveScores}
          />
          <CardFooter
            label={
              allGamesLocked
                ? 'All Games Are Locked'
                : !props.userHasSubmitted
                  ? 'Make Your Picks'
                  : livePicksComplete
                    ? 'Edit Your Picks'
                    : 'Finish Your Picks'
            }
            secondaryLabel={
              livePicksComplete
                ? 'Your picks are in \u2713'
                : liveHasPartialPicks
                  ? `${props.userPickCount} of ${props.totalGames} picked — games are live!`
                  : undefined
            }
            secondaryColor={livePicksComplete ? '#1b9a06' : '#F5C842'}
            secondaryLarge={livePicksComplete}
            onPress={props.onMakePicks}
            disabled={allGamesLocked}
          />
        </>
      );
    }
    case 'settling':
      return (
        <>
          {/* Keep the HotPick game module visible until the week is fully done */}
          {props.userHotPick && props.userHotPickGame && (
            <LiveCard
              currentWeek={props.currentWeek}
              userHotPick={props.userHotPick}
              userHotPickGame={props.userHotPickGame}
              liveScores={props.liveScores}
            />
          )}
          <SettlingCard
            currentWeek={props.currentWeek}
            weekResult={props.weekResult}
          />
        </>
      );
    case 'complete':
      return (
        <>
          {props.userHotPick && props.userHotPickGame && (
            <LiveCard
              currentWeek={props.currentWeek}
              userHotPick={props.userHotPick}
              userHotPickGame={props.userHotPickGame}
              liveScores={props.liveScores}
            />
          )}
          <SettlingCard
            currentWeek={props.currentWeek}
            weekResult={props.weekResult}
          />
        </>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Pool Switcher Button — prominent pill below week state content
// ---------------------------------------------------------------------------

// PoolSwitcherButton removed — unified in PoolSwitcherBar

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (colors: any) => StyleSheet.create({
  outerWrapper: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  pillRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  scorePill: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  scoreTotalLabel: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  scorePtsLabel: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  kickoffPill: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  kickoffIcon: {
    fontSize: 24,
  },
  kickoffLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  kickoffValue: {
    ...typography.h3,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: 2,
  },
  subCountdownRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  subCountdownLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
  subCountdownValue: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  lockInfoLine: {
    ...typography.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 3,
  },
  lockUrgent: {
    color: colors.error,
    fontWeight: '700',
  },
  hotPickCard: {
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 8,
    padding: spacing.sm,
  },
  hotPickHeader: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  hotPickBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  hotPickMatchup: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  hotPickPickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  hotPickPickedLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  hotPickPickedBox: {
    borderWidth: 1.5,
    borderColor: colors.highlight,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hotPickPickedTeam: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.highlight,
  },
  hotPickKickoffTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  poolSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  poolName: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '500',
    maxWidth: 150,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '80%',
    maxHeight: '50%',
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  poolOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  poolOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  poolOptionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
