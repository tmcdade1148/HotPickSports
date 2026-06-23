// src/shell/components/home/RecruiterBand.tsx
// Off-cycle recruiter section that surfaces the most important
// preseason / off-season action: getting more people into the user's
// Contest. Shows roster count + invite code + a prominent share CTA.
//
// Detects organizer (Gaffer) status by comparing pool.organizer_id to
// the current user — picks one of their owned pools first so a Gaffer
// who's also a member of another Contest shares their own roster, not
// the other Gaffer's.
//
// Share message includes a Tier 1 deep link
// (`hotpick://join?code=XXXX`) that the RootNavigator linking config
// already parses — opens the app directly to PoolWelcomeScreen with
// the code pre-filled. Recruits installing the app fresh still see
// the plain invite code in the message text and can paste it
// manually. (Tier 2 universal-link + web fallback is planned for the
// marketing-site work.)

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, Share, StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {bodyType, spacing, borderRadius} from '@shared/theme';

// Universal-link base — https so the invite linkifies in every messaging app
// and opens the app directly when installed (custom hotpick:// does neither).
const INVITE_BASE = 'https://hotpick.app/join';

export function RecruiterBand() {
  const {colors} = useTheme();

  const visiblePools   = useGlobalStore(s => s.visiblePools);
  const userRankByPool = useGlobalStore(s => s.userRankByPool);
  const userId         = useGlobalStore(s => s.user?.id);

  // Prefer a pool the current user organizes (the Gaffer's primary
  // share surface). Fall back to any pool they're in with an invite
  // code so members can still tell-a-friend.
  const ownedPool = visiblePools.find(p => p.invite_code && p.organizer_id === userId);
  const anyPool   = visiblePools.find(p => p.invite_code);
  const pool      = ownedPool ?? anyPool;

  if (!pool || !pool.invite_code) return null;

  const code        = pool.invite_code;
  const poolName    = pool.name_display || pool.name || 'your Contest';
  const memberCount = userRankByPool[pool.id]?.memberCount ?? 0;
  const isGaffer    = !!userId && pool.organizer_id === userId;

  const inviteUrl = `${INVITE_BASE}/${code}`;

  const handleShare = async () => {
    // Unified invite voice — matches PoolSettings → Share. Code on its own line
    // so it's easy to select in the recipient's messenger.
    const message =
      `Hey, I'd love for you to join my HotPick football pool "${poolName}"! ` +
      `Pick games 🏈, talk smack, and settle who's got bragging rights.\n\n` +
      `Tap to join 👉 ${inviteUrl}\n\n` +
      `Invite code:\n${code}`;
    try {
      await Share.share({message});
    } catch {
      // user cancelled / unavailable
    }
  };

  const rosterLine =
    memberCount > 0
      ? `${memberCount} ${memberCount === 1 ? 'player' : 'players'} in ${poolName} · code ${code}`
      : `${poolName} · code ${code}`;

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textTertiary}]}>
        {isGaffer ? 'BRING YOUR GROUP IN' : 'INVITE A FRIEND'}
      </Text>
      <Text style={[bodyType.regular, styles.roster, {color: colors.textSecondary}]}>
        {rosterLine}
      </Text>
      <Pressable
        onPress={handleShare}
        style={({pressed}) => [
          styles.primaryBtn,
          {backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          isGaffer
            ? `Share invite link to ${poolName}`
            : `Invite a friend to ${poolName}`
        }>
        <Text style={[bodyType.bold, styles.primaryBtnText, {color: colors.onPrimary}]}>
          {isGaffer ? 'Share Invite Link' : 'Share to a Friend'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  eyebrow: {fontSize: 11, letterSpacing: 1.8, marginBottom: 4},
  roster:  {fontSize: 14, lineHeight: 20, marginBottom: 4},
  primaryBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  primaryBtnText: {fontSize: 15, letterSpacing: 0.5},
});
