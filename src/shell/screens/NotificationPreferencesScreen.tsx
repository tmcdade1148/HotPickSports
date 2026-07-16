import React, {useEffect, useState, useCallback} from 'react';
import {Text} from '@shared/components/AppText';
import {
  View,
  Switch,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ChevronLeft} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

// The notification_preferences table is WIDE: one row per user, one boolean
// column per type (all default true). These keys ARE the column names.
type PrefMap = Record<string, boolean>;

const PREF_LABELS: Record<string, {label: string; description: string}> = {
  picks_deadline: {
    label: 'Pick Deadlines',
    description: 'Reminders before your picks lock',
  },
  score_posted: {
    label: 'Score Updates',
    description: 'When your weekly scores are posted',
  },
  leaderboard_change: {
    label: 'Ladder Movement',
    description: 'When your ranking changes',
  },
  smacktalk_mention: {
    label: 'Chirp Mentions',
    description: 'When someone @mentions you',
  },
  smacktalk_reply: {
    label: 'Chirp Replies',
    description: 'When someone replies to your message',
  },
  organizer_broadcast: {
    label: 'Contest Broadcasts',
    description: 'Messages from your Gaffer',
  },
  streak_milestone: {
    label: 'Streak & Milestones',
    description: 'When you hit a winning streak or milestone',
  },
  new_member_joined: {
    label: 'New Members',
    description: 'When someone joins your Contest',
  },
};

// Every column on the wide notification_preferences row. Used for the SELECT
// so a user's full preference row is fetched regardless of what we render.
const PREF_ORDER = [
  'picks_deadline',
  'score_posted',
  'leaderboard_change',
  'smacktalk_mention',
  'smacktalk_reply',
  'organizer_broadcast',
  'streak_milestone',
  'new_member_joined',
];

// Only the types that actually have a server-side generator today get a toggle.
// The rest (picks_deadline, score_posted, leaderboard_change, streak_milestone,
// new_member_joined, smacktalk_mention, smacktalk_reply) are enqueued by nothing
// yet, so showing a switch for them
// would be a dead control. Add a type back here the moment its generator ships.
const VISIBLE_PREF_ORDER = [
  'organizer_broadcast',
];

export function NotificationPreferencesScreen() {
  const navigation = useNavigation<any>();
  const {colors} = useTheme();
  const userId = useGlobalStore(s => s.user?.id);
  const [prefs, setPrefs] = useState<PrefMap>({});
  const [loading, setLoading] = useState(true);

  const fetchPrefs = useCallback(async () => {
    if (!userId) return;
    const {data} = await supabase
      .from('notification_preferences')
      .select(PREF_ORDER.join(', '))
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      setPrefs(data as unknown as PrefMap);
    } else {
      // No row yet (older accounts were never seeded) — create one with the
      // all-true defaults so the toggles have something to write against.
      await supabase
        .from('notification_preferences')
        .upsert({user_id: userId}, {onConflict: 'user_id', ignoreDuplicates: true});
      setPrefs({});
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const togglePref = async (type: string, newValue: boolean) => {
    const previous = prefs[type] ?? true;
    // Optimistic update
    setPrefs(prev => ({...prev, [type]: newValue}));

    // Persist via a SECURITY DEFINER RPC that derives auth.uid() server-side and
    // updates the caller's own row. Replaces the prior client upsert, which silently
    // no-op'd when userId was null/stale (the toggle-reset bug, register 1.3). The
    // RPC raises on an unauthenticated caller or an unknown type, so a failed write
    // surfaces as `error` here instead of a silent success.
    const {error} = await supabase.rpc('set_notification_preference', {
      p_type: type,
      p_value: newValue,
    });

    if (error) {
      // Revert so the UI never claims a change that didn't persist.
      setPrefs(prev => ({...prev, [type]: previous}));
    }
  };

  const getPref = (type: string): boolean => prefs[type] ?? true;

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.textPrimary}]}>Notifications</Text>
        <View style={{width: 24}} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <Text style={[styles.sectionNote, {color: colors.textSecondary}]}>
            Choose which notifications you'd like to receive. You can also manage notifications in your device Settings.
          </Text>

          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            {VISIBLE_PREF_ORDER.map((type, index) => {
              const info = PREF_LABELS[type];
              if (!info) return null;

              return (
                <React.Fragment key={type}>
                  {index > 0 && (
                    <View style={[styles.divider, {backgroundColor: colors.border}]} />
                  )}
                  <View style={styles.prefRow}>
                    <View style={styles.prefText}>
                      <Text style={[styles.prefLabel, {color: colors.textPrimary}]}>
                        {info.label}
                      </Text>
                      <Text style={[styles.prefDesc, {color: colors.textSecondary}]}>
                        {info.description}
                      </Text>
                    </View>
                    <Switch
                      value={getPref(type)}
                      onValueChange={v => togglePref(type, v)}
                      trackColor={{false: colors.border, true: colors.primary + '80'}}
                      thumbColor={getPref(type) ? colors.primary : '#f4f3f4'}
                    />
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </ScrollView>
      )}
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
    fontSize: 17,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionNote: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  card: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  prefText: {
    flex: 1,
    marginRight: spacing.md,
  },
  prefLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  prefDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md,
  },
});
