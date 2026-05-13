// src/shell/components/home/PicksOpenHero.tsx
// Spec §6.4.3 — picks_open row.
//
// Eyebrow: "PICKS OPEN."
// Hero: countdown to next pick lock (Thursday kickoff)
//       + HotPick game card showing current designated HotPick + frozen_rank
// CTA: "Continue picks" → Picks tab
// Salutation above eyebrow.

import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {HotPickCinematic} from './HotPickCinematic';
import {getTeamColors} from './teamColors';
import {getContextGreeting} from './salutation';

export function PicksOpenHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const userHotPick     = useNFLStore(s => s.userHotPick);
  const userHotPickGame = useNFLStore(s => s.userHotPickGame);
  const picksDeadline   = useNFLStore(s => s.picksDeadline);
  const userPickCount   = useNFLStore(s => s.userPickCount);
  const currentPhase    = useNFLStore(s => s.currentPhase);
  const weekState       = useNFLStore(s => s.weekState);

  const greeting = getContextGreeting(
    currentPhase,
    weekState,
    userPickCount,
    picksDeadline,
  );

  const {days, hours, minutes} = useCountdown(picksDeadline);

  const hasHotPick = !!(userHotPick && userHotPickGame);
  const away = userHotPickGame?.away_team ?? '';
  const home = userHotPickGame?.home_team ?? '';
  const awayMeta = getTeamColors(away);
  const homeMeta = getTeamColors(home);

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.salutation, {color: colors.textSecondary}]}>
        {greeting}
      </Text>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.primary}]}>
        PICKS OPEN
      </Text>

      {/* Countdown */}
      {picksDeadline && (
        <View style={styles.countdownRow}>
          <CountUnit n={days}    label="days"  color={colors.textPrimary} />
          <Text style={[displayType.display, styles.colon, {color: colors.primary}]}>:</Text>
          <CountUnit n={hours}   label="hrs"   color={colors.textPrimary} />
          <Text style={[displayType.display, styles.colon, {color: colors.primary}]}>:</Text>
          <CountUnit n={minutes} label="min"   color={colors.textPrimary} />
        </View>
      )}

      {hasHotPick && (
        <View style={styles.hotPickWrap}>
          <HotPickCinematic
            mode="scheduled"
            awayTeam={away}
            awayCity={awayMeta.city}
            awayColor={awayMeta.primary}
            homeTeam={home}
            homeCity={homeMeta.city}
            homeColor={homeMeta.primary}
            pickedTeam={userHotPick?.picked_team ?? undefined}
            frozenRank={userHotPickGame?.frozen_rank ?? 0}
            kickoffLabel={kickoffLabel(userHotPickGame!.kickoff_at)}
            compact
          />
        </View>
      )}

      <Pressable
        onPress={() => navigation.navigate('Games')}
        style={({pressed}) => [
          styles.cta,
          {backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel="Continue your picks">
        <Text style={[bodyType.bold, styles.ctaText]}>Continue picks</Text>
      </Pressable>
    </View>
  );
}

function CountUnit({n, label, color}: {n: string; label: string; color: string}) {
  return (
    <View style={{alignItems: 'flex-start'}}>
      <Text
        style={[
          displayType.display,
          monoType.regular,
          {fontSize: displayType.size.display1, color, lineHeight: displayType.size.display1 * 0.9},
        ]}>
        {n}
      </Text>
      <Text style={[bodyType.bold, styles.countLabel, {color: color + 'B3'}]}>{label}</Text>
    </View>
  );
}

/** Lightweight countdown — updates every 30s. Component-local so it doesn't bloat the store. */
function useCountdown(deadline: Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!deadline) return {days: '--', hours: '--', minutes: '--'};
  const diff = Math.max(0, deadline.getTime() - now);
  const totalMinutes = Math.floor(diff / 60_000);
  const days    = Math.floor(totalMinutes / (60 * 24));
  const hours   = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return {
    days:    String(days).padStart(2, '0'),
    hours:   String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
  };
}

function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {weekday: 'long', hour: 'numeric', minute: '2-digit'});
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  salutation: {fontSize: 13, marginBottom: 4},
  eyebrow:    {fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm},
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: spacing.lg,
  },
  colon:      {fontSize: 56, paddingHorizontal: 4, paddingBottom: 10},
  countLabel: {fontSize: 10, letterSpacing: 2, marginTop: 2},
  hotPickWrap: {marginBottom: spacing.lg},
  cta: {
    width: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
