// src/shell/components/home/PreSeasonGamesHero.tsx
// Fires when current_phase === 'PRE_SEASON'. NFL exhibition window
// (Aug 6–Aug 29 for 2026) — games are being played and users can
// make practice picks, but scores DON'T count toward the regular
// season total. Countdown still points at season_picks_open_at
// (Sept 2 for 2026) since that's when scoring becomes real.
//
// Like OffSeasonHero, the Join / Create CTAs that used to live here
// moved into the HomeScreen YOUR CONTESTS section so the homepage
// layout stays consistent across all stages. This hero is greeting
// + welcome line + "preseason is on" eyebrow + countdown to picks
// opening + tell-a-friend share.

import React from 'react';
import {Pressable, Share, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {useCountdown} from './useCountdown';
import {getContextGreeting} from './salutation';

export function PreSeasonGamesHero() {
  const {colors} = useTheme();

  const picksOpenAt    = useNFLStore(s => s.picksOpenAt);
  const seasonOpenerAt = useNFLStore(s => s.seasonOpenerAt);
  const currentPhase   = useNFLStore(s => s.currentPhase);
  const visiblePools   = useGlobalStore(s => s.visiblePools);

  const target = picksOpenAt ?? seasonOpenerAt;
  const {days, hours, minutes, isExpired} = useCountdown(target);
  const greeting = getContextGreeting(currentPhase, 'idle', 0, null);

  const firstPool = visiblePools.find(p => p.invite_code);
  const firstInviteCode = firstPool?.invite_code ?? null;
  const firstPoolName   = firstPool?.name_display || firstPool?.name || null;

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
        PRESEASON IS HERE.
      </Text>
      {/* Make the "scores don't count" detail explicit so users don't
          think their preseason picks are pulling their season ranking
          down (or up). */}
      <Text style={[bodyType.regular, styles.welcomeSub, {color: colors.textSecondary}]}>
        Practice picks all month. Scores reset for the regular season.
      </Text>

      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textTertiary}]}>
        REAL PICKS OPEN IN
      </Text>
      <View style={styles.countdownRow}>
        <CountUnit n={days}    label="days" color={colors.textPrimary} subColor={colors.textTertiary} />
        <Text style={[displayType.display, styles.colon, {color: colors.primary}]}>:</Text>
        <CountUnit n={hours}   label="hrs"  color={colors.textPrimary} subColor={colors.textTertiary} />
        <Text style={[displayType.display, styles.colon, {color: colors.primary}]}>:</Text>
        <CountUnit n={minutes} label="min"  color={colors.textPrimary} subColor={colors.textTertiary} />
      </View>

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
  // See OffSeasonHero for the rationale — flex:1 cells +
  // adjustsFontSizeToFit keep the countdown row inside narrow screens.
  return (
    <View style={styles.countUnit}>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        minimumFontScale={0.5}
        style={[
          displayType.display,
          monoType.regular,
          styles.countNumber,
          {color},
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
    // See OffSeasonHero — section.marginTop carries the gap.
    paddingBottom: 0,
    gap: spacing.sm,
  },
  salutation:    {fontSize: 13},
  welcomeSub:    {fontSize: 14, lineHeight: 20, marginTop: 4, marginBottom: spacing.md},
  // Match HomeScreen sectionTitle (YOUR CONTESTS / YOUR CLUBS) so the
  // 'REAL PICKS OPEN IN' eyebrow reads as a section header in the
  // same visual language.
  eyebrow:       {fontSize: 11, letterSpacing: 1.8, marginTop: spacing.sm, marginBottom: spacing.sm},
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  countUnit:    {flex: 1, alignItems: 'center'},
  countNumber:  {fontSize: 56, lineHeight: 60},
  // See OffSeasonHero — negative margin pulls colons toward digits.
  colon:        {fontSize: 44, lineHeight: 60, marginBottom: 12, marginHorizontal: -24},
  countLabel:   {fontSize: 10, letterSpacing: 2, marginTop: 2},
  shareCta: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  shareText: {fontSize: 14, letterSpacing: 0.5},
});
