import React, {useEffect, useRef, useState} from 'react';
import {View, Text, Image, StyleSheet} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  CheckCircle,
  BarChart2,
  MessageCircle,
  Settings,
  Trophy,
  Home,
} from 'lucide-react-native';
import {BottomTabBar} from '@react-navigation/bottom-tabs';
import {HomeScreen} from '@shell/screens/HomeScreen';
import {SettingsScreen} from '@shell/screens/SettingsScreen';
import {useTheme} from '@shell/theme';
import {useBrand} from '@shell/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {PoweredByHotPick} from '@shell/components/PoweredByHotPick';
import {PoolSwitcherBar} from '@shell/components/PoolSwitcherBar';
import {spacing, typography, borderRadius} from '@shared/theme';

// Sport store imports for initialization
import {useSeasonStore} from '@templates/season/stores/seasonStore';

// Lazy imports for sport-specific screens
import {SeasonPicksScreen} from '@templates/season/screens/SeasonPicksScreen';
import {SeasonBoardScreen} from '@templates/season/screens/SeasonBoardScreen';
import {SmackTalkScreen} from '@shared/components/SmackTalkScreen';
import {TournamentPicksHub} from '@templates/tournament/screens/TournamentPicksHub';
import {TournamentBoardScreen} from '@templates/tournament/screens/TournamentBoardScreen';
import {SeriesPicksScreen} from '@templates/series/screens/SeriesPicksScreen';
import {SeriesBoardScreen} from '@templates/series/screens/SeriesBoardScreen';
import {HistoryScreen} from '@shell/screens/HistoryScreen';

const Tab = createBottomTabNavigator();

// Dashboard tab no longer shows user name — all poolies identified by poolie_name in-app

/**
 * EmptyTabScreen — Shown when no active sport is selected.
 */
function EmptyTabScreen({label}: {label: string}) {
  const {colors} = useTheme();
  return (
    <View style={[emptyStyles.container, {backgroundColor: colors.background}]}>
      <Text style={[emptyStyles.title, {color: colors.textPrimary}]}>
        {label}
      </Text>
      <Text style={[emptyStyles.subtitle, {color: colors.textSecondary}]}>
        Select an event from Home to get started
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  title: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
  },
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const wordmarkLight = require('../../assets/hotpick-wordmark-lt.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const wordmarkDark = require('../../assets/hotpick-wordmark-dk.png');

function isDarkBg(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 0.5;
}

// TabHeader removed — replaced by shared PoolSwitcherBar component

/**
 * PicksTab — Renders the correct picks screen based on active sport template.
 */
function PicksTab() {
  const {colors} = useTheme();
  const activeSport = useGlobalStore(s => s.activeSport);
  if (!activeSport) return <EmptyTabScreen label="Picks" />;

  const screen = (() => {
    switch (activeSport.templateType) {
      case 'season': return <SeasonPicksScreen />;
      case 'tournament': return <TournamentPicksHub />;
      case 'series': return <SeriesPicksScreen />;
      default: return <EmptyTabScreen label="Picks" />;
    }
  })();

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: colors.background}} edges={['top']}>
      <PoolSwitcherBar mode="picks" />
      {screen}
    </SafeAreaView>
  );
}

/**
 * LeaderboardTab — Renders the correct board screen based on active sport template.
 */
function LeaderboardTab() {
  const {colors} = useTheme();
  const activeSport = useGlobalStore(s => s.activeSport);
  if (!activeSport) return <EmptyTabScreen label="Leaders" />;

  const screen = (() => {
    switch (activeSport.templateType) {
      case 'season': return <SeasonBoardScreen />;
      case 'tournament': return <TournamentBoardScreen />;
      case 'series': return <SeriesBoardScreen />;
      default: return <EmptyTabScreen label="Leaders" />;
    }
  })();

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: colors.background}} edges={['top']}>
      <PoolSwitcherBar mode="pool" />
      {screen}
    </SafeAreaView>
  );
}

/**
 * SmackTalkTab — Renders SmackTalk for the active pool.
 */
function SmackTalkTab() {
  const {colors} = useTheme();
  const activeSport = useGlobalStore(s => s.activeSport);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  if (!activeSport || !activePoolId) {
    return <EmptyTabScreen label="SmackTalk" />;
  }
  return (
    <SafeAreaView style={{flex: 1, backgroundColor: colors.background}} edges={['top']}>
      <PoolSwitcherBar mode="pool" />
      <SmackTalkScreen poolId={activePoolId} />
    </SafeAreaView>
  );
}

