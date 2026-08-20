import React, {useEffect, useRef, useState, useCallback} from 'react';
import {Text} from '@shared/components/AppText';
import {
  View,
  Switch,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ChevronLeft, ChevronRight} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme, useBrand} from '@shell/theme';
import {
  getPushPermissionStatus,
  registerForPushNotifications,
  type PushPermissionStatus,
} from '@shell/services/pushNotifications';

// The notification_preferences table is WIDE: one row per user, one boolean
// column per type (all default true). These keys ARE the column names.
type PrefMap = Record<string, boolean>;

const PREF_LABELS: Record<string, {label: string; description: string}> = {
  picks_deadline: {
    label: 'Pick reminders',
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
    label: 'Contest announcements',
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

// Toggles shown in Settings → Notifications, in order. `picks_deadline` is a
// promise made on onboarding screen 2 ("pick reminders"), so the category needs
// its own switch. Add a type here as its server-side generator ships.
const VISIBLE_PREF_ORDER = [
  'picks_deadline',
  'organizer_broadcast',
];

export function NotificationPreferencesScreen() {
  const navigation = useNavigation<any>();
  const {colors} = useTheme();
  // Brand string, not a literal (Hard Rule #9) — the state line names the app.
  const {appName} = useBrand();
  const userId = useGlobalStore(s => s.user?.id);
  const [prefs, setPrefs] = useState<PrefMap>({});
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<PushPermissionStatus | null>(null);
  // Previous observed permission, for detecting the denied → granted transition.
  // A ref, not state: reading it inside a state updater would put a side effect
  // in a function React is allowed to call twice.
  const lastPermission = useRef<PushPermissionStatus | null>(null);

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

  // OS permission state. Separate from prefs on purpose: the toggles are a
  // HotPick-side preference and persist regardless, while this is the OS gate
  // that decides whether anything can be delivered at all. Rendering ON toggles
  // to a user whose permission is denied is the defect this repairs.
  const refreshPermission = useCallback(async () => {
    const next = await getPushPermissionStatus();
    const prev = lastPermission.current;
    lastPermission.current = next;
    setPermission(next);

    // Only a TRANSITION into 'granted' registers — typically the user coming
    // back from device Settings having just enabled it, who should get a token
    // in this session rather than waiting for the next cold start. Not on every
    // observation: an already-granted permission is registered at sign-in and
    // on session restore, so firing here too would add a network call every
    // time this screen opened. prev === null is first mount, not a transition.
    if (next === 'granted' && prev !== null && prev !== 'granted' && userId) {
      registerForPushNotifications(userId).catch(() => {});
    }
  }, [userId]);

  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  // Re-check on return to foreground so a user who enables notifications in
  // device Settings sees the state line disappear without restarting the app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

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

  // 'denied' and 'undetermined' both mean nothing can be delivered right now.
  // null — the Expo modules were unavailable — deliberately makes NO claim and
  // renders the screen unchanged, rather than telling a user notifications are
  // off when we simply could not ask.
  const needsPermission =
    permission === 'denied' || permission === 'undetermined';

  // Never hardcode "iOS" — this screen ships on both platforms.
  const settingsLabel =
    Platform.OS === 'ios' ? 'Open iOS Settings' : 'Open Android settings';

  // Linking.openSettings() REJECTS when the OS refuses; it does not silently
  // no-op, and an un-caught rejection in a tap handler is an unhandled promise
  // rejection. Log and leave the screen as it is — deliberately no alert: a
  // failed settings launch is not something the user can act on, and an error
  // dialog on a recovery screen reads as a second failure.
  //
  // openSettings, never a hand-built 'app-settings:' URL — those are
  // undocumented, break between iOS versions, and have been grounds for App
  // Store rejection.
  const openDeviceSettings = () => {
    Linking.openSettings().catch(err => {
      console.warn('[NotificationPreferences] openSettings failed:', err);
    });
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
          {/* When the OS permission is off, this screen used to render two ON
              toggles above a sentence that merely mentioned device settings —
              stating the opposite of the truth, with nothing tappable to fix
              it. The state line says what is actually happening; the sentence
              below becomes the way out. Granted (or unknown, where the modules
              are unavailable) renders exactly as before. */}
          {needsPermission && (
            <Text style={[styles.stateLine, {color: colors.textPrimary}]}>
              Notifications are turned off for {appName}. These settings take
              effect once you turn them on.
            </Text>
          )}

          {needsPermission ? (
            <TouchableOpacity
              style={[styles.settingsRow, {borderColor: colors.border}]}
              onPress={openDeviceSettings}
              accessibilityRole="button"
              accessibilityLabel={settingsLabel}>
              <Text style={[styles.settingsRowLabel, {color: colors.primary}]}>
                {settingsLabel}
              </Text>
              <ChevronRight size={18} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <Text style={[styles.sectionNote, {color: colors.textSecondary}]}>
              Choose which notifications you'd like to receive. You can also manage notifications in your device Settings.
            </Text>
          )}

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
  // Shown only when the OS permission is off. Colours come from useTheme at the
  // call site (Hard Rule #9) — deliberately textPrimary, not an error colour:
  // this is a state, not a failure.
  stateLine: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  settingsRowLabel: {
    fontSize: 15,
    fontWeight: '600',
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
