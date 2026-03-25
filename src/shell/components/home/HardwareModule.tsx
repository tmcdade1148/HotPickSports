import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {Trophy, Target, Zap, Shield, Award, Flame, ChevronRight} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import type {UserHardwareItem} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme';
import {spacing, borderRadius} from '@shared/theme';

const ICON_MAP: Record<string, any> = {
  pool_champion: Trophy,
  podium_2nd: Trophy,
  podium_3rd: Trophy,
  sharpshooter_week: Target,
  gunslinger_week: Zap,
  contrarian_week: Shield,
  perfect_week: Award,
  biggest_comeback: Zap,
  iron_poolie: Shield,
  season_sharpshooter: Target,
  hotpick_artist: Flame,
  season_contrarian: Shield,
  season_tactician: Target,
};

interface HardwareModuleProps {
  onPress: () => void;
}

/**
 * HardwareModule — Home Screen module showing latest earned award.
 *
 * Only renders when the user has at least one award.
 * Tapping navigates to the History tab.
 */
export function HardwareModule({onPress}: HardwareModuleProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const userHardware = useGlobalStore(s => s.userHardware);

  if (userHardware.length === 0) return null;

  // Most recent award (already sorted by awarded_at DESC in loadUserHardware)
  const latest = userHardware[0];
  const Icon = ICON_MAP[latest.hardwareSlug] ?? Award;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconCircle, {backgroundColor: colors.primary + '15'}]}>
        <Icon size={20} color={colors.primary} />
      </View>
      <View style={styles.textColumn}>
        <Text style={styles.label}>Latest Hardware</Text>
        <Text style={styles.awardName} numberOfLines={1}>{latest.hardwareName}</Text>
        {latest.week && (
          <Text style={styles.detail}>Week {latest.week}</Text>
        )}
      </View>
      <View style={styles.rightColumn}>
        <Text style={styles.totalCount}>{userHardware.length}</Text>
        <Text style={styles.totalLabel}>earned</Text>
        <ChevronRight size={16} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  awardName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  detail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  rightColumn: {
    alignItems: 'center',
    gap: 1,
  },
  totalCount: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
