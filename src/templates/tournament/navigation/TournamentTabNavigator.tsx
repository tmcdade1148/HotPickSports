import React, {useEffect, useMemo, useState} from 'react';
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
  User,
} from 'lucide-react-native';
import type {TournamentConfig, TabConfig} from '@shared/types/templates';
import type {DbPool} from '@shared/types/database';
import {useTheme} from '@shell/theme';
import {useTournamentStore} from '../stores/tournamentStore';
import {TournamentPicksHub} from '../screens/TournamentPicksHub';
import {GroupPicksScreen} from '../screens/GroupPicksScreen';
import {MatchPicksScreen} from '../screens/MatchPicksScreen';
import {TournamentBoardScreen} from '../screens/TournamentBoardScreen';
import {SmackTalkScreen} from '@shared/components/SmackTalkScreen';

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

interface PoolSwitcherHeaderProps {
  poolName: string;
  userPools: DbPool[];
  onSwitchPool: (poolId: string) => void;
  activePoolId: string;
  accentColor: string;
  onOpenProfile?: () => void;
}

function PoolSwitcherHeader({
  poolName,
  userPools,
  onSwitchPool,
  activePoolId,
  accentColor,
  onOpenProfile,
}: PoolSwitcherHeaderProps) {
  const {colors, spacing, borderRadius} = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const switchTo = (poolId: string) => {
    onSwitchPool(poolId);
    setModalVisible(false);
  };

  const headerStyles = useMemo(() => StyleSheet.create({
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
    profileButton: {
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
      color: colors.text,
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
      color: colors.text,
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
    poolOptionText: {
      fontSize: 16,
      color: colors.text,
    },
  }), [colors, spacing, borderRadius]);

  return (
    <View style={headerStyles.container}>
      <View style={headerStyles.row}>
        {/* Spacer to balance profile icon — keeps pool name centered */}
        <View style={headerStyles.iconSpacer} />

        <TouchableOpacity
          style={headerStyles.selector}
          onPress={() => setModalVisible(true)}>
          <Text style={headerStyles.poolName} numberOfLines={1}>
            {poolName}
          </Text>
          <ChevronDown size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {onOpenProfile ? (
          <TouchableOpacity
            style={headerStyles.profileButton}
            onPress={onOpenProfile}>
            <User size={22} color={colors.textSecondary} />
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
              data={userPools}
              keyExtractor={p => p.id}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={headerStyles.poolOption}
                  onPress={() => switchTo(item.id)}>
                  <Text
                    style={[
                      headerStyles.poolOptionText,
                      item.id === activePoolId && {color: accentColor},
                    ]}>
                    {item.name}
                  </Text>
                  {item.id === activePoolId && (
                    <Text style={{color: accentColor}}>{'checkmark'}</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

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
  onOpenProfile?: () => void;
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
  onOpenProfile,
}: TournamentTabNavigatorProps) {
  const {colors} = useTheme();
  const initialize = useTournamentStore(s => s.initialize);

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
          onOpenProfile={onOpenProfile}
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
    </View>
  );
}
