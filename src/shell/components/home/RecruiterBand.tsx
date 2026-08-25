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
// The share text itself comes from buildInviteMessage (@shared/utils/invite) —
// the single invite voice, shared with Contest Settings → Share. It leads with
// the invite code because a code always works; warm deep links on iOS do not
// (see that file for the why).

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, Share, StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {buildInviteMessage} from '@shared/utils/invite';
import {bodyType, spacing, borderRadius} from '@shared/theme';

export function RecruiterBand() {
  const {colors} = useTheme();

  const visiblePools   = useGlobalStore(s => s.visiblePools);
  const userRankByPool = useGlobalStore(s => s.userRankByPool);
  const userId         = useGlobalStore(s => s.user?.id);

  // Exactly the population this exists for: a Contest the user ORGANIZES that
  // is still only them. Once somebody joins, the ask is done and a standing
  // prompt turns into noise, so the band disappears on its own.
  //
  // visiblePools has already dropped archived, hidden and demo Contests — that
  // is what makes it "visible" — so this adds only the two conditions it does
  // not cover. Restating the whole real-Contest definition here would be a
  // second copy of it, and a definition kept in several places is what produced
  // the 77-recipient broadcast on 2026-08-25.
  //
  // memberCount defaults to 0 while userRankByPool is still loading, so the
  // band stays hidden until the count is real rather than flashing an ask at
  // someone whose Contest is already full.
  const pool = visiblePools.find(
    p =>
      p.invite_code &&
      p.organizer_id === userId &&
      (userRankByPool[p.id]?.memberCount ?? 0) === 1,
  );

  if (!pool?.invite_code) return null;

  const code     = pool.invite_code;
  const poolName = pool.name_display || pool.name || 'your Contest';

  const handleShare = async () => {
    const message = buildInviteMessage(pool, code);
    try {
      await Share.share({message});
    } catch {
      // user cancelled / unavailable
    }
  };

  // The non-Gaffer and multi-member variants that used to live here are gone
  // with the branch that could reach them: the band now renders only for a
  // Gaffer whose Contest has exactly one member, so every "if they are not the
  // organizer" and "if the count is more than one" arm was unreachable.
  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textTertiary}]}>
        BRING YOUR GROUP IN
      </Text>
      <Text style={[bodyType.regular, styles.roster, {color: colors.textSecondary}]}>
        {`Just you in ${poolName} so far · code ${code}`}
      </Text>
      <Pressable
        onPress={handleShare}
        style={({pressed}) => [
          styles.primaryBtn,
          {backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Share invite link to ${poolName}`}>
        <Text style={[bodyType.bold, styles.primaryBtnText, {color: colors.onPrimary}]}>
          Share Invite Link
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