/**
 * SettingsTabWrapper — Settings with logo header.
 */
function SettingsTabWrapper(props: any) {
  const {colors} = useTheme();
  const brand = useBrand();
  const wordmark = isDarkBg(colors.background) ? wordmarkDark : wordmarkLight;

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: colors.background}} edges={['top']}>
      <View style={{alignItems: 'center', marginBottom: spacing.xs, paddingTop: spacing.xs}}>
        {brand.isBranded && brand.logo.full ? (
          <Image
            source={{uri: brand.logo.full}}
            style={{height: 30, width: 160}}
            resizeMode="contain"
          />
        ) : (
          <Image
            source={wordmark}
            style={{height: 40, width: 225}}
            resizeMode="contain"
          />
        )}
      </View>
      <SettingsScreen {...props} />
    </SafeAreaView>
  );
}

/**
 * HomeTab — Home screen with unified pool switcher bar.
 */
function HomeTab(props: any) {
  const {colors} = useTheme();
  return (
    <SafeAreaView style={{flex: 1, backgroundColor: colors.background}} edges={['top']}>
      <PoolSwitcherBar mode="pool" />
      <HomeScreen {...props} />
    </SafeAreaView>
  );
}

/**
 * MainTabNavigator — Persistent bottom tab bar across the entire app.
 *
 * 5 tabs:
 *   1. Home (far left) — labeled with user's name/poolie name
 *   2. Picks — sport-specific picks screen
 *   3. Leaderboard — sport-specific board screen
 *   4. SmackTalk — pool-scoped chat
 *   5. Settings (far right) — app settings
 *
 * Picks, Leaderboard, and SmackTalk render sport-specific content
 * when an active sport exists, or an empty state when not.
 */
export function MainTabNavigator() {
  const {colors} = useTheme();
  const userProfile = useGlobalStore(s => s.userProfile);
  const activeSport = useGlobalStore(s => s.activeSport);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const hasHistory = useGlobalStore(s => s.hasHistory);
  // homeLabel removed — Dashboard tab uses icon only

  // Initialize sport stores when activeSport or activePoolId changes
  const seasonInitialize = useSeasonStore(s => s.initialize);
  const seasonConfig = useSeasonStore(s => s.config);
  const didInit = useRef(false);

  useEffect(() => {
    if (!activeSport || !activePoolId) return;

    if (activeSport.templateType === 'season') {
      // Re-initialize if sport, pool, or first init
      const poolChanged = seasonConfig && useSeasonStore.getState().poolId !== activePoolId;
      if (
        !seasonConfig ||
        seasonConfig.competition !== activeSport.competition ||
        poolChanged ||
        didInit.current === false
      ) {
        didInit.current = true;
        seasonInitialize(activeSport, activePoolId);
      }
    }
  }, [activeSport, activePoolId, seasonInitialize, seasonConfig]);

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      tabBar={(props) => (
        <View style={{backgroundColor: colors.background}}>
          <PoweredByHotPick />
          <BottomTabBar {...props} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.surface,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}>
      <Tab.Screen
        name="PicksTab"
        component={PicksTab}
        options={{
          tabBarLabel: 'Picks',
          tabBarIcon: ({color, size}) => (
            <CheckCircle size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="LeaderboardTab"
        component={LeaderboardTab}
        options={{
          tabBarLabel: 'Leaders',
          tabBarIcon: ({color, size}) => (
            <BarChart2 size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="HomeTab"
        component={HomeTab}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: ({focused}) => (
            <View style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: focused ? colors.primary : colors.surface,
              borderWidth: 2,
              borderColor: colors.primary,
              marginBottom: 10,
              shadowColor: focused ? colors.primary : '#000',
              shadowOffset: {width: 0, height: 4},
              shadowOpacity: focused ? 0.35 : 0.15,
              shadowRadius: 8,
              elevation: focused ? 8 : 4,
            }}>
              <Home size={32} color={focused ? '#FFFFFF' : colors.textSecondary} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="SmackTalkTab"
        component={SmackTalkTab}
        options={{
          tabBarLabel: 'SmackTalk',
          tabBarIcon: ({color, size}) => (
            <MessageCircle size={size} color={color} />
          ),
        }}
      />
      {hasHistory && (
        <Tab.Screen
          name="HistoryTab"
          component={HistoryScreen}
          options={{
            tabBarLabel: 'History',
            tabBarIcon: ({color, size}) => (
              <Trophy size={size} color={color} />
            ),
          }}
        />
      )}
      <Tab.Screen
        name="SettingsTab"
        component={SettingsTabWrapper}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({color, size}) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
