// src/shell/components/home/PreSeasonHero.tsx
// Spec §6.4.3 — pre_season_idle row.
//
// User HAS pools but the season hasn't started. Calm tone.
// Hero: countdown to season_picks_open_at.
// CTA: "Tell a friend" → native share with the user's first-pool invite code.

import React from 'react';
import {Pressable, Share, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {useCountdown} from './useCountdown';
import {getContextGreeting} from './salutation';

export function PreSeasonHero() {
  const {colors} = useTheme();

  const picksOpenAt    = useNFLStore(s => s.picksOpenAt);
  const seasonOpenerAt = useNFLStore(s => s.seasonOpenerAt);
  const currentPhase   = useNFLStore(s => s.currentPhase);
  const visiblePools   = useGlobalStore(s => s.visiblePools);

  const target = picksOpenAt ?? seasonOpenerAt;
  const {days, hours, minutes, isExpired} = useCountdown(target);
  const greeting = getContextGreeting(currentPhase, 'idle', 0, null);

  // First pool with an invite code (for share). Many users will only have one.
  const firstInviteCode = visiblePools.find(p => p.invite_code)?.invite_code;
  const firstPoolName   = visiblePools.find(p => p.invite_code)?.name;

  const handleShare = async () => {
    if (!firstInviteCode) return;
    const message = firstPoolName
      ? `Join my HotPick pool "${firstPoolName}" — invite code ${firstInviteCode}`
      : `Join me on HotPick — invite code ${firstInviteCode}`;
    try {
      await Share.share({message});
    } catch {
      // user cancelled / unavailable — no-op
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        {greeting}
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

      {!isExpired && firstInviteCode && (
        <Pressable
          onPress={handleShare}
          style={({pressed}) => [
            styles.cta,
            {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
          ]}
          accessibilityRole="button"
          accessibilityLabel="Tell a friend with your invite code">
          <Text style={[bodyType.bold, styles.ctaText, {color: colors.textPrimary}]}>
            Tell a friend
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
  salutation: {fontSize: 13},
  eyebrow:    {fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm},
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: spacing.lg,
  },
  colon:      {fontSize: 48, paddingHorizontal: 4, paddingBottom: 10},
  countLabel: {fontSize: 10, letterSpacing: 2, marginTop: 2},
  cta: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ctaText: {fontSize: 13, letterSpacing: 0.5},
});
