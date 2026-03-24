import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
// Settings icon removed — now in MainTabNavigator bottom tab
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDisplayName} from '@shared/utils/displayName';
import {SeasonEventCard} from '@shell/components/home/SeasonEventCard';
import {TournamentEventCard} from '@shell/components/home/TournamentEventCard';
import {SeriesEventCard} from '@shell/components/home/SeriesEventCard';
import {StandingsBadge} from '@shell/components/home/StandingsBadge';
import {SmackTalkNudge} from '@shell/components/home/SmackTalkNudge';
import {MessageCenter} from '@shell/components/home/MessageCenter';
import {spacing, typography} from '@shared/theme';
import {useTheme, useBrand} from '@shell/theme';

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

  const greeting = getGreeting();
  const firstName = getDisplayName(userProfile);

  // Event name + phase for header
  const eventName = activeSport
    ? activeSport.competition.replace(/_/g, ' ').toUpperCase()
    : '';
  const currentPhase = (activeSport as any)?.currentPhase;
  const phaseLabel = currentPhase === 'PLAYOFFS'
    ? 'Playoffs'
    : currentPhase === 'SUPERBOWL'
      ? 'Super Bowl'
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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Brand wordmark / partner logo */}
      <View style={styles.logoContainer}>
        {brand.isBranded && brand.logo.full ? (
          <Image
            source={{uri: brand.logo.full}}
            style={styles.partnerLogo}
            resizeMode="contain"
          />
        ) : (
          <Image
            source={isDark
              ? require('../../assets/hotpick-wordmark-dk.png')
              : require('../../assets/hotpick-wordmark-lt.png')
            }
            style={styles.wordmark}
            resizeMode="contain"
          />
        )}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting},</Text>
          <Text style={styles.name}>{firstName}</Text>
        </View>
        {eventName ? (
          <View style={styles.headerRight}>
            <Text style={styles.phaseLabel}>{phaseLabel}</Text>
            <Text style={[styles.eventName, brand.isBranded && {color: colors.highlight}]}>{eventName}</Text>
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
          <TouchableOpacity
            key={config.competition}
            activeOpacity={0.85}
            onPress={() => handleCardPress(config)}>
            <EventCardForConfig
              config={config}
              onNavigateToEvent={() => handleCardPress(config)}
            />
          </TouchableOpacity>
        ))}

        {/* StandingsBadge — below event cards */}
        {cardsToShow.length > 0 && (
          <StandingsBadge onPress={handleNavigateToBoard} />
        )}

        {/* SmackTalkNudge — below standings */}
        {cardsToShow.length > 0 && (
          <SmackTalkNudge
            onPress={handleNavigateToSmackTalk}
            onPressPool={handleNavigateToSmackTalkPool}
          />
        )}

        {cardsToShow.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No active events</Text>
            <Text style={styles.emptySubtitle}>
              Events will appear here when they're live
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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

/** Returns a time-appropriate greeting string. */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
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
