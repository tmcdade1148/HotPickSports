import React, {useState} from 'react';
import {Text, TextInput} from '@shared/components/AppText';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {supabase} from '@shared/config/supabase';
import {getEventByCompetition} from '@sports/registry';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';
import {FoundingWall} from '@shell/paywall';
import {ContestHandoff} from '@shell/components/ContestHandoff';
import {enterAppFromOnboarding} from '@shell/services/enterApp';
import {organizerMoneyAcknowledgment} from '@shared/lexicon';

/**
 * Organizer money-posture acknowledgment version. Bumped 1.0 → 2.0 for the
 * counsel-approved v2.0 wording (June 23 Money Posture spec §6). Logged to
 * organizer_acknowledgments on acceptance. Keep in lockstep with the
 * organizerMoneyAcknowledgment copy in @shared/lexicon.
 */
const ORGANIZER_ACK_VERSION = '2.0';

/**
 * Pause between the founding wall closing and the Handoff opening. Covers React
 * Native's modal fade (~300ms) so the two presentations never overlap on iOS.
 * See closeFoundingWall().
 */
const WALL_TO_HANDOFF_MS = 320;

/**
 * CreatePoolScreen — Form to create a new pool for the active event.
 * Generates an invite code automatically. Sets the new pool as active.
 * All Contests are private (invite-only). The public-Contest switch was
 * removed per the 2026-05-27 product call — HotPick is for groups who
 * already know each other; there's no public matchmaking.
 */
