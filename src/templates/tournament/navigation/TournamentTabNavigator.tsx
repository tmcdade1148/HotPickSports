import React, {useEffect} from 'react';
import {View, Text} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {
  CheckCircle,
  Grid3x3,
  BarChart2,
  MessageCircle,
} from 'lucide-react-native';
import type {TournamentConfig, TabConfig} from '@shared/types/templates';
import {colors} from '@shared/theme';
import {useTournamentStore} from '../stores/tournamentStore';
import {TournamentPicksHub} from '../screens/TournamentPicksHub';
import {GroupPicksScreen} from '../screens/GroupPicksScreen';
import {MatchPicksScreen} from '../screens/MatchPicksScreen';
import {TournamentBoardScreen} from '../screens/TournamentBoardScreen';

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
// Placeholder screen for SmackTalk tab
// ---------------------------------------------------------------------------

function SmackTalkPlaceholder() {
  return (
    <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
      <Text style={{fontSize: 20, fontWeight: '600'}}>SmackTalk</Text>
      <Text style={{fontSize: 14, color: '#6B6B6B', marginTop: 8}}>
        Chat with your pool — coming soon
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen mapping — maps config tab keys to screen components
// ---------------------------------------------------------------------------

const SCREEN_MAP: Record<string, React.ComponentType<any>> = {
  picks: PicksNavigator,
  groups: GroupPicksScreen,
  board: TournamentBoardScreen,
  smacktalk: SmackTalkPlaceholder,
};

// ---------------------------------------------------------------------------
// Tab Navigator — 100% config-driven
// ---------------------------------------------------------------------------

const Tab = createBottomTabNavigator();

interface TournamentTabNavigatorProps {
  config: TournamentConfig;
}

/**
 * TournamentTabNavigator — Bottom tabs driven by config.tabs.
 * Add a tab in the sport config, it appears automatically.
 * Never references a specific sport.
 */
export function TournamentTabNavigator({config}: TournamentTabNavigatorProps) {
  const initialize = useTournamentStore(s => s.initialize);

  useEffect(() => {
    initialize(config);
  }, [config, initialize]);

  return (
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
    </Tab.Navigator>
  );
}
