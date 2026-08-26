// src/shell/components/ContestHandoff.tsx
//
// THE HANDOFF — shown the moment a Contest is created.
//
// Why it exists: until this, the app contained no surface anywhere that asked
// an organizer to invite anybody. The success path of CreatePoolScreen was
// `setTimeout(() => navigation.goBack(), 100)` — byte-identical to what Cancel
// does — so the reward for creating a Contest was the screen closing. The
// invite code lived only inside Contest Settings, which the organizer had to go
// looking for without ever being told it was there. Six outside organizers
// created a dozen Contests on the sandbox competition and not one of them
// invited a single person.
//
// So the primary action here is SHARE, never OK. A congratulations dialog with
// a Done button produces a more confident organizer who still invites nobody:
// the missing thing was the ask, not the applause.
//
// Presentational only. It receives the pool and the code as props, owns no
// store state, and refetches nothing — createPool has already updated the
// store by the time this renders.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Alert, Modal, Pressable, Share, StyleSheet, View} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {useTheme} from '@shell/theme';
import {buildInviteMessage, type InvitePool} from '@shared/utils/invite';
import {bodyType, spacing, borderRadius} from '@shared/theme';

interface ContestHandoffProps {
  visible: boolean;
  /** The pool createPool just returned. DbPool satisfies InvitePool. */
  pool: InvitePool;
  code: string;
  /** Performs the caller's existing dismissal (the delayed goBack). */
  onDismiss: () => void;
}

export function ContestHandoff({visible, pool, code, onDismiss}: ContestHandoffProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);

  const poolName = pool.name_display?.trim() || pool.name?.trim() || 'Your Contest';

  // Share text comes from buildInviteMessage, never a local string. That file is
  // the single invite voice and carries the code-first decision and the reason
  // for it (warm deep links are broken on iOS). A second string drifts from the
  // first the day it is written, and this one has to stay byte-identical to what
  // Contest Settings sends for the same Contest.
  //
  // The sheet is presented BEFORE dismissing. PoolSettingsScreen.submitShare
  // documents this from experience: on iOS, presenting the native share sheet
  // while a modal is animating out is a presentation conflict — the sheet has no
  // stable view controller to present from and silently never appears. Share
  // first, dismiss in `finally`.
  const handleShare = async () => {
    try {
      await Share.share({message: buildInviteMessage(pool, code)});
    } catch {
      // user cancelled, or the sheet failed to present
    } finally {
      onDismiss();
    }
  };

  // Same feedback PoolSettingsScreen gives for the same action. The modal stays
  // put underneath, so there is no animating-out conflict here.
  const handleCopy = () => {
    Clipboard.setString(code);
    Alert.alert('Copied', `${code} copied to clipboard.`);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={[bodyType.bold, styles.title, {color: colors.textPrimary}]}>
            {poolName} is live.
          </Text>

          <Text style={[bodyType.regular, styles.reason, {color: colors.textSecondary}]}>
            Now bring your people in. They'll need this code.
          </Text>

          <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textTertiary}]}>
            INVITE CODE
          </Text>

          {/* Selectable because some people screenshot it and some read it
              aloud to whoever is sitting next to them. The accessibility label
              spells the characters out: without it a screen reader pronounces
              HOTPICK26A as a word, which is useless to anyone typing it in. */}
          <Text
            selectable
            style={[styles.code, {color: colors.textPrimary, borderColor: colors.border}]}
            accessibilityLabel={`Invite code: ${code.split('').join(' ')}`}>
            {code}
          </Text>

          <Pressable
            onPress={handleShare}
            style={({pressed}) => [
              styles.primaryBtn,
              {backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1},
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Share the invite to ${poolName}`}>
            <Text style={[bodyType.bold, styles.primaryBtnText, {color: colors.onPrimary}]}>
              Share invite
            </Text>
          </Pressable>

          <Pressable
            onPress={handleCopy}
            style={({pressed}) => [
              styles.secondaryBtn,
              {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
            ]}
            accessibilityRole="button"
            accessibilityLabel="Copy the invite code">
            <Text style={[bodyType.bold, styles.secondaryBtnText, {color: colors.textPrimary}]}>
              Copy code
            </Text>
          </Pressable>

          {/* Quiet, never absent. Nobody shares well under duress, and trapping
              someone in an ask is a dark pattern. Plain text so it does not
              compete with Share. */}
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Dismiss, invite people later">
            <Text style={[bodyType.regular, styles.dismiss, {color: colors.textTertiary}]}>
              I'll do this later
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {fontSize: 20, lineHeight: 26},
  reason: {fontSize: 15, lineHeight: 21, marginBottom: spacing.sm},
  eyebrow: {fontSize: 11, letterSpacing: 1.8},
  code: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  primaryBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  primaryBtnText: {fontSize: 15, letterSpacing: 0.5},
  secondaryBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryBtnText: {fontSize: 15},
  dismiss: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
