import React from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {TouchableOpacity} from 'react-native';
import {ChevronLeft} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

export function AboutScreen() {
  const navigation = useNavigation<any>();
  const {colors} = useTheme();

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.textPrimary}]}>About</Text>
        <View style={{width: 24}} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}>
        <Text style={[styles.appName, {color: colors.primary}]}>HotPick Sports</Text>
        <Text style={[styles.tagline, {color: colors.textPrimary}]}>
          Pick once. Play everywhere.
        </Text>

        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            HotPick Sports is a social sports prediction platform where your picks
            travel with you across every pool you join. Compete with friends, family,
            and colleagues — all from a single set of picks each week.
          </Text>
        </View>

        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>What makes HotPick different</Text>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Traditional pick'em apps make you submit picks separately for every pool.
            HotPick flips that — you make your picks once, and your scores count
            everywhere. Join five pools, make picks once.
          </Text>
        </View>

        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>The HotPick</Text>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Every week, designate one pick as your HotPick. A correct HotPick
            earns the game's full rank value as points; an incorrect HotPick
            subtracts that value from your weekly total. It's the mechanic that
            rewards conviction on close games.
          </Text>
        </View>

        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>Built for communities</Text>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            HotPick is designed for real communities — friend groups, offices,
            fantasy leagues, sports bars, and local organizations. Create a pool,
            share your invite code, and let the SmackTalk begin.
          </Text>
        </View>

        <Text style={[styles.version, {color: colors.textSecondary}]}>
          Version 2.0.0
        </Text>
        <Text style={[styles.copyright, {color: colors.textSecondary}]}>
          {'\u00A9'} 2026 HotPick Sports. All rights reserved.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  appName: {
    fontSize: 28,
    fontWeight: '900',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
  },
  version: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  copyright: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
