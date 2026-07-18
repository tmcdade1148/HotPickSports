import React, {useEffect, useRef, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {
  supabase} from '@shared/config/supabase';
import {View,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  ListChecks,
  MessageCircle,
  Settings,
  Trophy,
  Home,
} from 'lucide-react-native';
import {BottomTabBar} from '@react-navigation/bottom-tabs';
import {LadderIcon} from '@shell/components/LadderIcon';
import {HomeScreen} from '@shell/screens/HomeScreen';
import {SettingsScreen} from '@shell/screens/SettingsScreen';
import {useTheme} from '@shell/theme';
import {useBrand} from '@shell/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {consumePendingInviteCode} from '@shell/services/pendingInvite';
import {PoweredByHotPick} from '@shell/components/PoweredByHotPick';
import {PoolHeader} from '@shell/components/PoolHeader';
import {PicksHeader} from '@shell/components/PicksHeader';
import {spacing, typography, borderRadius} from '@shared/theme';
import {LEXICON} from '@shared/lexicon';
import {useForegroundRefetch} from '@shared/hooks/useForegroundRefetch';
import {hexToRgba} from '@shared/utils/color';
import {useViewingPoolId} from '@shell/stores/selectors/defaultPool';

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

 
const wordmarkLight = require('../../assets/hotpick-wordmark-lt.png');
 
const wordmarkDark = require('../../assets/hotpick-wordmark-dk.png');

function isDarkBg(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 0.5;
}

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
  const viewingPoolId = useViewingPoolId();
  // No Contest in scope → empty state, never a global/platform leaderboard.
  if (!activeSport || !viewingPoolId) return <EmptyTabScreen label={LEXICON.ladder.short} />;

  const screen = (() => {
    switch (activeSport.templateType) {
      case 'season': return <SeasonBoardScreen />;
      case 'tournament': return <TournamentBoardScreen />;
      case 'series': return <SeriesBoardScreen />;
      default: return <EmptyTabScreen label={LEXICON.ladder.short} />;
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
  // Same source as the Ladder — one viewingPoolId, no global-pool fallback.
  const smackPoolId = useViewingPoolId();
  if (!activeSport || !smackPoolId) {
    return <EmptyTabScreen label={LEXICON.chirps.plural} />;
  }
  return (
    <SafeAreaView style={{flex: 1, backgroundColor: colors.background}} edges={['top']}>
      <PoolHeader />
      {/* key={smackPoolId} → remount on pool switch so the composer draft and
          the one-time welcome-prefill guard reset per pool. Without it the
          first pool's welcome opener leaks into every other pool's composer. */}
      <SmackTalkScreen key={smackPoolId} poolId={smackPoolId} />
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
// AppTabBar — flat five-equal-tab bar. The old grouped box (Leaders + Chirp
// under one underline) was retired: it read as a mistake, not a design cue.
// The contest-scope boundary moved to PoolHeader's chevron, where it carries
// a NAME instead of a hint.
// ---------------------------------------------------------------------------

function AppTabBar({state, descriptors, navigation}: BottomTabBarProps) {
  const {colors} = useTheme();
  const s = tabBarStyles(colors);
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

  // Five equal tabs, in registration order: Home · Picks · Ladder · Chirp ·
  // Settings. No filtering (Settings is a real tab now), no grouped box, no
  // per-tab hiding — the bar is identical on every screen.
  return (
    <View style={s.bar}>
      {state.routes.map((route, index) => (
        <TouchableOpacity
          key={route.key}
          onPress={() => onTabPress(route, index)}
          style={s.tab}
          accessibilityRole="button"
          accessibilityState={state.index === index ? {selected: true} : {}}>
          {renderTabContent(route, index)}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const tabBarStyles = (_colors: any) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    // No borderTop. It was an edge the bar needed back when it was opaque; the
    // floating rgba background now does that separation, and the leftover
    // rendered as a hairline across the top of the bar.
    backgroundColor: 'transparent',
    height: 56,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
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
 * 5 equal tabs, identical on every screen (Home included):
 *   1. Home — home screen
 *   2. Picks — sport-specific picks screen
 *   3. Ladder (Leaderboard) — sport-specific board screen
 *   4. Chirp (SmackTalk) — pool-scoped chat
 *   5. Settings — app settings
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
  // Unified scope: the same viewingPoolId the Ladder + Chirp tabs read, so the
  // season store initializes against exactly what those tabs display.
  const viewingPoolId = useViewingPoolId();
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
  useEffect(() => {
    if (!pendingInviteCode || !userId) return;
    const code = pendingInviteCode;
    consumePendingInviteCode();
    navigation.navigate('JoinPool', {code});
  }, [pendingInviteCode, userId, navigation]);

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

  // Initialize sport stores when activeSport or viewingPoolId changes
  const seasonInitialize = useSeasonStore(s => s.initialize);
  const seasonConfig = useSeasonStore(s => s.config);
  const nflInitialize = useNFLStore(s => s.initialize);
  const didInit = useRef(false);

  useEffect(() => {
    if (!activeSport || !viewingPoolId) return;

    if (activeSport.templateType === 'season') {
      // Re-initialize if sport, pool, or first init
      const poolChanged = seasonConfig && useSeasonStore.getState().poolId !== viewingPoolId;
      if (
        !seasonConfig ||
        seasonConfig.competition !== activeSport.competition ||
        poolChanged ||
        didInit.current === false
      ) {
        didInit.current = true;
        seasonInitialize(activeSport, viewingPoolId);
      }
    }
  }, [activeSport?.competition, viewingPoolId, seasonInitialize, seasonConfig?.competition]);

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
      tabBar={(props) => (
        // Floating, semi-transparent bar on every screen (slice 2 #9/#10):
        // absolutely positioned so content scrolls UNDER it; rgba (no expo-blur,
        // no native). Screens reserve useNavReserve() at their scroll bottom so
        // the last row clears the bar. 0.85 alpha is a starting value — tune on
        // device.
        <SafeAreaView
          edges={['bottom']}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: hexToRgba(colors.background, 0.85),
          }}>
          <PoweredByHotPick />
          <AppTabBar {...props} />
        </SafeAreaView>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        // position:'absolute' tells RN to stop reserving flow height for the
        // tab bar — our custom bar (the `tabBar` prop) is already absolutely
        // positioned and floats, so without this RN left a dead band above it
        // (verified on Android). Content now fills to the bottom and scrolls
        // under the bar; useNavReserve() does the clearing.
        tabBarStyle: {
          position: 'absolute',
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
          // Home is one of five equal tabs now (the old raised 56px center
          // glyph belonged to the retired grouped layout).
          tabBarLabel: 'Home',
          tabBarIcon: ({color, size}) => (
            <Home size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="PicksTab"
        component={PicksTab}
        options={{
          tabBarLabel: 'Picks',
          tabBarIcon: ({color, size}) => (
            <ListChecks size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="LeaderboardTab"
        component={LeaderboardTab}
        options={{
          tabBarLabel: LEXICON.ladder.short,
          tabBarIcon: ({color, size}) => (
            <LadderIcon size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="SmackTalkTab"
        component={SmackTalkTab}
        options={{
          tabBarLabel: LEXICON.chirps.singular,
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
