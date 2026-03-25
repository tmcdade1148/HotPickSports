import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
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

interface PrefRow {
  notification_type: string;
  enabled: boolean;
}

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
    label: 'Leaderboard Movement',
    description: 'When your ranking changes',
  },
  smacktalk_mention: {
    label: 'SmackTalk Mentions',
    description: 'When someone @mentions you',
  },
  smacktalk_reply: {
    label: 'SmackTalk Replies',
    description: 'When someone replies to your message',
  },
  organizer_broadcast: {
    label: 'Pool Broadcasts',
    description: 'Messages from your pool organizer',
  },
  streak_milestone: {
    label: 'Streak & Milestones',
    description: 'When you hit a winning streak or milestone',
  },
  new_member_joined: {
    label: 'New Members',
    description: 'When someone joins your pool',
  },
};

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

export function NotificationPreferencesScreen() {
  const navigation = useNavigation<any>();
  const {colors} = useTheme();
  const userId = useGlobalStore(s => s.user?.id);
  const [prefs, setPrefs] = useState<PrefRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrefs = useCallback(async () => {
    if (!userId) return;
    const {data} = await supabase
      .from('notification_preferences')
      .select('notification_type, enabled')
      .eq('user_id', userId);

    if (data) {
      setPrefs(data);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const togglePref = async (type: string, newValue: boolean) => {
    // Optimistic update
    setPrefs(prev =>
      prev.map(p =>
        p.notification_type === type ? {...p, enabled: newValue} : p,
      ),
    );

    await supabase
      .from('notification_preferences')
      .update({enabled: newValue, updated_at: new Date().toISOString()})
      .eq('user_id', userId)
      .eq('notification_type', type);
  };

  const getPref = (type: string): boolean => {
    const row = prefs.find(p => p.notification_type === type);
    return row?.enabled ?? true;
  };

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
            {PREF_ORDER.map((type, index) => {
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
