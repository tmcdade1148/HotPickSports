// AdminBroadcastScreen — composer for an app-wide broadcast.
// Per April 2026 Super Admin spec §5.5.
//
// Subject (60 chars) + body (280 chars) + target (all | competition).
// Preview shows what the push + Message Center entry will look like.
// Send button shows the recipient count + an explicit "this cannot be
// undone" confirmation before invoking admin-broadcast Edge Function.
//
// Rate limit is enforced server-side (1 per 24h) — we surface the
// "next available" timestamp the function returns.

import React, {useEffect, useState} from 'react';
import {Text, TextInput} from '@shared/components/AppText';
import {ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ChevronLeft} from 'lucide-react-native';
import {supabase} from '@shared/config/supabase';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';
import {RequireSuperAdmin} from '@shell/components/RequireSuperAdmin';

type TargetOption = {label: string; value: string};

export function AdminBroadcastScreen() {
  return (
    <RequireSuperAdmin>
      <AdminBroadcastScreenImpl />
    </RequireSuperAdmin>
  );
}

function AdminBroadcastScreenImpl() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<string>('all');
  const [sending, setSending] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [competitions, setCompetitions] = useState<TargetOption[]>([{label: 'All users', value: 'all'}]);

  useEffect(() => {
    (async () => {
      // Active competitions for the target dropdown
      const {data: cfg} = await supabase
        .from('competition_config')
        .select('competition')
        .neq('competition', 'global');
      const seen = new Set<string>();
      for (const r of (cfg ?? []) as {competition: string}[]) seen.add(r.competition);
      setCompetitions([
        {label: 'All users', value: 'all'},
        ...Array.from(seen).sort().map(c => ({label: c, value: c})),
      ]);

      // Last broadcast timestamp for the rate-limit indicator
      const {data: last} = await supabase
        .from('competition_config')
        .select('value, updated_at')
        .eq('competition', 'global')
        .eq('key', 'last_admin_broadcast_at')
        .maybeSingle();
      if (last?.value) {
        const iso = typeof last.value === 'string' ? last.value : (last.value as {iso?: string})?.iso ?? null;
        setLastSentAt(iso);
      }
    })();
  }, []);

  const ageHours = lastSentAt ? (Date.now() - new Date(lastSentAt).getTime()) / 3600000 : Infinity;
  // Subject is optional; only the message body is required.
  const canSend = ageHours >= 24 && body.trim().length > 0 && !sending;
  const waitHours = ageHours < 24 ? Math.ceil(24 - ageHours) : 0;

  const handleSend = () => {
    Alert.alert(
      'Send this broadcast?',
      `Subject: ${subject.trim() || '(none)'}\n\nThis can't be undone. Recipients (${target}) will get a push notification and a Message Center entry.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Send',
          style: 'destructive',
          onPress: async () => {
            setSending(true);
            const {data, error} = await supabase.functions.invoke('admin-broadcast', {
              body: {subject: subject.trim(), body: body.trim(), target},
            });
            setSending(false);
            if (error) {
              Alert.alert('Failed', error.message);
              return;
            }
            const result = data as {error?: string; recipients?: number; wait_hours?: number; next_available_at?: string};
            if (result?.error === 'RATE_LIMITED') {
              Alert.alert('Rate limited', `Next broadcast available in ~${result.wait_hours}h.`);
              return;
            }
            if (result?.error) {
              Alert.alert('Failed', result.error);
              return;
            }
            Alert.alert('Sent', `Reached ${result.recipients ?? 0} recipients.`);
            setSubject('');
            setBody('');
            setLastSentAt(new Date().toISOString());
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.shell, {backgroundColor: colors.background}]} edges={['top']}>
      <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <ChevronLeft color={colors.textPrimary} size={24} />
          </Pressable>
          <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
            BROADCAST
          </Text>
          <View style={{width: 24}} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {waitHours > 0 && (
            <View style={[styles.warningCard, {backgroundColor: colors.surface, borderColor: colors.warning ?? colors.primary}]}>
              <Text style={[bodyType.bold, {color: colors.warning ?? colors.primary}]}>
                Rate-limited
              </Text>
              <Text style={[bodyType.regular, {color: colors.textSecondary, marginTop: 4, fontSize: 12}]}>
                You sent a broadcast {Math.floor(ageHours)}h ago. Next broadcast available in ~{waitHours}h.
              </Text>
            </View>
          )}

          <Text style={[bodyType.regular, styles.label, {color: colors.textSecondary}]}>
            Subject (optional — push title, 60 chars max)
          </Text>
          <TextInput
            value={subject}
            onChangeText={t => t.length <= 60 && setSubject(t)}
            placeholder="HotPick is back online"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface}]}
            maxLength={60}
          />
          <Text style={[bodyType.regular, styles.count, {color: colors.textTertiary}]}>{subject.length} / 60</Text>

          <Text style={[bodyType.regular, styles.label, {color: colors.textSecondary}]}>
            Message (in-app — 280 chars max)
          </Text>
          <TextInput
            value={body}
            onChangeText={t => t.length <= 280 && setBody(t)}
            placeholder="Picks are open for Week 1 — get yours in by kickoff."
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, styles.body, {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface}]}
            multiline
            maxLength={280}
          />
          <Text style={[bodyType.regular, styles.count, {color: colors.textTertiary}]}>{body.length} / 280</Text>

          <Text style={[bodyType.regular, styles.label, {color: colors.textSecondary}]}>
            Target
          </Text>
          <View style={styles.targetRow}>
            {competitions.map(c => (
              <Pressable
                key={c.value}
                onPress={() => setTarget(c.value)}
                style={[
                  styles.targetChip,
                  {
                    backgroundColor: target === c.value ? colors.primary : 'transparent',
                    borderColor: target === c.value ? colors.primary : colors.border,
                  },
                ]}>
                <Text style={[
                  bodyType.bold,
                  {fontSize: 12, color: target === c.value ? colors.onPrimary : colors.textSecondary},
                ]}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Preview */}
          {(subject.trim() || body.trim()) && (
            <View style={[styles.previewCard, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
              <Text style={[bodyType.regular, {fontSize: 11, color: colors.textTertiary, letterSpacing: 1, marginBottom: 4}]}>
                PUSH NOTIFICATION PREVIEW
              </Text>
              <Text style={[bodyType.bold, {color: colors.textPrimary}]} numberOfLines={1}>
                {subject.trim() || '(no subject)'}
              </Text>
              <Text style={[bodyType.regular, {color: colors.textSecondary, marginTop: 4, fontSize: 13}]} numberOfLines={3}>
                {body.trim() || '(no body)'}
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={[
              styles.sendBtn,
              {backgroundColor: canSend ? colors.primary : colors.border},
            ]}>
            {sending ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[bodyType.bold, {color: colors.onPrimary}]}>
                {waitHours > 0 ? `Wait ~${waitHours}h to send` : 'Send Broadcast'}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
  scroll: {padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl},
  warningCard: {borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md},
  label: {fontSize: 12, marginTop: spacing.md},
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  body: {minHeight: 100, textAlignVertical: 'top'},
  count: {fontSize: 11, textAlign: 'right'},
  targetRow: {flexDirection: 'row', gap: 6, flexWrap: 'wrap'},
  targetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  sendBtn: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
});
