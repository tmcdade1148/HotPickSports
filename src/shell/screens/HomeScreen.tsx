import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
// SafeAreaView now handled by HomeTab wrapper in MainTabNavigator
// Settings icon removed — now in MainTabNavigator bottom tab
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDisplayName} from '@shared/utils/displayName';
import {SeasonEventCard} from '@shell/components/home/SeasonEventCard';
import {TournamentEventCard} from '@shell/components/home/TournamentEventCard';
import {SeriesEventCard} from '@shell/components/home/SeriesEventCard';
import {StandingsBadge} from '@shell/components/home/StandingsBadge';
import {SmackTalkNudge} from '@shell/components/home/SmackTalkNudge';
import {MessageCenter} from '@shell/components/home/MessageCenter';
import {HardwareModule} from '@shell/components/home/HardwareModule';
import {JoinPoolModule} from '@shell/components/home/JoinPoolModule';
import {spacing, typography} from '@shared/theme';
import {useTheme, useBrand} from '@shell/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';

import type {
  AnyEventConfig,
  SeasonConfig,
  TournamentConfig,
  SeriesConfig,
} from '@shared/types/templates';

/**
 * HomeScreen — Smart Home Screen showing priority-ordered event cards.
 *
 * Per CLAUDE.md §21, the Home Screen surfaces live action based on
 * current state of active events. Maximum 2 event cards rendered.
 * Tapping a card navigates to EventDetail which renders the full
 * template tab navigator for that event.
 */
