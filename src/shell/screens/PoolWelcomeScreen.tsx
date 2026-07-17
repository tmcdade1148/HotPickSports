import React, {useEffect, useState} from 'react';
import {Text, TextInput} from '@shared/components/AppText';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useGlobalStore} from '@shell/stores/globalStore';
import {
  resolvePendingInviteCodeOnLaunch,
  consumePendingInviteCode,
} from '@shell/services/pendingInvite';
import {getDefaultEvent} from '@sports/registry';
import {getDisplayName} from '@shared/utils/displayName';
import {supabase} from '@shared/config/supabase';
import type {DbProfile} from '@shared/types/database';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

export function PoolWelcomeScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const user = useGlobalStore(s => s.user);
  const userProfile = useGlobalStore(s => s.userProfile);
  const managedClub = useGlobalStore(s => s.managedClub);
  const pendingInviteCode = useGlobalStore(s => s.pendingInviteCode);
  const joinPool = useGlobalStore(s => s.joinPool);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);
  const refreshAvailableEvents = useGlobalStore(
    s => s.refreshAvailableEvents,
  );
  const fetchUserPools = useGlobalStore(s => s.fetchUserPools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const subscribeSmackUnread = useGlobalStore(s => s.subscribeSmackUnread);
  const fetchSmackUnreadCounts = useGlobalStore(
    s => s.fetchSmackUnreadCounts,
  );

  const [inviteCode, setInviteCode] = useState('');
  const [joinedPool, setJoinedPool] = useState<{
    name: string;
    organizerId: string | null;
  } | null>(null);
  // Gaffer Approval Gate: Contest when the join landed pending (applicant
  // awaits the Gaffer). Distinct from joinedPool — they are NOT a member yet.
  const [pendingContest, setPendingContest] = useState<{
    name: string;
    organizerId: string | null;
  } | null>(null);
  // Resolved Gaffer display name for the joined / pending copy. Stays null when
  // it can't be resolved — the caller OMITS the Gaffer line rather than
  // substituting invented copy.
  const [gafferName, setGafferName] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const displayName = getDisplayName(userProfile);
  const hasDeepLinkInvite = !!pendingInviteCode;
  // Chairman or Director of a League (partner board). Their welcome lives on
  // ProfileSetup, so they skip this player-oriented page entirely (see the
  // auto-forward effect below).
  const isLeagueManager = !!managedClub;

  // Resolve the Gaffer's name for the joined / pending welcome. profiles is
  // world-readable (profiles_select USING true), so this works even for a
  // pending applicant who is not a member yet. Gated on poolie_name: a Gaffer
  // without one would render as the generic "Player", so treat that as
  // unresolved and drop the line instead.
  useEffect(() => {
    const organizerId =
      joinedPool?.organizerId ?? pendingContest?.organizerId ?? null;
    if (!organizerId) return;
    let active = true;
    (async () => {
      const {data} = await supabase
        .from('profiles')
        .select('poolie_name, first_name, last_name')
        .eq('id', organizerId)
        .maybeSingle();
      if (!active) return;
      if (data?.poolie_name) setGafferName(getDisplayName(data as DbProfile));
    })();
    return () => {
      active = false;
    };
  }, [joinedPool?.organizerId, pendingContest?.organizerId]);

  // Auto-join if there's a pending invite code. Re-resolve first as a safety net
  // in case LoadingScreen's async resolution hadn't landed before this mounted
  // (e.g. a persisted code restored from disk, or the first-launch clipboard probe).
  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      await resolvePendingInviteCodeOnLaunch();
      const code = useGlobalStore.getState().pendingInviteCode;
      if (code) handleJoinWithCode(code);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // League board members (Chairman/Director) are welcomed on ProfileSetup, so
  // they skip this player-oriented page. Once we know they manage a League and
  // there's no invite code to consume, initialize and head straight to Home.
  useEffect(() => {
    if (isLeagueManager && !hasDeepLinkInvite && !joinedPool && !joining) {
      initializeAndNavigate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeagueManager, hasDeepLinkInvite]);

  const handleJoinWithCode = async (code: string) => {
    if (!code.trim() || !user?.id) return;

    setJoining(true);
    setJoinError('');

    const result = await joinPool(user.id, code.trim());
    consumePendingInviteCode();

    if (result.pending) {
      setPendingContest({
        name: result.poolName ?? 'the Contest',
        organizerId: result.organizerId ?? null,
      });
    } else if (result.pool) {
      // organizer_id comes straight from the RPC payload now: join_pool_by_invite
      // returns public._pool_client_json(v_pool), which includes it (repointed
      // 2026-07-17). Same field the pending branch reads — one source, both
      // branches. (The prior userPools lookup could only ever work for the joined
      // branch anyway: a pending applicant's pool is kept out of userPools by RLS.)
      setJoinedPool({
        name: result.pool.name,
        organizerId: result.pool.organizer_id ?? null,
      });
    } else if (result.poolFull) {
      setJoinError('That Contest is full. The Gaffer can make room — worth an ask.');
    } else if (result.errorCode === 'already_member') {
      setJoinError("You're already in that one.");
    } else {
      // Bad code / NOT_FOUND / any other cause — one actionable line.
      setJoinError("That code didn't work. Double-check it with whoever sent it.");
    }
    setJoining(false);
  };

  const handleSubmitCode = () => {
    handleJoinWithCode(inviteCode);
  };

  const initializeAndNavigate = async () => {
    if (!user?.id) return;

    const visibleCompetitions = useGlobalStore.getState().visibleCompetitions;
    const defaultEvent = getDefaultEvent(visibleCompetitions);
    refreshAvailableEvents();
    setActiveSport(defaultEvent);

    await fetchUserPools(user.id, defaultEvent.competition);
    const pools = useGlobalStore.getState().userPools;

    if (pools.length > 0) {
      const globalPool = pools.find(p => p.is_global);
      setActivePoolId(globalPool?.id ?? pools[0].id);
      const poolIds = pools.map(p => p.id);
      await fetchSmackUnreadCounts(user.id, poolIds);
    }
    subscribeSmackUnread();

    // reset, not replace — clears the onboarding/Welcome screens beneath Home so
    // a back-gesture/swipe can't pop back to the login screen (looked like sign-out).
    navigation.reset({index: 0, routes: [{name: 'Home'}]});
  };

  // Deep-link joining, successful join, or a League manager being forwarded
  // to Home — show a loading/confirmation state instead of the player page.
  if (hasDeepLinkInvite || joinedPool || pendingContest || joining || isLeagueManager) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {joining ? (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.joiningText}>Joining your Contest...</Text>
            </>
          ) : isLeagueManager && !joinedPool && !joinError ? (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.joiningText}>Setting up your League…</Text>
            </>
          ) : joinError ? (
            <>
              <Text style={styles.title}>That code didn't work.</Text>
              <Text style={styles.errorText}>
                Double-check it with whoever sent it, or skip and add one later.
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => setJoinError('')}>
                <Text style={styles.primaryButtonText}>Try again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={initializeAndNavigate}>
                <Text style={styles.secondaryButtonText}>I'll do this later</Text>
              </TouchableOpacity>
            </>
          ) : joinedPool ? (
            <>
              <Text style={styles.checkmark}>{'\u{2705}'}</Text>
              <Text style={styles.title}>You're in.</Text>
              <Text style={styles.poolName}>{joinedPool.name}</Text>
              {gafferName ? (
                <Text style={styles.gafferLine}>
                  {gafferName} runs this one. That makes them the Gaffer.
                  Complaints go to them.
                </Text>
              ) : null}
              <Text style={styles.subtitle}>
                Your Picks play here and in every other Contest you're in. One
                set of calls.
              </Text>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={initializeAndNavigate}>
                <Text style={styles.primaryButtonText}>Let's pick</Text>
              </TouchableOpacity>
            </>
          ) : pendingContest ? (
            <>
              <Text style={styles.checkmark}>{'\u{23F3}'}</Text>
              <Text style={styles.title}>Request sent.</Text>
              <Text style={styles.poolName}>{pendingContest.name}</Text>
              {gafferName ? (
                <Text style={styles.gafferLine}>
                  {gafferName} has to wave you in. You'll know when they do.
                </Text>
              ) : null}
              <Text style={styles.subtitle}>
                Make your Picks in the meantime — your record follows you in.
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={initializeAndNavigate}>
                <Text style={styles.primaryButtonText}>Let's pick</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  // Organic path — ask for invite code
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text style={styles.welcomeEmoji}>{'\u{1F44B}'}</Text>
          <Text style={styles.title}>Hey {displayName}</Text>
          <Text style={styles.subtitle}>
            Your Picks. On the record. Bragging rights TBD.
          </Text>

          <View style={styles.mechanic}>
            <Text style={styles.mechanicTitle}>How HotPick works</Text>
            <Text style={styles.mechanicText}>
              Pick winners every week. Designate one as your HotPick. That's
              where you plant your flag. Picks lock at first kickoff and
              everyone sees everyone else's call. Make picks once and they play
              in every Contest you're in. The longer you play, the more it
              means.
            </Text>
          </View>

          <View style={styles.inviteSection}>
            <Text style={styles.inviteLabel}>Have a Contest invite code?</Text>
            <Text style={styles.inviteBody}>
              A Contest is your group. Family, coworkers, the middle school
              group text. Invite codes come from a Contest's Gaffer, whoever
              runs it. Join as many as you want. The record comes with you.
            </Text>
            <View style={styles.codeRow}>
              <TextInput
                style={styles.codeInput}
                placeholder="Enter code"
                placeholderTextColor={colors.textSecondary}
                value={inviteCode}
                onChangeText={text => {
                  setInviteCode(text.toUpperCase());
                  if (joinError) setJoinError('');
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                returnKeyType="go"
                onSubmitEditing={handleSubmitCode}
              />
              <TouchableOpacity
                style={[
                  styles.joinButton,
                  (!inviteCode.trim() || joining) && styles.joinButtonDisabled,
                ]}
                onPress={handleSubmitCode}
                disabled={!inviteCode.trim() || joining}>
                {joining ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={styles.joinButtonText}>Join</Text>
                )}
              </TouchableOpacity>
            </View>
            {joinError ? (
              <Text style={styles.codeError}>{joinError}</Text>
            ) : null}
          </View>

          <Text style={styles.gafferPitch}>
            Don't have an invite code? Then you should be the Gaffer and{' '}
            <Text
              style={styles.gafferPitchLink}
              onPress={() => navigation.navigate('CreatePool')}>
              start your own Contest.
            </Text>
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={initializeAndNavigate}>
            <Text style={styles.primaryButtonText}>I'll do this later</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  // Organic branch scrolls (it has the invite TextInput). flexGrow keeps the
  // block vertically centered when it fits, and lets it scroll the field above
  // the keyboard when the OS shrinks the viewport (iOS via KAV padding, Android
  // via the manifest's adjustResize). Mirrors EmailEntryScreen's KAV+ScrollView.
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  welcomeEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  checkmark: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  poolName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  gafferLine: {
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  mechanic: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    marginBottom: spacing.xl,
  },
  mechanicTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  mechanicText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  inviteSection: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  inviteLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  inviteBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  gafferPitch: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  gafferPitchLink: {
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  codeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    letterSpacing: 2,
    fontWeight: '600',
  },
  joinButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.4,
  },
  joinButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  codeError: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
    width: '100%',
    marginTop: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  joiningText: {
    marginTop: spacing.md,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
});
