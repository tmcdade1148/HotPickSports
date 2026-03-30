/**
 * PoolSwitcherBar — Unified pool switcher header.
 *
 * Single source of truth for the pool switcher UI across all tabs.
 * Self-contained: reads all pool data from globalStore internally.
 * Renders identically on Home, Leaderboard, SmackTalk, and Picks tabs.
 *
 * Usage:
 *   <PoolSwitcherBar mode="pool" />        — shows pool selector
 *   <PoolSwitcherBar mode="picks" />       — shows "Pick once" message
 */
import React, {useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {ChevronDown, ChevronLeft, MessageCircle} from 'lucide-react-native';
import {useTheme, useBrand} from '@shell/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {spacing} from '@shared/theme';

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

interface PoolSwitcherBarProps {
  mode: 'pool' | 'picks';
  onGoBack?: () => void;
}

export function PoolSwitcherBar({mode, onGoBack}: PoolSwitcherBarProps) {
  const {colors} = useTheme();
  const brand = useBrand();
  const navigation = useNavigation<any>();
  const [modalVisible, setModalVisible] = useState(false);

  const userPools = useGlobalStore(s => s.visiblePools);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);
  const flaggedCounts = useGlobalStore(s => s.flaggedCounts);

  const activePool = userPools.find(p => p.id === activePoolId);
  const poolName = activePool?.name ?? '';
  const hasVisiblePools = userPools.length > 0;
  const wordmark = isDarkBg(colors.background) ? wordmarkDark : wordmarkLight;

  const switchTo = (poolId: string) => {
    setActivePoolId(poolId);
    setModalVisible(false);
  };

  const goToSettings = () => {
    Alert.alert(
      'Join or Create a Pool?',
      'Head to Settings to join a pool with an invite code or create your own.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Go to My Pools', onPress: () => navigation.navigate('SettingsTab', {expandPools: true})},
      ],
    );
  };

  return (
    <View style={[styles.container, {backgroundColor: colors.background, borderBottomColor: colors.surface}]}>
      {/* Logo row */}
      <View style={styles.logoRow}>
        {onGoBack && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onGoBack}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <ChevronLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        {brand.isBranded && brand.logo.full ? (
          <Image
            source={{uri: brand.logo.full}}
            style={styles.partnerLogo}
            resizeMode="contain"
          />
        ) : (
          <Image
            source={wordmark}
            style={styles.wordmark}
            resizeMode="contain"
          />
        )}
      </View>

      {/* Pool selector row */}
      <View style={styles.row}>
        {mode === 'picks' ? (
          <Text style={[styles.message, {color: colors.textSecondary}]}>
            Pick once. Play every pool.
          </Text>
        ) : hasVisiblePools ? (
          <TouchableOpacity
            style={styles.selector}
            onPress={() => setModalVisible(true)}>
            <Text style={[styles.switchLabel, {color: colors.textSecondary}]}>
              Current Pool:
            </Text>
            <Text
              style={[styles.poolName, {color: colors.highlight, fontWeight: '900'}]}
              numberOfLines={1}>
              {poolName}
            </Text>
            <ChevronDown size={16} color={colors.highlight} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.selector} onPress={goToSettings}>
            <Text
              style={[styles.poolName, {color: colors.primary, fontWeight: '700'}]}
              numberOfLines={1}>
              Join or Create a Pool
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Pool switch modal */}
      {mode === 'pool' && (
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}>
          <View style={styles.overlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setModalVisible(false)}
            />
            <View style={[styles.modal, {backgroundColor: colors.surface}]}>
              <Text style={[styles.modalTitle, {color: colors.textPrimary}]}>
                Switch Pool
              </Text>
              <ScrollView bounces={false}>
                {[
                  ...userPools.filter(p => !!(p.brand_config as any)?.is_branded),
                  ...userPools.filter(p => !(p.brand_config as any)?.is_branded),
                ].map(item => {
                  const unread = smackUnreadCounts[item.id] ?? 0;
                  const flagged = flaggedCounts[item.id] ?? 0;
                  const itemBranded = !!(item.brand_config as any)?.is_branded;
                  const itemHighlight = itemBranded
                    ? (item.brand_config as any)?.highlight_color
                    : null;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.poolOption, {borderBottomColor: colors.border}]}
                      onPress={() => switchTo(item.id)}>
                      <View style={styles.poolOptionRow}>
                        <Text
                          style={[
                            styles.poolOptionText,
                            {color: colors.textPrimary},
                            itemBranded && {
                              fontWeight: '700',
                              color: itemHighlight || colors.textPrimary,
                            },
                            item.id === activePoolId &&
                              !itemBranded && {color: colors.primary},
                          ]}>
                          {item.name}
                        </Text>
                        {flagged > 0 && (
                          <View style={styles.flaggedDot}>
                            <Text style={styles.flaggedDotText}>{flagged}</Text>
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
                      {item.id === activePoolId && (
                        <Text style={{color: colors.primary, fontSize: 16}}>
                          {'\u2713'}
                        </Text>
                      )}
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

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    zIndex: 1,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  poolOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
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