export function CreatePoolScreen({navigation, route}: any) {
  // Set only by PoolWelcomeScreen's "start your own Contest" link. Every other
  // entry point (Home footer, Settings, Chirps, Pool Selection) leaves it
  // undefined and keeps the goBack() exit, which is correct for them.
  const fromOnboarding = route?.params?.fromOnboarding === true;
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const user = useGlobalStore(s => s.user);
  const activeSport = useGlobalStore(s => s.activeSport);
  const createPool = useGlobalStore(s => s.createPool);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);

  const [poolName, setPoolName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Facade paywall (§6b): when a 2nd-or-later Contest is created during the
  // founding season, the server allows it and flags the wall. The Contest
  // already exists; the wall is informational, and dismissing it returns Home.
  const [showFoundingWall, setShowFoundingWall] = useState(false);
  // Post-create confirmation for a redirected create (REGISTRY-03 Part C).
  // A redirected create changes nothing on screen — the new Contest lives in
  // a competition the Player is not viewing — so without this they would
  // reasonably assume it failed and tap again.
  const [showSeasonConfirm, setShowSeasonConfirm] = useState(false);
  const [createdPoolId, setCreatedPoolId] = useState<string | null>(null);
  // The Handoff: the ask, in the one moment the organizer is guaranteed to be
  // paying attention. Two pieces of state, because priming and presenting are
  // different moments on the pool_cap path — the Contest exists as soon as
  // create_pool returns, but the founding wall has to have its say first.
  const [handoff, setHandoff] = useState<{pool: any; code: string} | null>(null);
  const [handoffVisible, setHandoffVisible] = useState(false);

  // A time-boxed event can redirect Contest creation to the season it leads
  // into, so a Contest started during the preseason is a regular-season
  // Contest. Falls back to the active competition.
  const targetCompetition =
    activeSport?.contestsCreateIn ?? activeSport?.competition;
  const isRedirected = Boolean(activeSport?.contestsCreateIn);

  // The one way this screen closes after a successful create. The 100ms delay
  // lets the store update + HomeScreen re-render settle: without it the
  // JoinPoolModule unmount collides with the navigation transition in Fabric's
  // ShadowView diffing and the app takes a SIGSEGV. It is load-bearing, not
  // decoration — do not shorten or remove it. Previously copied at three call
  // sites with the reason written at only one of them.
  const dismissToHome = () => {
    setTimeout(() => {
      // A create that began during onboarding exits FORWARD into the app.
      // goBack() would return the new Gaffer to PoolWelcome — the screen that
      // just told them to "start your own Contest" — which reads as the create
      // having failed. That is the duplicate-Contest loop this branch closes.
      // All four post-create paths (normal, pool_cap, redirected, and the
      // no-invite-code fallback) route through here, so this is the only place
      // the branch is needed.
      if (fromOnboarding) {
        enterAppFromOnboarding(navigation);
        return;
      }
      navigation.goBack();
    }, 100);
  };

  // Closing the founding wall hands over to the Handoff rather than leaving.
  //
  // The gap is not decoration. FoundingWall and ContestHandoff are both
  // transparent fade <Modal>s, which on iOS are two separate presentations, and
  // starting the second while the first is still dismissing is the same class of
  // conflict PoolSettingsScreen documents for the share sheet — the one where
  // the thing silently never appears. Let the wall finish before the ask starts.
  //
  // Nothing primed means no invite code came back, so there is nothing to hand
  // off to and this behaves as it always did: home. Note it now routes through
  // dismissToHome(), so this path finally gets the 100ms Fabric settle the other
  // exits have always had — it was calling navigation.goBack() bare.
  const closeFoundingWall = () => {
    setShowFoundingWall(false);
    if (!handoff) {
      dismissToHome();
      return;
    }
    setTimeout(() => setHandoffVisible(true), WALL_TO_HANDOFF_MS);
  };

  const doCreate = async () => {
    if (!user?.id || !activeSport?.competition || !targetCompetition) return;

    setCreating(true);
    setError(null);

    // Log organizer acknowledgment
    await supabase.from('organizer_acknowledgments').insert({
      user_id: user.id,
      version: ORGANIZER_ACK_VERSION,
    });

    const result = await createPool({
      userId: user.id,
      competition: targetCompetition,
      name: poolName.trim(),
      isPublic: false,
    });

    setCreating(false);

    if (result.pool) {
      // The Contest EXISTS on every branch below — create_pool has already
      // written it. So prime the ask on every branch that ends on this screen,
      // and let each branch decide WHEN to present it.
      const primed = result.pool.invite_code
        ? {pool: result.pool, code: result.pool.invite_code}
        : null;
      if (primed) setHandoff(primed);

      if (result.showWall === 'pool_cap') {
        // NOT an exceptional path. free_tier_max_pools is 1 and the founding
        // season is active, so EVERY second-or-later Contest lands here — a
        // large share of exactly the organizers the Handoff exists for. Two
        // Contests created 2026-08-26 12:31 took this branch and got no ask.
        //
        // Sequence, don't skip: the wall is the constraint, the Handoff is the
        // next step, and both belong. The wall goes first and closeFoundingWall
        // presents the Handoff after it, instead of returning to Home.
        setShowFoundingWall(true);
        return;
      }

      if (isRedirected) {
        // Left alone deliberately. "Take me to it" navigates INTO the new
        // Contest, so a Handoff layered on top of that is genuinely wrong: the
        // organizer is already looking at the thing. They share from Contest
        // Settings. RecruiterBand MAY also catch them, but it surfaces one
        // Contest at a time, so it is not a guarantee and is not the reason
        // this branch is skipped.
        setCreatedPoolId(result.pool.id);
        setShowSeasonConfirm(true);
        return;
      }

      // Normal path: straight to the ask.
      //
      // create_pool always generates an invite code, but if one somehow did not
      // come back there is nothing to share, and a Handoff with an empty code is
      // worse than the old silence — so that case falls through unchanged.
      if (primed) {
        setHandoffVisible(true);
        return;
      }
      dismissToHome();
    } else if (result.upgradeRequired) {
      setError(
        'You have reached the maximum number of Contests for your plan. Upgrade to create more Contests.',
      );
    } else {
      setError(result.error ?? 'Failed to create Contest. Please try again.');
    }
  };

  // "Take me to it" — a real switch into the season the Contest was created
  // in. Part B makes it persist, so the Player is still there tomorrow. This
  // is a direct setActiveSport, the same silent switch joinPool performs; it
  // deliberately does NOT fire the Settings switcher's restart alert.
  const goToNewContest = () => {
    const target = targetCompetition
      ? getEventByCompetition(targetCompetition)
      : undefined;
    if (target) {
      setActiveSport(target);
      // setActiveSport clears activePoolId and reloads the persisted pool for
      // the target competition asynchronously. createPool already wrote this
      // id under that competition's key, so set it directly rather than
      // racing the reload.
      if (createdPoolId) setActivePoolId(createdPoolId);
    }
    setShowSeasonConfirm(false);
    dismissToHome();
  };

  const stayInCurrentCompetition = () => {
    setShowSeasonConfirm(false);
    dismissToHome();
  };

  const handleCreate = () => {
    const trimmed = poolName.trim();
    if (trimmed.length < 3) {
      setError('Contest name must be at least 3 characters.');
      return;
    }
    if (trimmed.length > 30) {
      setError('Contest name must be 30 characters or less.');
      return;
    }
    if (!user?.id || !activeSport?.competition) return;

    Alert.alert(
      'Before You Create Your Contest',
      organizerMoneyAcknowledgment,
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'I Understand. Create My Contest', onPress: doCreate},
      ],
    );
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
          <Text style={styles.title}>Start Contest</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Contest Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Friends & Family"
            placeholderTextColor={colors.textSecondary}
            value={poolName}
            onChangeText={setPoolName}
            maxLength={30}
            autoFocus
          />

          <Text style={styles.privacyHint}>
            All Contests on HotPick are private. Only people you share the
            invite code with can join.
          </Text>

          {/* Shown only when the event redirects creation (contestsCreateIn),
              so the Player knows which season their Contest belongs to before
              they commit. REGISTRY-02 §6b specifies THAT this notice exists
              and when it shows — it does NOT specify the wording below.
              The wording is Tom's, given directly on 2026-08-04, and names
              the season outright: the earlier "runs the regular season" left
              WHICH regular season implicit, which is the one thing this
              notice exists to answer. Treat it as locked to Tom, not to the
              spec — do not reword. Report layout problems instead. */}
          {isRedirected && (
            <View style={styles.seasonNotice}>
              <Text style={styles.seasonNoticeText}>
                Your Contest will run through the 2026/27 NFL regular season.
                Picks open September 2nd, first games September 9th.
              </Text>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.createButton, creating && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={creating}>
            {creating ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.createButtonText}>Start Contest</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Mounted as soon as a Contest exists, but presents nothing until
          handoffVisible flips — which is immediate on the normal path and
          deferred until the founding wall has faded on the pool_cap path. */}
      {handoff && (
        <ContestHandoff
          visible={handoffVisible}
          pool={handoff.pool}
          code={handoff.code}
          onDismiss={() => {
            // TEMPORARY GUARD — removed by the Contest Invite Row build
            // (260828_HotPick_ContestInviteRow_Spec, Item 4), which presents
            // the Handoff from Home after navigation instead of from inside
            // this screen, so there is one transition rather than two.
            //
            // ContestHandoff is a Modal with animationType="fade" mounted
            // INSIDE CreatePoolScreen, and poolName is never cleared. So the
            // fade-out reveals the still-mounted create form holding the
            // Contest name: the TextInput regains focus, the keyboard rises,
            // and "Start Contest" sits armed for roughly 500ms before the
            // navigator transition runs. Measured at 20fps from the 2026-08-28
            // device recording — form exposed t=31.90s to t=32.40s.
            //
            // That is a duplicate-creation path the Handoff itself introduced.
            // Clearing the name first means the revealed form flashes EMPTY
            // instead of armed. It must be the FIRST statement — the three
            // calls below begin the dismissal.
            setPoolName('');
            setHandoffVisible(false);
            setHandoff(null);
            dismissToHome();
          }}
        />
      )}

      <FoundingWall
        visible={showFoundingWall}
        trigger="pool_cap"
        onClose={closeFoundingWall}
      />

      {/* REGISTRY-03 §5 Part C specifies THAT this confirmation exists and
          what it must do (offer the new Contest, or stay put) — it does NOT
          specify the wording below. The season name here echoes the notice on
          the create screen above, so a Gaffer isn't told which season they're
          in and then told something vaguer one screen later. That echo is a
          consistency fix from 2026-08-04; the exact phrasing is Tom's call and
          is the only part open to revision. Do not reword otherwise, and
          report layout problems instead of shortening it. */}
      <Modal
        visible={showSeasonConfirm}
        transparent
        animationType="fade"
        onRequestClose={stayInCurrentCompetition}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>YOUR CONTEST IS SET.</Text>
            <Text style={styles.modalBody}>
              It’s ready for the 2026/27 NFL regular season. Picks open
              September 2nd, first games September 9th. Round up your crew
              between now and then.
            </Text>

            <TouchableOpacity
              style={styles.modalPrimary}
              onPress={goToNewContest}>
              <Text style={styles.modalPrimaryText}>Take me to it</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSecondary}
              onPress={stayInCurrentCompetition}>
              <Text style={styles.modalSecondaryText}>
                Stay in the preseason
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  privacyHint: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 17,
  },
  seasonNotice: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  seasonNoticeText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  createButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    // Matches the FoundingWall scrim exactly (shell/paywall/FoundingWall.tsx).
    // A modal scrim is not a brand colour and the theme has no token for it;
    // diverging here would just make two modals look different.
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  modalHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  modalBody: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  modalPrimary: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalPrimaryText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalSecondary: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  modalSecondaryText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
});
