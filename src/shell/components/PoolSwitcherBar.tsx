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
import {Text} from '@shared/components/AppText';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {ChevronDown, ChevronLeft} from 'lucide-react-native';
import {useTheme, useBrand} from '@shell/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {spacing} from '@shared/theme';
import {ContestSwitchModal} from './ContestSwitchModal';

 
const wordmarkLight = require('../../assets/hotpick-wordmark-lt.png');
 
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

  const activePool = userPools.find(p => p.id === activePoolId);
  const poolName = activePool?.name ?? '';
  const hasVisiblePools = userPools.length > 0;
  const wordmark = isDarkBg(colors.background) ? wordmarkDark : wordmarkLight;

  const goToSettings = () => {
    Alert.alert(
      'Join or Start a Contest?',
      'Head to Settings to join a Contest with an invite code or create your own.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Go to My Contests', onPress: () => navigation.navigate('SettingsTab', {expandPools: true})},
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
            Pick once. Play everywhere.
          </Text>
        ) : hasVisiblePools ? (
          <TouchableOpacity
            style={styles.selector}
            onPress={() => setModalVisible(true)}>
            <Text style={[styles.switchLabel, {color: colors.textSecondary}]}>
              Current Contest:
            </Text>
            <Text
              style={[styles.poolName, {color: colors.accentTeal, fontWeight: '900'}]}
              numberOfLines={1}>
              {poolName}
            </Text>
            <ChevronDown size={22} color={colors.accentTeal} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.selector} onPress={goToSettings}>
            <Text
              style={[styles.poolName, {color: colors.primary, fontWeight: '700'}]}
              numberOfLines={1}>
              Join or Start a Contest
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Pool switch modal \u2014 shared with PoolHeader's chevron (one modal). */}
      {mode === 'pool' && (
        <ContestSwitchModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
        />
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
    fontSize: 15,
    fontWeight: '500',
  },
  poolName: {
    fontSize: 20,
    fontWeight: '900',
  },
  message: {
    fontSize: 18,
    fontWeight: '700',
    fontStyle: 'italic',
  },
});
