import React, {useEffect, useState} from 'react';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {
  CheckCircle,
  BarChart2,
  MessageCircle,
  ChevronDown,
  ChevronLeft,
  Settings,
} from 'lucide-react-native';
import type {SeasonConfig, TabConfig} from '@shared/types/templates';
import type {DbPool} from '@shared/types/database';
import {spacing, borderRadius} from '@shared/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useSeasonStore} from '../stores/seasonStore';
import {SeasonPicksScreen} from '../screens/SeasonPicksScreen';
import {SeasonBoardScreen} from '../screens/SeasonBoardScreen';
import {SmackTalkScreen} from '@shared/components/SmackTalkScreen';
import {useTheme} from '@shell/theme';
import {HOTPICK_DEFAULTS} from '@shell/theme/defaults';

// ---------------------------------------------------------------------------
// Icon mapping — maps config icon strings to Lucide components
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  'check-circle': CheckCircle,
  'bar-chart-2': BarChart2,
  'message-circle': MessageCircle,
};

// ---------------------------------------------------------------------------
// SmackTalk wrapper — passes poolId to the shared SmackTalkScreen
// ---------------------------------------------------------------------------

function SmackTalkTab() {
  const poolId = useSeasonStore(s => s.poolId);
  return <SmackTalkScreen poolId={poolId} />;
}

// ---------------------------------------------------------------------------
// Screen mapping — maps config tab keys to screen components
// ---------------------------------------------------------------------------

const SCREEN_MAP: Record<string, React.ComponentType<any>> = {
  picks: SeasonPicksScreen,
  board: SeasonBoardScreen,
  smacktalk: SmackTalkTab,
};

// ---------------------------------------------------------------------------
// PoolSwitcherHeader removed — unified in PoolSwitcherBar

const createHeaderStyles = (_colors: any) => StyleSheet.create({
  // Kept as placeholder — will be cleaned up in follow-up
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '80%',
    maxHeight: '50%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  poolOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  poolOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  poolOptionText: {
    fontSize: 16,
    color: colors.textPrimary,
  },
});

// ---------------------------------------------------------------------------
// Tab Navigator — 100% config-driven
// ---------------------------------------------------------------------------

const Tab = createBottomTabNavigator();

interface SeasonTabNavigatorProps {
  config: SeasonConfig;
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
 * SeasonTabNavigator — Bottom tabs driven by config.tabs.
 * Add a tab in the sport config, it appears automatically.
 * Never references a specific sport.
 *
 * Deep-linking to a specific tab (e.g. Board or SmackTalk) is handled
 * by React Navigation's nested screen syntax from the parent:
 *   navigation.navigate('EventDetail', { screen: 'Season_board' })
 */
export function SeasonTabNavigator({
  config,
  poolId,
  poolName,
  userPools,
  onSwitchPool,
  onOpenSettings,
  onGoHome,
}: SeasonTabNavigatorProps) {
  const {colors} = useTheme();
  const initialize = useSeasonStore(s => s.initialize);
  const nflCurrentWeek = useNFLStore(s => s.currentWeek);
  const [activeTabKey, setActiveTabKey] = useState(
    config.tabs[0]?.key ?? 'picks',
  );

  useEffect(() => {
    initialize(config, poolId, nflCurrentWeek);
  }, [config.competition, poolId, nflCurrentWeek, initialize]);

  const initialRouteName = `Season_${config.tabs[0]?.key ?? 'picks'}`;

  return (
    <View style={{flex: 1}}>
      {/* Pool switcher now handled by PoolSwitcherBar in parent */}
      <Tab.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.surface,
          },
          headerShown: false,
        }}
        screenListeners={{
          state: e => {
            const state = e.data?.state;
            if (state) {
              const route = state.routes[state.index];
              // Route names are "Season_picks", "Season_board", etc.
              const key = route?.name?.replace('Season_', '') ?? '';
              setActiveTabKey(key);
            }
          },
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
              name={`Season_${tab.key}`}
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
    </View>
  );
}
