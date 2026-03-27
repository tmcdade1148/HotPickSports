import React, {useEffect, useRef, useState} from 'react';
import {View, Text, Image, StyleSheet, TouchableOpacity, Modal, ScrollView, Alert} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  CheckCircle,
  BarChart2,
  MessageCircle,
  Settings,
  ChevronDown,
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

/**
 * Get display name for the Home tab label.
 * Uses poolie_name if preference is set, otherwise first name.
 */
function getTabDisplayName(profile: any): string {
  if (!profile) return 'Home';
  // Respect user's display_name_preference
  const pref = profile.display_name_preference;
  let name: string;
  if (pref === 'poolie_name' && profile.poolie_name) {
    name = profile.poolie_name;
  } else {
    // Build display from first_name + last initial
    const firstName = profile.first_name;
    const lastName = profile.last_name;
    if (firstName) {
      name = lastName ? `${firstName} ${lastName.charAt(0)}.` : firstName;
    } else {
      // first_name not set — fall back to poolie_name
      name = profile.poolie_name || 'Home';
    }
  }
  // Truncate long names to fit tab bar (max 10 chars)
  if (name.length > 10) {
    return name.substring(0, 9) + '…';
  }
  return name;
}

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

/**
 * TabHeader — Displays a header with pool switcher for pool-scoped tabs
 * or a static message for picks (which are pool-independent).
 */
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

