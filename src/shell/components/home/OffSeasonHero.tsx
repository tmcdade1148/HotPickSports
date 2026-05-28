// src/shell/components/home/OffSeasonHero.tsx
// Renamed from PreSeasonHero. Fires when current_phase === 'OFF_SEASON'
// — the long quiet window between SEASON_COMPLETE and the first
// preseason game. Today (May–Aug) that's most of the calendar for an
// NFL user.
//
// The Join / Create / share CTAs that used to live here moved into the
// HomeScreen YOUR CONTESTS section so the homepage layout stays
// consistent across all states (off-season, pre-season, in-cycle).
// This hero is now just the greeting + welcome line + countdown to
// season_picks_open_at, plus the tell-a-friend share for organizers
// of existing pools.

import React from 'react';
import {Pressable, Share, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {useCountdown} from './useCountdown';
import {getContextGreeting} from './salutation';

export function OffSeasonHero() {
  const {colors} = useTheme();

  const picksOpenAt    = useNFLStore(s => s.picksOpenAt);
  const seasonOpenerAt = useNFLStore(s => s.seasonOpenerAt);
  const currentPhase   = useNFLStore(s => s.currentPhase);
  const visiblePools   = useGlobalStore(s => s.visiblePools);
  const userProfile    = useGlobalStore(s => s.userProfile);

  const target = picksOpenAt ?? seasonOpenerAt;
  const {days, hours, minutes, isExpired} = useCountdown(target);
  const greeting = getContextGreeting(currentPhase, 'idle', 0, null);

  // First pool with an invite code (for share). Many users will only have one.
  const firstPool = visiblePools.find(p => p.invite_code);
  const firstInviteCode = firstPool?.invite_code ?? null;
  const firstPoolName   = firstPool?.name_display || firstPool?.name || null;

  // Returning user gets a slightly different welcome line if they've played
  // before (have any visible pool). New users see a more inviting opener.
  const returning = visiblePools.length > 0;
  const careerPts = userProfile?.total_career_points ?? 0;

  const handleShare = async () => {
    if (!firstInviteCode) return;
    const message = firstPoolName
      ? `Join my HotPick Contest "${firstPoolName}" — invite code ${firstInviteCode}`
      : `Join me on HotPick — invite code ${firstInviteCode}`;
    try {
      await Share.share({message});
    } catch {
      // user cancelled / unavailable
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        {greeting}
      </Text>

      <Text
        style={[
          displayType.display,
          {fontSize: displayType.size.h2, color: colors.textPrimary},
        ]}>
        {returning ? 'WELCOME BACK.' : 'WELCOME TO HOTPICK.'}
      </Text>
      <Text style={[bodyType.regular, styles.welcomeSub, {color: colors.textSecondary}]}>
        {returning
          ? careerPts > 0
            ? `${careerPts.toLocaleString()} career pts. Let's run it back.`
            : "Get your Contest together before kickoff."
          : "Contests are how the game's played. Join one or start your own."}
      </Text>

      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textSecondary}]}>
        PICKS OPEN IN
      </Text>
      <View style={styles.countdownRow}>
        <CountUnit n={days}    label="days" color={colors.textPrimary} subColor={colors.textTertiary} />
        <Text style={[displayType.display, styles.colon, {color: colors.primary}]}>:</Text>
        <CountUnit n={hours}   label="hrs"  color={colors.textPrimary} subColor={colors.textTertiary} />
        <Text style={[displayType.display, styles.colon, {color: colors.primary}]}>:</Text>
        <CountUnit n={minutes} label="min"  color={colors.textPrimary} subColor={colors.textTertiary} />
      </View>

      {/* Tell-a-friend — only when the user has a pool to share. */}
      {!isExpired && firstInviteCode && (
        <Pressable
          onPress={handleShare}
          style={({pressed}) => [
            styles.shareCta,
            {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Invite a friend to ${firstPoolName ?? 'your Contest'}`}>
          <Text style={[bodyType.bold, styles.shareText, {color: colors.textPrimary}]}>
            Invite friends
            {firstPoolName ? (
              <Text style={[bodyType.regular, {color: colors.textSecondary}]}>
                {'  ·  '}{firstPoolName}
              </Text>
            ) : null}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function CountUnit({
  n,
  label,
  color,
  subColor,
}: {
  n: string;
  label: string;
  color: string;
  subColor: string;
}) {
  return (
    <View style={{alignItems: 'flex-start'}}>
      <Text
        style={[
          displayType.display,
          monoType.regular,
          {fontSize: displayType.size.display2, color, lineHeight: displayType.size.display2 * 0.9},
        ]}>
        {n}
      </Text>
      <Text style={[bodyType.bold, styles.countLabel, {color: subColor}]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  salutation:    {fontSize: 13},
  welcomeSub:    {fontSize: 14, lineHeight: 20, marginTop: 4, marginBottom: spacing.md},
  eyebrow:       {fontSize: 11, letterSpacing: 2, marginTop: spacing.sm, marginBottom: spacing.sm},
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: spacing.lg,
  },
  colon:        {fontSize: 48, paddingHorizontal: 4, paddingBottom: 10},
  countLabel:   {fontSize: 10, letterSpacing: 2, marginTop: 2},

  shareCta: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  shareText: {fontSize: 14, letterSpacing: 0.5},
});
