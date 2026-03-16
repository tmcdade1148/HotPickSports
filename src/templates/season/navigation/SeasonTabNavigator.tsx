import React, {useEffect, useState} from 'react';
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
// Pool Switcher Header
// ---------------------------------------------------------------------------

interface PoolSwitcherHeaderProps {
  poolName: string;
  userPools: DbPool[];
  onSwitchPool: (poolId: string) => void;
  activePoolId: string;
  accentColor: string;
  activeTabKey?: string;
  onOpenSettings?: () => void;
  onGoHome?: () => void;
}

function PoolSwitcherHeader({
  poolName,
  userPools,
  onSwitchPool,
  activePoolId,
  accentColor,
  activeTabKey,
  onOpenSettings,
  onGoHome,
}: PoolSwitcherHeaderProps) {
  const {colors} = useTheme();
  const headerStyles = createHeaderStyles(colors);
  const [modalVisible, setModalVisible] = useState(false);
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);

  const isPicksTab = activeTabKey === 'picks';

  const switchTo = (poolId: string) => {
    onSwitchPool(poolId);
    setModalVisible(false);
  };

  return (
    <View style={headerStyles.container}>
      <View style={headerStyles.row}>
        {onGoHome ? (
          <TouchableOpacity
            style={headerStyles.backButton}
            onPress={onGoHome}>
            <ChevronLeft size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={headerStyles.iconSpacer} />
        )}

        {isPicksTab ? (
          <Text style={headerStyles.picksMessage}>
            Pick once. Play every pool.
          </Text>
        ) : (
          <TouchableOpacity
            style={headerStyles.selector}
            onPress={() => setModalVisible(true)}>
            <Text style={headerStyles.poolName} numberOfLines={1}>
              {poolName}
            </Text>
            <ChevronDown size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {onOpenSettings ? (
          <TouchableOpacity
            style={headerStyles.settingsButton}
            onPress={onOpenSettings}>
            <Settings size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={headerStyles.iconSpacer} />
        )}
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}>
        <View style={headerStyles.overlay}>
          {/* Background dismiss — sibling, not parent of modal content */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          />
          {/* Modal content — completely decoupled from dismiss handler */}
          <View style={headerStyles.modal}>
            <Text style={headerStyles.modalTitle}>Switch Pool</Text>
            <ScrollView bounces={false}>
              {userPools.map(item => {
                const unread = smackUnreadCounts[item.id] ?? 0;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={headerStyles.poolOption}
                    onPress={() => switchTo(item.id)}>
                    <View style={headerStyles.poolOptionRow}>
                      <Text
                        style={[
                          headerStyles.poolOptionText,
                          item.id === activePoolId && {color: accentColor},
                        ]}>
                        {item.name}
                      </Text>
                      {unread > 0 && (
                        <MessageCircle
                          size={14}
                          color={colors.primary}
                          fill={colors.primary}
                        />
                      )}
                    </View>
                    {item.id === activePoolId && (
                      <Text style={{color: accentColor}}>{'\u2713'}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createHeaderStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconSpacer: {
    width: 36,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  poolName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    maxWidth: 200,
  },
  picksMessage: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
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
  const [activeTabKey, setActiveTabKey] = useState(
    config.tabs[0]?.key ?? 'picks',
  );

  useEffect(() => {
    initialize(config, poolId);
  }, [config, poolId, initialize]);

  const initialRouteName = `Season_${config.tabs[0]?.key ?? 'picks'}`;

  return (
    <View style={{flex: 1}}>
      {onSwitchPool && userPools && (
        <PoolSwitcherHeader
          poolName={poolName ?? 'Pool'}
          userPools={userPools}
          onSwitchPool={onSwitchPool}
          activePoolId={poolId}
          accentColor={config.color}
          activeTabKey={activeTabKey}
          onOpenSettings={onOpenSettings}
          onGoHome={onGoHome}
        />
      )}
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