export function HomeScreen({navigation}: any) {
  const {colors, isDark} = useTheme();
  const brand = useBrand();
  const styles = createStyles(colors);
  const userProfile = useGlobalStore(s => s.userProfile);
  const activeEventCards = useGlobalStore(s => s.activeEventCards);
  const activeSport = useGlobalStore(s => s.activeSport);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);
  const userPools = useGlobalStore(s => s.visiblePools);

  const nflWeekState = useNFLStore(s => s.weekState);
  const nflCurrentPhase = useNFLStore(s => s.currentPhase);
  const nflUserPickCount = useNFLStore(s => s.userPickCount);
  const nflPicksDeadline = useNFLStore(s => s.picksDeadline);

  const greeting = getContextGreeting(nflCurrentPhase, nflWeekState, nflUserPickCount, nflPicksDeadline);
  const firstName = getDisplayName(userProfile);

  // Join module: show when user has no private pool, hide during SEASON_COMPLETE
  const hasPrivatePool = userPools.some(
    p => !p.is_global && p.competition === (activeSport?.competition ?? 'nfl_2026'),
  );
  const isSeasonOver = nflCurrentPhase === 'SEASON_COMPLETE';
  const showJoinModule = (!hasPrivatePool || nflCurrentPhase === 'PRE_SEASON') && !isSeasonOver;

  // Event name + phase for header
  const eventName = activeSport
    ? activeSport.competition.replace(/_/g, ' ').toUpperCase()
    : '';
  const phaseForLabel = nflCurrentPhase || (activeSport as any)?.currentPhase;
  const phaseLabel = phaseForLabel === 'PRE_SEASON'
    ? 'The Calm Before...'
    : phaseForLabel === 'PLAYOFFS'
      ? 'Playoffs'
      : phaseForLabel === 'SUPERBOWL'
        ? 'Super Bowl'
        : phaseForLabel === 'SUPERBOWL_INTRO'
          ? 'Super Bowl'
          : phaseForLabel === 'REGULAR_COMPLETE'
            ? 'Playoffs Loading...'
            : phaseForLabel === 'SEASON_COMPLETE'
              ? 'Season Complete'
              : 'Regular Season';

  const handleCardPress = (config: AnyEventConfig) => {
    // Set as active sport so Picks/Leaderboard/SmackTalk tabs render this sport
    setActiveSport(config);
    navigation.navigate('PicksTab');
  };

  /** Navigate to the Leaderboard tab */
  const handleNavigateToBoard = () => {
    const config = activeEventCards[0] ?? activeSport;
    if (config) {
      setActiveSport(config);
      navigation.navigate('LeaderboardTab');
    }
  };

  /** Navigate to SmackTalk tab for the active pool */
  const handleNavigateToSmackTalk = () => {
    const config = activeEventCards[0] ?? activeSport;
    if (config) {
      setActiveSport(config);
      navigation.navigate('SmackTalkTab');
    }
  };

  /** Switch pool globally, then navigate to SmackTalk tab */
  const handleNavigateToSmackTalkPool = (poolId: string) => {
    useGlobalStore.getState().setActivePoolId(poolId);
    const config = activeEventCards[0] ?? activeSport;
    if (config) {
      setActiveSport(config);
      navigation.navigate('SmackTalkTab');
    }
  };

  // Use activeEventCards if populated, otherwise fall back to activeSport
  const cardsToShow =
    activeEventCards.length > 0
      ? activeEventCards
      : activeSport
        ? [activeSport]
        : [];

  return (
    <View style={styles.container}>
      {/* Header — logo/pool switcher now in PoolSwitcherBar above */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.name}>{firstName}</Text>
        </View>
        {eventName ? (
          <View style={styles.headerRight}>
            <Text style={styles.phaseLabel}>{phaseLabel}</Text>
            <Text style={[styles.eventName, {color: colors.highlight}]}>{eventName}</Text>
            {(nflCurrentPhase === 'REGULAR' || nflCurrentPhase === 'PLAYOFFS' || nflCurrentPhase === 'SUPERBOWL') ? (
              <Text style={[
                styles.weekLabel,
                {color: nflWeekState === 'picks_open' ? colors.highlight : colors.textSecondary},
                nflWeekState !== 'picks_open' && {opacity: 0.5},
              ]}>
                WEEK {nflWeekState === 'complete' || nflWeekState === 'settling'
                  ? useNFLStore.getState().currentWeek + 1
                  : useNFLStore.getState().currentWeek}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.headerDivider} />

      {/* Event Cards */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Message Center — broadcasts, moderator notes, flagged messages */}
        <MessageCenter
          onNavigateToMessageCenter={() => navigation.navigate('MessageCenter')}
          onNavigateToFlagged={(poolId: string) => {
            navigation.navigate('FlaggedMessages', {poolId});
          }}
        />

        {cardsToShow.map(config => (
          <EventCardForConfig
            key={config.competition}
            config={config}
            onNavigateToEvent={() => handleCardPress(config)}
          />
        ))}

        {/* Join Pool Module — shown during PRE_SEASON or when user has no private pool */}
        {showJoinModule && <JoinPoolModule />}

        {/* StandingsBadge — hidden until user has a private pool */}
        {cardsToShow.length > 0 && hasPrivatePool && (
          <StandingsBadge onPress={handleNavigateToBoard} />
        )}

        {/* SmackTalkNudge — hidden until user has a private pool */}
        {cardsToShow.length > 0 && hasPrivatePool && (
          <SmackTalkNudge
            onPress={handleNavigateToSmackTalk}
            onPressPool={handleNavigateToSmackTalkPool}
          />
        )}

        {/* Hardware Module — latest award earned */}
        <HardwareModule onPress={() => navigation.navigate('HistoryTab')} />

        {cardsToShow.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No active events</Text>
            <Text style={styles.emptySubtitle}>
              Events will appear here when they're live
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Dispatches to the correct event card component based on templateType.
 * Shell never imports sport logic — each card reads from its own sport store.
 */
function EventCardForConfig({
  config,
  onNavigateToEvent,
}: {
  config: AnyEventConfig;
  onNavigateToEvent: () => void;
}) {
  switch (config.templateType) {
    case 'season':
      return (
        <SeasonEventCard
          config={config as SeasonConfig}
          onNavigateToEvent={onNavigateToEvent}
        />
      );
    case 'tournament':
      return <TournamentEventCard config={config as TournamentConfig} />;
    case 'series':
      return <SeriesEventCard config={config as SeriesConfig} />;
  }
}

/**
 * Context-aware salutation based on season phase, week state, and pick status.
 * Deterministic per-hour — picks one greeting from the pool using the hour
 * as a seed so it doesn't flicker on re-renders but changes throughout the day.
 */
function getContextGreeting(
  phase: string | null,
  weekState: string,
  userPickCount: number,
  picksDeadline: Date | null,
): string {
  const hour = new Date().getHours();
  const pick = (arr: string[]) => arr[hour % arr.length];

  // Dead period / pre-season
  if (!phase || phase === 'PRE_SEASON') {
    return pick(["Nothing on yet. Enjoy it", "Offseason. It won't last", "Season's coming"]);
  }

  // Season complete
  if (phase === 'SEASON_COMPLETE') {
    return pick(["What a ride", "That's a wrap", "See you next season"]);
  }

  // Transition phases
  if (phase === 'REGULAR_COMPLETE' || phase === 'SUPERBOWL_INTRO') {
    return pick(["Dust settling", "Big things ahead", "Stay sharp"]);
  }

  // Active season — use week state
  switch (weekState) {
    case 'picks_open': {
      // Check if user has submitted picks
      if (userPickCount > 0) {
        return pick(["On record. No edits", "Said what you said", "Locked in"]);
      }
      // Check if deadline is within 24 hours
      if (picksDeadline) {
        const hoursLeft = (picksDeadline.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursLeft > 0 && hoursLeft <= 24) {
          return pick(["Last call", "Closing time", "You sure about this?"]);
        }
      }
      return pick(["Picks are open", "Your move", "Clock's running"]);
    }
    case 'locked':
      return pick(["On record. No edits", "Said what you said", "Locked in"]);
    case 'live':
      return pick(["It's happening", "Too late to change anything", "Watching or refreshing?"]);
    case 'settling':
    case 'complete':
      return pick(["The record doesn't lie", "It's official", "Week closed"]);
    default:
      return pick(["Nothing today", "Rest day", "Back at it soon"]);
  }
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  headerDivider: {
    height: 2,
    backgroundColor: colors.secondary,
    marginHorizontal: spacing.md,
  },
  greeting: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  name: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  eventName: {
    fontSize: 24,
    fontWeight: '800' as const,
    fontStyle: 'italic' as const,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  phaseLabel: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: colors.textSecondary,
  },
  weekLabel: {
    fontSize: 18,
    fontWeight: '800' as const,
    fontStyle: 'italic' as const,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: 0,
  },
  wordmark: {
    height: 70,
    width: 400,
  },
  partnerLogo: {
    height: 56,
    width: 280,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xxl * 2,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
