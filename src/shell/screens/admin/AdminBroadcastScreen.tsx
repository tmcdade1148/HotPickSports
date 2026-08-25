// AdminBroadcastScreen — composer for an app-wide broadcast.
// Per April 2026 Super Admin spec §5.5.
//
// Subject (60 chars) + body (280 chars) + target (all | competition).
// Preview shows what the push + Message Center entry will look like.
// The confirmation names the TARGET SEGMENT and warns the action cannot be
// undone; it does NOT show a recipient count, by decision. Super-admin targets
// are audience segments whose size is a server-side question, so the honest
// number is the one admin-broadcast returns AFTER sending. (An earlier version
// of this comment claimed the send button showed a count. It never did.)
//
// That AFTER-sending number is QUEUED, not delivered, and until 2026-08-25 this
// screen announced it as "Sent — Reached N recipients." That send reported 77;
// 20 were actually pushed and 57 were skipped (56 with no active device, 1
// opted out). The result alert now reports queued and push-ELIGIBLE separately
// and says outright that neither is a delivered count — delivery is resolved by
// process-notification-queue up to a minute later, from an Expo receipt.
//
// Rate limit is enforced SERVER-SIDE and the server is the SOLE gate. The
// admin-broadcast Edge Function reads the cadence from the competition_config
// global key `admin_broadcast_rate_limit_hours` (0 = no limit) and answers 429
// when it declines. The client never predicts the limit — it only surfaces the
// wait_hours / next_available_at the function returns.

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
import {isSandboxCompetition} from '@shared/utils/competition';
import {DEMO_COMPETITION} from '@sports/registry';

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
  // Set ONLY from a server 429 — never computed locally. Null until the server
  // actually declines a send.
  const [rateLimit, setRateLimit] = useState<
    {waitHours: number | null; nextAvailableAt: string | null} | null
  >(null);
  const [competitions, setCompetitions] = useState<TargetOption[]>([{label: 'All users', value: 'all'}]);

  useEffect(() => {
    (async () => {
      // Broadcastable competitions for the target dropdown.
      //
      // The old query selected every distinct competition string and filtered
      // only `global`, so the dropdown offered NINE targets when two are real
      // audiences. The comment above it claimed "active competitions" — the
      // intent was written down and never implemented.
      //
      // Reading `key = 'is_active'` does the first cut server-side: rows that
      // carry no is_active key at all never come back. That drops `global` (the
      // platform config bucket) and `rank_audit` (audit rows filed under a fake
      // competition string, not a competition), so the old .neq('global') is no
      // longer needed. The value test then drops nfl_2025 and world_cup_2026.
      //
      // is_active alone is NOT enough, and this is the trap: the three sims and
      // nfl_demo are all is_active = true. They are live config, but they are
      // not audiences — sandboxes for App Review and the practice week.
      const {data: cfg} = await supabase
        .from('competition_config')
        .select('competition, value')
        .eq('key', 'is_active');

      const seen = new Set<string>();
      for (const r of (cfg ?? []) as {competition: string; value: unknown}[]) {
        if (r.value !== true) continue;
        // Reuses the two definitions that already exist rather than inventing a
        // third: isSandboxCompetition centralizes the _sim / _simA / _simG rule
        // (an earlier endsWith('_sim') silently missed the suffixed ones), and
        // DEMO_COMPETITION is the registry's own name for the practice week.
        if (isSandboxCompetition(r.competition)) continue;
        if (r.competition === DEMO_COMPETITION) continue;
        seen.add(r.competition);
      }

      setCompetitions([
        {label: 'All users', value: 'all'},
        ...Array.from(seen).sort().map(c => ({label: c, value: c})),
      ]);
    })();
  }, []);

  // Validity ONLY. The client does not compute the rate limit — there is no
  // hours constant here by design. Send is enabled whenever the message is
  // well-formed; if the cadence hasn't elapsed the server answers 429 and we
  // surface its numbers. Subject is optional.
  const trimmed = body.trim();
  const canSend =
    trimmed.length > 0 &&
    trimmed.length <= 280 &&
    subject.trim().length <= 60 &&
    !sending;

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
              // A declined send returns HTTP 429, so supabase-js routes it into
              // `error` with data === null — which is why the old
              // `result.error === 'RATE_LIMITED'` check below could never fire.
              // The JSON body lives on the FunctionsHttpError's Response
              // (`error.context`); reading it here is the only way wait_hours /
              // next_available_at ever reach the UI.
              let payload: any = null;
              try {
                payload = await (error as any).context?.json?.();
              } catch {
                // Non-JSON body — fall through to the generic failure alert.
              }
              if (payload?.error === 'RATE_LIMITED') {
                setRateLimit({
                  waitHours: payload.wait_hours ?? null,
                  nextAvailableAt: payload.next_available_at ?? null,
                });
                return;
              }
              Alert.alert('Failed', error.message);
              return;
            }

            const result = data as {
              error?: string;
              queued?: number;
              push_eligible?: number;
              /** Deprecated alias for `queued`; only an older deployed function still sends it. */
              recipients?: number;
              wait_hours?: number;
              next_available_at?: string;
            };
            // Fallback only — reachable if the function ever answers 200 with a
            // RATE_LIMITED body instead of 429.
            if (result?.error === 'RATE_LIMITED') {
              setRateLimit({
                waitHours: result.wait_hours ?? null,
                nextAvailableAt: result.next_available_at ?? null,
              });
              return;
            }
            if (result?.error) {
              Alert.alert('Failed', result.error);
              return;
            }
            setRateLimit(null);
            // "Sent"/"Reached N" was the queued count wearing a delivered
            // count's clothes. The 2026-08-25 send reported 77; 20 were pushed
            // and 57 were skipped. Say what is actually known at this moment.
            const queued = result.queued ?? result.recipients ?? 0;
            const eligible = result.push_eligible;
            const plural = queued === 1 ? '' : 's';
            Alert.alert(
              'Broadcast queued',
              eligible == null
                ? `Queued for ${queued} recipient${plural}.`
                : `Queued for ${queued} recipient${plural}.\n\n` +
                  `${eligible} can receive a push right now. ` +
                  `${queued - eligible} have no active device, or have broadcasts switched off.\n\n` +
                  'Delivery is confirmed a minute or two after sending, so this is an eligibility count — not a delivered count.',
            );
            setSubject('');
            setBody('');
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
          {/* Dormant unless the SERVER declines a send. Never predicted — with
              admin_broadcast_rate_limit_hours at 0 this should never appear. */}
          {rateLimit !== null && (
            <View style={[styles.warningCard, {backgroundColor: colors.surface, borderColor: colors.warning ?? colors.primary}]}>
              <Text style={[bodyType.bold, {color: colors.warning ?? colors.primary}]}>
                Rate-limited
              </Text>
              <Text style={[bodyType.regular, {color: colors.textSecondary, marginTop: 4, fontSize: 12}]}>
                {rateLimit.waitHours != null
                  ? `The server declined this send. Next broadcast available in ~${rateLimit.waitHours}h.`
                  : 'The server declined this send — the broadcast cadence has not elapsed yet.'}
              </Text>
              {rateLimit.nextAvailableAt ? (
                <Text style={[bodyType.regular, {color: colors.textTertiary, marginTop: 2, fontSize: 11}]}>
                  Next available: {new Date(rateLimit.nextAvailableAt).toLocaleString()}
                </Text>
              ) : null}
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
                Send Broadcast
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