function TabHeader({title, showPoolSwitcher}: {title: string; showPoolSwitcher: boolean}) {
  const {colors} = useTheme();
  const brand = useBrand();
  const [modalVisible, setModalVisible] = useState(false);
  const userPools = useGlobalStore(s => s.visiblePools);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);
  const flaggedCounts = useGlobalStore(s => s.flaggedCounts);

  const navigation = useNavigation<any>();
  const activePool = userPools.find(p => p.id === activePoolId);
  const poolName = activePool?.name ?? '';
  const hasVisiblePools = userPools.length > 0;

  const switchTo = (poolId: string) => {
    setActivePoolId(poolId);
    setModalVisible(false);
  };

  const wordmark = isDarkBg(colors.background) ? wordmarkDark : wordmarkLight;

  return (
    <View style={[headerStyles.container, {backgroundColor: colors.background, borderBottomColor: colors.surface}]}>
      {/* Logo */}
      <View style={headerStyles.logoRow}>
        {brand.isBranded && brand.logo.full ? (
          <Image
            source={{uri: brand.logo.full}}
            style={headerStyles.partnerLogo}
            resizeMode="contain"
          />
        ) : (
          <Image
            source={wordmark}
            style={headerStyles.wordmark}
            resizeMode="contain"
          />
        )}
      </View>
      <View style={headerStyles.row}>
        {showPoolSwitcher && hasVisiblePools ? (
          <TouchableOpacity
            style={headerStyles.selector}
            onPress={() => setModalVisible(true)}>
            <Text style={[headerStyles.switchLabel, {color: colors.textSecondary}]}>
              Switch Pools:
            </Text>
            <Text style={[headerStyles.poolName, {color: colors.highlight, fontWeight: '900'}]} numberOfLines={1}>
              {poolName}
            </Text>
            <ChevronDown size={16} color={colors.highlight} />
          </TouchableOpacity>
        ) : showPoolSwitcher && !hasVisiblePools ? (
          <TouchableOpacity
            style={headerStyles.selector}
            onPress={() => {
              Alert.alert(
                'Join or Create a Pool?',
                'Head to Settings to join a pool with an invite code or create your own.',
                [
                  {text: 'Cancel', style: 'cancel'},
                  {text: 'Go to My Pools', onPress: () => navigation.navigate('SettingsTab', {expandPools: true})},
                ],
              );
            }}>
            <Text style={[headerStyles.poolName, {color: colors.primary, fontWeight: '700'}]} numberOfLines={1}>
              Join or Create a Pool
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={[headerStyles.message, {color: colors.textSecondary}]}>
            Pick once. Play every pool.
          </Text>
        )}
      </View>

      {showPoolSwitcher && (
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}>
          <View style={headerStyles.overlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setModalVisible(false)}
            />
            <View style={[headerStyles.modal, {backgroundColor: colors.surface}]}>
              <Text style={[headerStyles.modalTitle, {color: colors.textPrimary}]}>Switch Pool</Text>
              <ScrollView bounces={false}>
                {[
                  ...userPools.filter(p => !!(p.brand_config as any)?.is_branded),
                  ...userPools.filter(p => !(p.brand_config as any)?.is_branded),
                ].map(item => {
                  const unread = smackUnreadCounts[item.id] ?? 0;
                  const itemBranded = !!(item.brand_config as any)?.is_branded;
                  const itemHighlight = itemBranded ? (item.brand_config as any)?.highlight_color : null;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[headerStyles.poolOption, {borderBottomColor: colors.border}]}
                      onPress={() => switchTo(item.id)}>
                      <View style={headerStyles.poolOptionRow}>
                        <Text
                          style={[
                            headerStyles.poolOptionText,
                            {color: colors.textPrimary},
                            itemBranded && {fontWeight: '700', color: itemHighlight || colors.textPrimary},
                            item.id === activePoolId && !itemBranded && {color: colors.primary},
                          ]}>
                          {item.name}
                        </Text>
                        {(flaggedCounts[item.id] ?? 0) > 0 && (
                          <View style={headerStyles.flaggedDot}>
                            <Text style={headerStyles.flaggedDotText}>
                              {flaggedCounts[item.id]}
                            </Text>
                          </View>
                        )}
                        {unread > 0 && (
                          <MessageCircle
                            size={14}
                            color={colors.primary}
                            fill={colors.primary}
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  wordmark: {
    height: 40,
    width: 225,
  },
  partnerLogo: {
    height: 30,
    width: 160,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  switchLabel: {
    fontSize: 14,
  },
  poolName: {
    fontSize: 16,
  },
  message: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modal: {
    width: '80%',
    maxHeight: '60%',
    borderRadius: 12,
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  poolOption: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  poolOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  poolOptionText: {
    fontSize: 16,
  },
  flaggedDot: {
    backgroundColor: '#E53935',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  flaggedDotText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});

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
      <TabHeader title="Picks" showPoolSwitcher={false} />
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
      <TabHeader title="Leaders" showPoolSwitcher={true} />
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
      <TabHeader title="SmackTalk" showPoolSwitcher={true} />
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
      <View style={headerStyles.logoRow}>
        {brand.isBranded && brand.logo.full ? (
          <Image
            source={{uri: brand.logo.full}}
            style={headerStyles.partnerLogo}
            resizeMode="contain"
          />
        ) : (
          <Image
            source={wordmark}
            style={headerStyles.wordmark}
            resizeMode="contain"
          />
        )}
      </View>
      <SettingsScreen {...props} />
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
  const homeLabel = getTabDisplayName(userProfile);

  // Initialize sport stores when activeSport or activePoolId changes
  const seasonInitialize = useSeasonStore(s => s.initialize);
  const seasonConfig = useSeasonStore(s => s.config);
  const didInit = useRef(false);

  useEffect(() => {
    if (!activeSport || !activePoolId) return;

    if (activeSport.templateType === 'season') {
      // Only re-initialize if sport or pool changed
      if (
        !seasonConfig ||
        seasonConfig.competition !== activeSport.competition ||
        didInit.current === false
      ) {
        didInit.current = true;
        seasonInitialize(activeSport, activePoolId);
      }
    }
  }, [activeSport, activePoolId, seasonInitialize, seasonConfig]);

  return (
    <Tab.Navigator
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
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: ({focused}) => (
            <View style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: focused ? colors.primary : colors.surface,
              marginBottom: 20,
              shadowColor: focused ? colors.primary : '#000',
              shadowOffset: {width: 0, height: 4},
              shadowOpacity: focused ? 0.35 : 0.15,
              shadowRadius: 8,
              elevation: focused ? 8 : 4,
            }}>
              <Home size={28} color={focused ? '#FFFFFF' : colors.textSecondary} />
            </View>
          ),
        }}
      />
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
