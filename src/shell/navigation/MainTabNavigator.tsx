import React, {useEffect, useRef, useState} from 'react';
import {supabase} from '@shared/config/supabase';
import {View, Text, Image, StyleSheet, TouchableOpacity} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  CheckCircle,
  BarChart2,
  MessageCircle,
  Settings,
  Trophy,
  Target,
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
import {useNFLStore} from '@sports/nfl/stores/nflStore';

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
  const userPools = useGlobalStore(s => s.userPools);
  // Fall back to global pool if no active pool (user has no visible private pools)
  const globalPool = userPools.find(p => p.is_global);
  const smackPoolId = activePoolId || globalPool?.id || null;
  if (!activeSport || !smackPoolId) {
    return <EmptyTabScreen label="SmackTalk" />;
  }
  return (
    <SafeAreaView style={{flex: 1, backgroundColor: colors.background}} edges={['top']}>
      <PoolSwitcherBar mode="pool" />
      <SmackTalkScreen poolId={smackPoolId} />
    </SafeAreaView>
  );
}

/**
 * HistoryTabWrapper — History with logo header (matches Settings).
 */
function HistoryTabWrapper(props: any) {
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
      <HistoryScreen {...props} />
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
  const brand = useBrand();
  const wordmark = isDarkBg(colors.background) ? wordmarkDark : wordmarkLight;
  return (
    <SafeAreaView style={{flex: 1, backgroundColor: colors.background}} edges={['top']}>
      <View style={{alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs}}>
        {brand.isBranded && brand.logo.full ? (
          <Image
            source={{uri: brand.logo.full}}
            style={{height: 36, width: 190}}
            resizeMode="contain"
          />
        ) : (
          <Image
            source={wordmark}
            style={{height: 50, width: 280}}
            resizeMode="contain"
          />
        )}
      </View>
      <HomeScreen {...props} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// GroupedTabBar — custom tab bar that wraps Leaders + SmackTalk in one box
// ---------------------------------------------------------------------------

function GroupedTabBar({state, descriptors, navigation}: BottomTabBarProps) {
  const {colors} = useTheme();
  const s = groupedTabStyles(colors);
  const smackUnreadCounts = useGlobalStore(st => st.smackUnreadCounts);
  const hasUnreadSmack = Object.values(smackUnreadCounts).some(c => c > 0);

  const onTabPress = (route: typeof state.routes[number], index: number) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (state.index !== index && !event.defaultPrevented) {
      navigation.navigate(route.name as any);
    }
  };

  const renderTabContent = (route: typeof state.routes[number], index: number) => {
    const {options} = descriptors[route.key];
    const isFocused = state.index === index;
    const color = isFocused ? colors.primary : colors.textSecondary;

    const icon = options.tabBarIcon?.({focused: isFocused, color, size: 24});

    const labelDef = options.tabBarLabel;
    const label = (() => {
      if (!labelDef) return null;
      if (typeof labelDef === 'string') return labelDef;
      if (typeof labelDef === 'function') {
        const r = labelDef({focused: isFocused, color, position: 'below-icon', children: ''});
        return typeof r === 'string' ? r : null;
      }
      return null;
    })();

    // Grey out label for disabled History tab (icon is greyed via tabBarIcon option)
    const isDisabled = (options as any).tabBarDisabled === true;
    const labelColor = isDisabled && !isFocused ? colors.border : color;

    const showRedDot = route.name === 'SmackTalkTab' && hasUnreadSmack;

    return (
      <>
        <View>
          {icon}
          {showRedDot && (
            <View style={{
              position: 'absolute', top: -2, right: -4,
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: colors.error,
            }} />
          )}
        </View>
        {label ? <Text style={[s.label, {color: labelColor}]}>{label}</Text> : null}
      </>
    );
  };

  // Tab indices: 0=Home, 1=Games, 2=Leaders, 3=SmackTalk, 4+=History/Settings
  const leading = state.routes.slice(0, 2);
  const grouped = state.routes.slice(2, 4);   // Leaders + SmackTalk — always indices 2 & 3
  const trailing = state.routes.slice(4);

  return (
    <View style={[s.bar, {backgroundColor: colors.background, borderTopColor: colors.border}]}>
      {leading.map((route, i) => (
        <TouchableOpacity
          key={route.key}
          onPress={() => onTabPress(route, i)}
          style={i === 0 ? s.tabHome : s.tab}
          accessibilityRole="button"
          accessibilityState={state.index === i ? {selected: true} : {}}>
          {renderTabContent(route, i)}
        </TouchableOpacity>
      ))}

      {/* Underline spanning Leaders + SmackTalk */}
      <View style={[s.groupBox, {borderBottomColor: colors.border}]}>
        {grouped.map((route, i) => {
          const index = i + 2;
          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => onTabPress(route, index)}
              style={s.groupTab}
              accessibilityRole="button"
              accessibilityState={state.index === index ? {selected: true} : {}}>
              {renderTabContent(route, index)}
            </TouchableOpacity>
          );
        })}
      </View>

      {trailing.map((route, i) => {
        const index = i + 4;
        return (
          <TouchableOpacity
            key={route.key}
            onPress={() => onTabPress(route, index)}
            style={s.tab}
            accessibilityRole="button"
            accessibilityState={state.index === index ? {selected: true} : {}}>
            {renderTabContent(route, index)}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const groupedTabStyles = (colors: any) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: 1,
    height: 56,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
    paddingBottom: 4,
  },
  tabHome: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 8,
    paddingBottom: 6,
  },
  groupBox: {
    flex: 2,
    flexDirection: 'row',
    borderBottomWidth: 3,
    marginHorizontal: 2,
  },
  groupTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
    paddingBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});

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
  const hasHistoryFromStore = useGlobalStore(s => s.hasHistory);
  const nflCompetition = useNFLStore(s => s.competition);
  const loadUserHardware = useGlobalStore(s => s.loadUserHardware);
  const userId = useGlobalStore(s => s.user?.id);

  const nflCurrentWeek = useNFLStore(s => s.currentWeek);
  // Direct check: does this user have any fully completed weeks?
  const [hasHistoryDirect, setHasHistoryDirect] = useState(false);
  useEffect(() => {
    if (!userId || !nflCurrentWeek) return;
    supabase
      .from('season_user_totals')
      .select('id', {count: 'exact', head: true})
      .eq('user_id', userId)
      .eq('competition', nflCompetition)
      .eq('is_no_show', false)
      .lt('week', nflCurrentWeek)
      .then(({count}) => {
        setHasHistoryDirect((count ?? 0) > 0);
      });
    loadUserHardware().catch(() => {});
  }, [userId, nflCompetition, nflCurrentWeek, loadUserHardware]);

  const hasHistory = hasHistoryDirect;
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
  }, [activeSport?.competition, activePoolId, seasonInitialize, seasonConfig?.competition]);

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      tabBar={(props) => (
        <SafeAreaView style={{backgroundColor: colors.background}} edges={['bottom']}>
          <PoweredByHotPick />
          <GroupedTabBar {...props} />
        </SafeAreaView>
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
        name="HomeTab"
        component={HomeTab}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: ({focused}) => (
            <Target size={65} color={focused ? colors.primary : colors.textSecondary} strokeWidth={focused ? 2.5 : 1.5} style={{marginBottom: 0}} />
          ),
        }}
      />
      <Tab.Screen
        name="PicksTab"
        component={PicksTab}
        options={{
          tabBarLabel: 'Games',
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
        name="SmackTalkTab"
        component={SmackTalkTab}
        options={{
          tabBarLabel: 'SmackTalk',
          tabBarIcon: ({color, size}) => (
            <MessageCircle size={size} color={color} />
          ),
        }}
      />
      {/* History tab hidden — not ready for launch
      <Tab.Screen
        name="HistoryTab"
        component={HistoryTabWrapper}
        options={{
          tabBarLabel: 'History',
          tabBarDisabled: !hasHistory,
          tabBarIcon: ({color, size}) => (
            <Trophy size={size} color={hasHistory ? color : colors.border} />
          ),
        } as any}
        listeners={{
          tabPress: (e) => {
            if (!hasHistory) {
              e.preventDefault();
            }
          },
        }}
      />
      */}
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
