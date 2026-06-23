// AdminPlatformHealthScreen — placeholder per April 2026 spec §5.6.
// Reserves the navigation slot for post-launch analytics. No queries,
// no data, no charts.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ChevronLeft, Activity} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing} from '@shared/theme';
import {RequireSuperAdmin} from '@shell/components/RequireSuperAdmin';

export function AdminPlatformHealthScreen() {
  return (
    <RequireSuperAdmin>
      <AdminPlatformHealthScreenImpl />
    </RequireSuperAdmin>
  );
}

function AdminPlatformHealthScreenImpl() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={[styles.shell, {backgroundColor: colors.background}]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <ChevronLeft color={colors.textPrimary} size={24} />
        </Pressable>
        <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
          PLATFORM HEALTH
        </Text>
        <View style={{width: 24}} />
      </View>

      <View style={styles.center}>
        <Activity size={64} color={colors.textTertiary} strokeWidth={1.5} />
        <Text style={[displayType.display, {fontSize: 22, color: colors.textPrimary, marginTop: spacing.lg}]}>
          COMING SOON
        </Text>
        <Text style={[bodyType.regular, {color: colors.textSecondary, marginTop: spacing.md, textAlign: 'center', fontSize: 13, lineHeight: 18, maxWidth: 320}]}>
          Platform analytics and monitoring. Engagement, retention, perk
          redemption, broadcast open rates, error rates. Shipping after
          NFL Season 2 launch.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  title: {fontSize: 16, letterSpacing: 0.5},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg},
});
