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
import {PoolHeader} from '@shell/components/PoolHeader';
import {PicksHeader} from '@shell/components/PicksHeader';
import {spacing, typography, borderRadius} from '@shared/theme';
import {LEXICON} from '@shared/lexicon';
import {useForegroundRefetch} from '@shared/hooks/useForegroundRefetch';

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
      <PicksHeader />
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
      <PoolHeader />
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
    return <EmptyTabScreen label={LEXICON.chirps.plural} />;
  }
  return (
    <SafeAreaView style={{flex: 1, backgroundColor: colors.background}} edges={['top']}>
      <PoolHeader />
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
 * HomeTab — Home screen.
 *
 * The PNG wordmark image that used to render above HomeScreen has been
 * removed per the May 13 design call. Home now ships its own text-rendered
 * wordmark via the HomeHeader component (and the spec's original §6.4.2
 * stance was "no wordmark on Home" anyway — this returns us to that
 * position with HomeHeader supplying a lighter-weight inline equivalent).
 *
 * Partner branding for partner-aligned pools is now handled inside the
 * Home content via PoolModule's accent stripe + PartnerModule's logo,
 * not as a top-of-screen banner.
 */
function HomeTab(props: any) {
  const {colors} = useTheme();
  return (
    <SafeAreaView style={{flex: 1, backgroundColor: colors.background}} edges={['top']}>
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

  // Settings is reachable via the gear in each tab's header (HomeHeader /
  // PoolHeader / PicksHeader). Hide it from the bottom bar so the bar can
  // focus on tab navigation, but keep the route registered.
  const visibleRoutes = state.routes.filter(r => r.name !== 'SettingsTab');
  const indexOfVisible = (visible: typeof state.routes[number]) =>
    state.routes.findIndex(r => r.key === visible.key);

  // Tab indices: 0=Home, 1=Games, 2=Leaders, 3=SmackTalk, 4+=trailing
  const leading = visibleRoutes.slice(0, 2);
  const grouped = visibleRoutes.slice(2, 4);
  const trailing = visibleRoutes.slice(4);

  // Hide Leaders + SmackTalk grouped box on Home AND Picks tabs — both are
  // "pick-flow" surfaces where the user shouldn't be hopping over to the
  // social side of the app. Routes stay registered so direct nav still works.
  const activeRouteName = state.routes[state.index]?.name;
  const hideGroupedTabs = activeRouteName === 'HomeTab' || activeRouteName === 'PicksTab';

  return (
    <View style={[s.bar, {backgroundColor: colors.background, borderTopColor: colors.border}]}>
      {leading.map((route, i) => {
        const realIndex = indexOfVisible(route);
        return (
          <TouchableOpacity
            key={route.key}
            onPress={() => onTabPress(route, realIndex)}
            style={i === 0 ? s.tabHome : s.tab}
            accessibilityRole="button"
            accessibilityState={state.index === realIndex ? {selected: true} : {}}>
            {renderTabContent(route, realIndex)}
          </TouchableOpacity>
        );
      })}

      {hideGroupedTabs ? (
        // Reserve the same flex slot the Leaders+SmackTalk box would
        // occupy so Home + Games keep their left-anchored positions
        // when the grouped tabs are hidden (Home and Picks tabs).
        // Without this, the leading tabs would stretch to fill the
        // gap and shift right.
        <View style={s.groupBoxPlaceholder} />
      ) : (
        <View style={[s.groupBox, {borderBottomColor: colors.border}]}>
          {grouped.map(route => {
            const realIndex = indexOfVisible(route);
            return (
              <TouchableOpacity
                key={route.key}
                onPress={() => onTabPress(route, realIndex)}
                style={s.groupTab}
                accessibilityRole="button"
                accessibilityState={state.index === realIndex ? {selected: true} : {}}>
                {renderTabContent(route, realIndex)}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {trailing.map(route => {
        const realIndex = indexOfVisible(route);
        return (
          <TouchableOpacity
            key={route.key}
            onPress={() => onTabPress(route, realIndex)}
            style={s.tab}
            accessibilityRole="button"
            accessibilityState={state.index === realIndex ? {selected: true} : {}}>
            {renderTabContent(route, realIndex)}
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
  groupBoxPlaceholder: {
    flex: 2,
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
  // AppState foreground-refetch insurance: when the OS suspends the app
  // and resumes it, we refetch competition_config, picks, leaderboards,
  // and SmackTalk unread counts in case the Realtime socket dropped during
  // background. Realtime itself is now the primary update path (publication
  // fixed), this is just the safety net.
  useForegroundRefetch();
  const userProfile = useGlobalStore(s => s.userProfile);
  const activeSport = useGlobalStore(s => s.activeSport);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const hasHistoryFromStore = useGlobalStore(s => s.hasHistory);
  const nflCompetition = useNFLStore(s => s.competition);
  const loadUserHardware = useGlobalStore(s => s.loadUserHardware);
  const userId = useGlobalStore(s => s.user?.id);

  // --- Deep-link invite handler (single consumer for the authenticated app) ---
  // A tapped invite link (https://hotpick.app/join/CODE) sets `pendingInviteCode`
  // in globalStore. By the time this shell is mounted the user is authenticated
  // and past onboarding, so we route them straight to the Join screen with the
  // code prefilled — works on cold start (code already pending at mount) and warm
  // start (code set while Home is open). Brand-new signups are handled earlier by
  // PoolWelcomeScreen, which clears the code before Home mounts, so this never
  // double-fires.
  const navigation = useNavigation<any>();
  const pendingInviteCode = useGlobalStore(s => s.pendingInviteCode);
  const clearPendingInviteCode = useGlobalStore(s => s.clearPendingInviteCode);
  useEffect(() => {
    if (!pendingInviteCode || !userId) return;
    const code = pendingInviteCode;
    clearPendingInviteCode();
    navigation.navigate('JoinPool', {code});
  }, [pendingInviteCode, userId, navigation, clearPendingInviteCode]);

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
  const nflInitialize = useNFLStore(s => s.initialize);
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

  // nflStore initialization — was previously triggered by SeasonEventCard
  // before the Home Redesign deleted that component. Now driven directly
  // by activeSport.competition. Without this, nflStore sits on its
  // hardcoded defaults (competition: 'nfl_2026', weekState: 'picks_open',
  // currentPhase: 'REGULAR', currentWeek: 1) and the redesigned Home shows
  // stale state regardless of what competition_config holds.
  //
  // We deliberately do NOT skip when nflCompetitionInStore === activeSport
  // because the nflStore default ('nfl_2026') matches the most common
  // activeSport on first mount, and a skip there would mean
  // fetchCompetitionConfig() never runs — leaving picksOpenAt / weekState
  // / currentWeek stuck at their hardcoded defaults. initialize() has its
  // own internal alreadyInitialized check that skips the heavy state reset
  // while still always re-fetching config, so calling it freely here is
  // cheap.
  const nflInitializedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSport) return;
    if (activeSport.templateType !== 'season') return;
    // Re-fire on every activeSport change. The useRef guard prevents
    // duplicate calls within the same competition without the false
    // negative the previous `nflCompetitionInStore === ...` guard had.
    if (nflInitializedFor.current === activeSport.competition) return;
    nflInitializedFor.current = activeSport.competition;
    nflInitialize(activeSport.competition).catch(() => {});
  }, [activeSport?.competition, activeSport?.templateType, nflInitialize]);

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenListeners={{
        // The onboarding demo reuses the season/picks machinery by swapping the
        // global active competition. It lives on the Picks tab (the Ladder is a
        // root-stack screen above it, so the focused tab stays PicksTab there).
        // Focusing any OTHER tab means the user is leaving the demo, so exit it
        // — one rule covers Home/Leaders/Chirps/Settings, no per-screen guards.
        state: (e: any) => {
          if (!useGlobalStore.getState().isDemoActive) return;
          const st = e?.data?.state;
          const focused = st?.routes?.[st.index]?.name;
          if (focused && focused !== 'PicksTab') {
            useGlobalStore.getState().exitDemo();
          }
        },
      }}
      tabBar={(props) => {
        // Brief (redesign-v3): hide the entire bottom-nav region on Home —
        // PoweredByHotPick included. Home owns the full screen; other tabs
        // continue to show the bar.
        const activeRouteName = props.state.routes[props.state.index]?.name;
        if (activeRouteName === 'HomeTab') return null;
        return (
          <SafeAreaView style={{backgroundColor: colors.background}} edges={['bottom']}>
            <PoweredByHotPick />
            <GroupedTabBar {...props} />
          </SafeAreaView>
        );
      }}
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
          tabBarLabel: LEXICON.ladder.short,
          tabBarIcon: ({color, size}) => (
            <BarChart2 size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="SmackTalkTab"
        component={SmackTalkTab}
        options={{
          tabBarLabel: LEXICON.chirps.plural,
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
