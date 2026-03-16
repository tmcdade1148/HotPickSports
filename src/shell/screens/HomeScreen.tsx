import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Settings} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDisplayName} from '@shared/utils/displayName';
import {SeasonEventCard} from '@shell/components/home/SeasonEventCard';
import {TournamentEventCard} from '@shell/components/home/TournamentEventCard';
import {SeriesEventCard} from '@shell/components/home/SeriesEventCard';
import {StandingsBadge} from '@shell/components/home/StandingsBadge';
import {SmackTalkNudge} from '@shell/components/home/SmackTalkNudge';
import {spacing, typography} from '@shared/theme';
import {useTheme} from '@shell/theme';
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
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const userProfile = useGlobalStore(s => s.userProfile);
  const activeEventCards = useGlobalStore(s => s.activeEventCards);
  const activeSport = useGlobalStore(s => s.activeSport);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);

  const greeting = getGreeting();
  const firstName = getDisplayName(userProfile);

  const handleCardPress = (config: AnyEventConfig) => {
    // Set as active sport so EventDetail knows which template to render
    setActiveSport(config);
    navigation.navigate('EventDetail');
  };

  /** Navigate to the Board tab in EventDetail (nested screen syntax) */
  const handleNavigateToBoard = () => {
    const config = activeEventCards[0] ?? activeSport;
    if (config) {
      setActiveSport(config);
      navigation.navigate('EventDetail', {screen: 'Season_board'});
    }
  };

  /** Navigate to SmackTalk tab for the active pool */
  const handleNavigateToSmackTalk = () => {
    const config = activeEventCards[0] ?? activeSport;
    if (config) {
      setActiveSport(config);
      navigation.navigate('EventDetail', {screen: 'Season_smacktalk'});
    }
  };

  /** Switch pool globally, then navigate to SmackTalk tab */
  const handleNavigateToSmackTalkPool = (poolId: string) => {
    useGlobalStore.getState().setActivePoolId(poolId);
    const config = activeEventCards[0] ?? activeSport;
    if (config) {
      setActiveSport(config);
      navigation.navigate('EventDetail', {screen: 'Season_smacktalk'});
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
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting},</Text>
          <Text style={styles.name}>{firstName}</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}>
          <Settings size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Event Cards */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
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
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  greeting: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  name: {
    ...typography.h2,
    color: colors.textPrimary,
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
