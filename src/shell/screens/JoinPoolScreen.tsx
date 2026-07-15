import React, {useState} from 'react';
import {Text, TextInput} from '@shared/components/AppText';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';
import {normalizeRosterPass} from '@shared/utils/format';
import {applicationPendingMessage} from '@shared/lexicon';

/**
 * JoinPoolScreen — Enter a pool invite code (6–12 alphanumeric chars).
 * Auto-uppercases input, strips whitespace and hyphens (forgiving entry —
 * "JOES-2026" works just like "JOES2026"). Sets the joined pool as active
 * on success. Server-side `join_pool_by_invite` is authoritative.
 */
const INVITE_CODE_RE = /^[0-9A-Z]+$/;
const INVITE_CODE_MIN = 6;
const INVITE_CODE_MAX = 12;

export function JoinPoolScreen({navigation, route}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const user = useGlobalStore(s => s.user);
  const joinPool = useGlobalStore(s => s.joinPool);

  // Prefill from a deep-link invite (`route.params.code`) so a tapped invite
  // link lands here with the code already filled in. Normalized the same way
  // typed input is, so a pasted "JOES-2026" arrives as "JOES2026".
  const [inviteCode, setInviteCode] = useState(() =>
    normalizeRosterPass(route?.params?.code ?? ''),
  );
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Gaffer Approval Gate: set to the Contest name once a join lands pending.
  // Swaps the form for a waiting-room confirmation (the applicant is NOT a
  // member yet — no navigation into the pool).
  const [pendingContest, setPendingContest] = useState<string | null>(null);

  // Reuse the same strip-non-alphanumeric + uppercase normalizer that
  // PartnerDirectory's Roster Pass field uses — same character set,
  // same forgiveness for pasted dashes / whitespace / punctuation.
  const normalizeCode = normalizeRosterPass;

  // Detect when the user has pasted a Roster Pass into the invite-code
  // field. Roster Passes are 8 chars formatted XXXX-XXXX. Require the
  // dash *and* the 8-char normalized length — a bare 8-char string is
  // a valid Contest invite code (codes are 6–12 chars), so rescuing on
  // length alone misidentifies legitimate codes.
  const looksLikeRosterPass =
    inviteCode.includes('-') && normalizeCode(inviteCode).length === 8;

  const handleJoin = async () => {
    const code = normalizeCode(inviteCode);
    if (code.length < INVITE_CODE_MIN || code.length > INVITE_CODE_MAX) {
      setError(`Invite code must be ${INVITE_CODE_MIN}–${INVITE_CODE_MAX} characters.`);
      return;
    }
    if (!INVITE_CODE_RE.test(code)) {
      setError('Invite code can only contain letters and numbers.');
      return;
    }
    if (!user?.id) {
      return;
    }

    setJoining(true);
    setError(null);

    const result = await joinPool(user.id, code);

    setJoining(false);

    if (result.pending) {
      // Waiting-room: request is in, Gaffer must approve. Show confirmation
      // in place instead of returning to the caller as if joined.
      setPendingContest(result.poolName ?? 'the Contest');
    } else if (result.pool) {
      navigation.goBack();
    } else if (result.poolFull) {
      setError('This Contest is full and cannot accept new members.');
    } else {
      setError(result.error ?? 'Invalid invite code. Please check and try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Join Contest</Text>
        </View>

        {pendingContest ? (
          <View style={styles.form}>
            <View style={styles.waitingBox}>
              <Text style={styles.waitingTitle}>Request sent</Text>
              <Text style={styles.waitingText}>
                {applicationPendingMessage(pendingContest)} We'll post updates in
                your Message Center.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.joinButton}
              onPress={() => navigation.goBack()}>
              <Text style={styles.joinButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Invite Code</Text>
          <TextInput
            style={styles.input}
            placeholder="ABC123"
            placeholderTextColor={colors.textSecondary}
            value={inviteCode}
            onChangeText={text => setInviteCode(normalizeCode(text))}
            maxLength={INVITE_CODE_MAX}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
          />

          <Text style={styles.hint}>
            Ask a friend for their Contest invite code ({INVITE_CODE_MIN}–{INVITE_CODE_MAX} letters and numbers).
          </Text>

          {looksLikeRosterPass && !error && (
            <View style={styles.rescueBox}>
              <Text style={styles.rescueText}>
                That looks like a <Text style={styles.rescueBold}>Roster Pass</Text>,
                not an invite code. Roster Passes connect a Contest you organize
                to a League's roster. If you organize a Contest, open it in{' '}
                <Text style={styles.rescueBold}>Settings → Add/Edit Leagues</Text>{' '}
                and paste the pass there.
              </Text>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.joinButton, joining && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={joining}>
            {joining ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.joinButtonText}>Join Contest</Text>
            )}
          </TouchableOpacity>
        </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  backButton: {
    fontSize: 16,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  form: {
    padding: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: spacing.md,
  },
  hint: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  rescueBox: {
    backgroundColor: colors.surface,
    borderColor: colors.warning ?? colors.border,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  rescueText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  rescueBold: {
    fontWeight: '700',
  },
  error: {
    color: colors.error,
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  waitingBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  waitingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  waitingText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  joinButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  joinButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
