// AdminHomeScreen — landing screen for super_admin (Settings → HotPick Admin).
//
// Six nav cards: Moderation Queue, Pool Management, Partner Management,
// Broadcast, Score Corrections (placeholder), Platform Health (placeholder).
// Each card shows a live count where applicable so the super admin can
// scan for "what needs me right now."
//
// Per April 2026 Super Admin spec §5.2. Gated at the navigation level
// via Settings — but also defensively re-checks is_super_admin on mount
// in case routing somehow lands here without the gate.

import React, {useEffect, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {ScrollView, StyleSheet, View, Pressable} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ChevronLeft, AlertTriangle, Megaphone, Activity, Shield, Target, ChevronRight, Building, Users, CalendarClock} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';
import {RequireSuperAdmin} from '@shell/components/RequireSuperAdmin';

export function AdminHomeScreen() {
  // Auth gate at the wrapper so every admin screen guarantees it's
  // running for a super_admin without each one re-checking.
  return (
    <RequireSuperAdmin>
      <AdminHomeScreenImpl />
    </RequireSuperAdmin>
  );
}

function AdminHomeScreenImpl() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const [escalatedCount, setEscalatedCount] = useState<number | null>(null);
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const [clubCount, setClubCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [{count: esc}, {count: pools}, {count: clubs}] = await Promise.all([
        supabase
          .from('smack_messages')
          .select('id', {count: 'exact', head: true})
          .eq('moderation_status', 'escalated')
          .eq('is_removed', false),
        supabase
          .from('pools')
          .select('id', {count: 'exact', head: true})
          .eq('is_archived', false)
          .is('deleted_at', null),
        supabase
          .from('partners')
          .select('id', {count: 'exact', head: true})
          .eq('is_active', true),
      ]);
      setEscalatedCount(esc ?? 0);
      setPoolCount(pools ?? 0);
      setClubCount(clubs ?? 0);
    })();
  }, []);

  return (
    <SafeAreaView style={[styles.shell, {backgroundColor: colors.background}]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <ChevronLeft color={colors.textPrimary} size={24} />
        </Pressable>
        <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
          HOTPICK ADMIN
        </Text>
        <View style={{width: 24}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Card
          color={colors}
          icon={<AlertTriangle size={22} color={colors.warning ?? colors.primary} strokeWidth={2.25} />}
          title="Moderation Queue"
          subtitle={
            escalatedCount === null
              ? '—'
              : escalatedCount === 0
                ? 'Nothing awaiting your review.'
                : `${escalatedCount} message${escalatedCount === 1 ? '' : 's'} awaiting your review`
          }
          highlight={escalatedCount !== null && escalatedCount > 0}
          onPress={() => navigation.navigate('AdminModerationQueue')}
        />

        <Card
          color={colors}
          icon={<Shield size={22} color={colors.primary} strokeWidth={2.25} />}
          title="Pool Management"
          subtitle={
            poolCount === null
              ? 'All Contests across the platform.'
              : `${poolCount} active Contests · suspend / unsuspend`
          }
          onPress={() => navigation.navigate('AdminPoolManagement')}
        />

        <Card
          color={colors}
          icon={<Building size={22} color={colors.primary} strokeWidth={2.25} />}
          title="Partner Management"
          subtitle={
            clubCount === null
              ? 'Create / configure Partners.'
              : `${clubCount} active Partners · create / edit`
          }
          onPress={() => navigation.navigate('PartnerAdmin')}
        />

        <Card
          color={colors}
          icon={<CalendarClock size={22} color={colors.primary} strokeWidth={2.25} />}
          title="Season Control"
          subtitle="Advance the season phase (regular → playoffs → Super Bowl)."
          onPress={() => navigation.navigate('AdminSeasonControl')}
        />

        <Card
          color={colors}
          icon={<Megaphone size={22} color={colors.primary} strokeWidth={2.25} />}
          title="Broadcast"
          subtitle="Send to all users or a sport. 1 per 24 hours."
          onPress={() => navigation.navigate('AdminBroadcast')}
        />

        <Card
          color={colors}
          icon={<Users size={22} color={colors.primary} strokeWidth={2.25} />}
          title="Beta Testers"
          subtitle="Manage who can see NFL 2025 SIM."
          onPress={() => navigation.navigate('AdminBetaTesters')}
        />

        <Card
          color={colors}
          icon={<Target size={22} color={colors.textTertiary} strokeWidth={2.25} />}
          title="Score Corrections"
          subtitle="Coming soon — override pick / game results."
          disabled
        />

        <Card
          color={colors}
          icon={<Activity size={22} color={colors.textTertiary} strokeWidth={2.25} />}
          title="Platform Health"
          subtitle="Coming soon — analytics + monitoring."
          onPress={() => navigation.navigate('AdminPlatformHealth')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({
  color,
  icon,
  title,
  subtitle,
  onPress,
  highlight,
  disabled,
}: {
  color: ReturnType<typeof useTheme>['colors'];
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress?: () => void;
  highlight?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({pressed}) => [
        styles.card,
        {
          backgroundColor: color.surface,
          borderColor: highlight ? color.warning ?? color.primary : color.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}>
      <View style={styles.cardIcon}>{icon}</View>
      <View style={{flex: 1, minWidth: 0}}>
        <Text style={[bodyType.bold, styles.cardTitle, {color: color.textPrimary}]}>{title}</Text>
        <Text style={[bodyType.regular, styles.cardSubtitle, {color: color.textSecondary}]}>
          {subtitle}
        </Text>
      </View>
      {!disabled && <ChevronRight size={20} color={color.textTertiary} />}
    </Pressable>
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
  scroll: {padding: spacing.lg, gap: spacing.sm},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  cardIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {fontSize: 15},
  cardSubtitle: {fontSize: 12, marginTop: 2, lineHeight: 17},
});
