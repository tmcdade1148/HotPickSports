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
import {
  CheckCircle,
  BarChart2,
  MessageCircle,
  ChevronDown,
  ChevronLeft,
  Settings,
} from 'lucide-react-native';
import type {SeriesConfig, TabConfig} from '@shared/types/templates';
import type {DbPool} from '@shared/types/database';
import {spacing, borderRadius} from '@shared/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useSeriesStore} from '../stores/seriesStore';
import {SeriesPicksScreen} from '../screens/SeriesPicksScreen';
import {SeriesBoardScreen} from '../screens/SeriesBoardScreen';
import {SmackTalkScreen} from '@shared/components/SmackTalkScreen';
import {SettingsScreen} from '@shell/screens/SettingsScreen';
import {useTheme} from '@shell/theme';

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
  const poolId = useSeriesStore(s => s.poolId);
  return <SmackTalkScreen poolId={poolId} />;
}

// ---------------------------------------------------------------------------
// Screen mapping — maps config tab keys to screen components
// ---------------------------------------------------------------------------

const SCREEN_MAP: Record<string, React.ComponentType<any>> = {
  picks: SeriesPicksScreen,
  board: SeriesBoardScreen,
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
  onOpenSettings?: () => void;
  onGoHome?: () => void;
}

function PoolSwitcherHeader({
  poolName,
  userPools,
  onSwitchPool,
  activePoolId,
  accentColor,
  onOpenSettings,
  onGoHome,
}: PoolSwitcherHeaderProps) {
  const {colors} = useTheme();
  const headerStyles = createHeaderStyles(colors);
  const [modalVisible, setModalVisible] = useState(false);
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);

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

        <TouchableOpacity
          style={headerStyles.selector}
          onPress={() => setModalVisible(true)}>
          <Text style={headerStyles.poolName} numberOfLines={1}>
            {poolName}
          </Text>
          <ChevronDown size={16} color={colors.textSecondary} />
        </TouchableOpacity>

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

      <Modal visible={modalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={headerStyles.overlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}>
          <View style={headerStyles.modal}>
            <Text style={headerStyles.modalTitle}>Switch Pool</Text>
            <FlatList
              data={[...userPools.filter(p => !!(p.brand_config as any)?.is_branded), ...userPools.filter(p => !(p.brand_config as any)?.is_branded)]}
              keyExtractor={p => p.id}
              renderItem={({item}) => {
                const unread = smackUnreadCounts[item.id] ?? 0;
                const itemBranded = !!(item.brand_config as any)?.is_branded;
                const itemHighlight = itemBranded ? (item.brand_config as any)?.highlight_color : null;
                return (
                  <TouchableOpacity
                    style={headerStyles.poolOption}
                    onPress={() => switchTo(item.id)}>
                    <View style={headerStyles.poolOptionRow}>
                      <Text
                        style={[
                          headerStyles.poolOptionText,
                          itemBranded && {fontWeight: '700', color: itemHighlight || '#FFFFFF'},
                          item.id === activePoolId && !itemBranded && {color: accentColor},
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
              }}
            />
          </View>
        </TouchableOpacity>
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

interface SeriesTabNavigatorProps {
  config: SeriesConfig;
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
 * SeriesTabNavigator — Bottom tabs driven by config.tabs.
 * Add a tab in the sport config, it appears automatically.
 * Never references a specific sport.
 */
export function SeriesTabNavigator({
  config,
  poolId,
  poolName,
  userPools,
  onSwitchPool,
  onOpenSettings,
  onGoHome,
}: SeriesTabNavigatorProps) {
  const {colors} = useTheme();
  const initialize = useSeriesStore(s => s.initialize);

  useEffect(() => {
    initialize(config, poolId);
  }, [config, poolId, initialize]);

  return (
    <View style={{flex: 1}}>
      {onSwitchPool && userPools && (
        <PoolSwitcherHeader
          poolName={poolName ?? 'Pool'}
          userPools={userPools}
          onSwitchPool={onSwitchPool}
          activePoolId={poolId}
          accentColor={config.color}
          onOpenSettings={onOpenSettings}
          onGoHome={onGoHome}
        />
      )}
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
              name={`Series_${tab.key}`}
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
          name="Series_settings"
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
