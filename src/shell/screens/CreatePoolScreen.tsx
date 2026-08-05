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
import {organizerMoneyAcknowledgment} from '@shared/lexicon';

/**
 * Organizer money-posture acknowledgment version. Bumped 1.0 → 2.0 for the
 * counsel-approved v2.0 wording (June 23 Money Posture spec §6). Logged to
 * organizer_acknowledgments on acceptance. Keep in lockstep with the
 * organizerMoneyAcknowledgment copy in @shared/lexicon.
 */
const ORGANIZER_ACK_VERSION = '2.0';

/**
 * CreatePoolScreen — Form to create a new pool for the active event.
 * Generates an invite code automatically. Sets the new pool as active.
 * All Contests are private (invite-only). The public-Contest switch was
 * removed per the 2026-05-27 product call — HotPick is for groups who
 * already know each other; there's no public matchmaking.
 */
export function CreatePoolScreen({navigation}: any) {
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

  // A time-boxed event can redirect Contest creation to the season it leads
  // into, so a Contest started during the preseason is a regular-season
  // Contest. Falls back to the active competition.
  const targetCompetition =
    activeSport?.contestsCreateIn ?? activeSport?.competition;
  const isRedirected = Boolean(activeSport?.contestsCreateIn);

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
      if (result.showWall === 'pool_cap') {
        // Contest is created; prime with the founding wall, then return on close.
        setShowFoundingWall(true);
        return;
      }
      if (isRedirected) {
        setCreatedPoolId(result.pool.id);
        setShowSeasonConfirm(true);
        return;
      }
      // Delay navigation to let the store update + HomeScreen re-render settle.
      // Without this, the JoinPoolModule unmount collides with the navigation
      // transition in Fabric's ShadowView diffing, causing a SIGSEGV.
      setTimeout(() => navigation.goBack(), 100);
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
    setTimeout(() => navigation.goBack(), 100);
  };

  const stayInCurrentCompetition = () => {
    setShowSeasonConfirm(false);
    setTimeout(() => navigation.goBack(), 100);
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

      <FoundingWall
        visible={showFoundingWall}
        trigger="pool_cap"
        onClose={() => navigation.goBack()}
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
