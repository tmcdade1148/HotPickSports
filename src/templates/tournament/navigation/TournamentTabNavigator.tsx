import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {
  CheckCircle,
  Grid3x3,
  BarChart2,
  MessageCircle,
  ChevronDown,
  ChevronLeft,
  Settings,
} from 'lucide-react-native';
import type {TournamentConfig, TabConfig} from '@shared/types/templates';
import type {DbPool} from '@shared/types/database';
import {spacing, borderRadius} from '@shared/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTournamentStore} from '../stores/tournamentStore';
import {TournamentPicksHub} from '../screens/TournamentPicksHub';
import {GroupPicksScreen} from '../screens/GroupPicksScreen';
import {MatchPicksScreen} from '../screens/MatchPicksScreen';
import {TournamentBoardScreen} from '../screens/TournamentBoardScreen';
import {SmackTalkScreen} from '@shared/components/SmackTalkScreen';
import {SettingsScreen} from '@shell/screens/SettingsScreen';
import {useTheme} from '@shell/theme';
import {isPoolVisible} from '@shared/utils/poolVisibility';

// ---------------------------------------------------------------------------
// Icon mapping — maps config icon strings to Lucide components
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  'check-circle': CheckCircle,
  'grid-3x3': Grid3x3,
  'bar-chart-2': BarChart2,
  'message-circle': MessageCircle,
};

// ---------------------------------------------------------------------------
// Picks stack — nested navigation within the Picks tab
// ---------------------------------------------------------------------------

const PicksStack = createNativeStackNavigator();

function PicksNavigator() {
  return (
    <PicksStack.Navigator screenOptions={{headerShown: false}}>
      <PicksStack.Screen name="PicksHub" component={TournamentPicksHub} />
      <PicksStack.Screen name="GroupPicks" component={GroupPicksScreen} />
      <PicksStack.Screen name="MatchPicks" component={MatchPicksScreen} />
    </PicksStack.Navigator>
  );
}

// ---------------------------------------------------------------------------
// SmackTalk wrapper — passes poolId to the shared SmackTalkScreen
// ---------------------------------------------------------------------------

function SmackTalkTab() {
  const poolId = useTournamentStore(s => s.poolId);
  return <SmackTalkScreen poolId={poolId} />;
}

// ---------------------------------------------------------------------------
// Screen mapping — maps config tab keys to screen components
// ---------------------------------------------------------------------------

const SCREEN_MAP: Record<string, React.ComponentType<any>> = {
  picks: PicksNavigator,
  groups: GroupPicksScreen,
  board: TournamentBoardScreen,
  smacktalk: SmackTalkTab,
};

// ---------------------------------------------------------------------------
// Pool Switcher Header
// ---------------------------------------------------------------------------

// PoolSwitcherHeader removed — unified in PoolSwitcherBar

// ---------------------------------------------------------------------------
// Tab Navigator — 100% config-driven
// ---------------------------------------------------------------------------

const Tab = createBottomTabNavigator();

interface TournamentTabNavigatorProps {
  config: TournamentConfig;
  poolId: string;
  /** Pool name shown in the header. Falls back to "Pool" if not provided. */
  poolName?: string;
  /** User's pools for the switcher modal. */
  userPools?: DbPool[];
  /** Callback when user selects a different pool in the switcher. */
  onSwitchPool?: (poolId: string) => void;
  /** Callback to open the profile screen (provided by shell). */
  onOpenSettings?: () => void;
  /** Callback to navigate back to the Home Screen. */
  onGoHome?: () => void;
}

/**
 * TournamentTabNavigator — Bottom tabs driven by config.tabs.
 * Add a tab in the sport config, it appears automatically.
 * Never references a specific sport.
 */
export function TournamentTabNavigator({
  config,
  poolId,
  poolName,
  userPools,
  onSwitchPool,
  onOpenSettings,
  onGoHome,
}: TournamentTabNavigatorProps) {
  const {colors} = useTheme();
  const initialize = useTournamentStore(s => s.initialize);

  useEffect(() => {
    initialize(config, poolId);
  }, [config, poolId, initialize]);

  return (
    <View style={{flex: 1}}>
      {/* Pool switcher now handled by PoolSwitcherBar in parent */}
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: config.color,
          tabBarInactiveTintColor: colors.textSecondary,
          headerShown: false,
        }}>
        {config.tabs.map((tab: TabConfig) => {
          const Icon = ICON_MAP[tab.icon];
          const Screen = SCREEN_MAP[tab.key];

          if (!Screen) {
            return null;
          }

          return (
            <Tab.Screen
              key={tab.key}
              name={`Tournament_${tab.key}`}
              component={Screen}
              options={{
                title: tab.label,
                tabBarIcon: Icon
                  ? ({color, size}: {color: string; size: number}) => (
                      <Icon color={color} size={size} />
                    )
                  : undefined,
              }}
            />
          );
        })}
        <Tab.Screen
          name="Tournament_settings"
          component={SettingsScreen}
          options={{
            title: 'Settings',
            tabBarIcon: ({color, size}: {color: string; size: number}) => (
              <Settings color={color} size={size} />
            ),
          }}
        />
      </Tab.Navigator>
    </View>
  );
}
