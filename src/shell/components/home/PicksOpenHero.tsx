// src/shell/components/home/PicksOpenHero.tsx
// Spec §6.4.3 — picks_open row.
//
// Reference (May 13 2026 v2):
//   NEXT LOCK IN                          ← flame eyebrow, tracked caps
//   02 : 14 : 37                          ← split countdown, primary colons
//   DAYS   HRS   MIN                      ← unit labels under each number
//
//   Thursday Night lock, 8:15 PM ET.
//   Remaining games lock Sunday at 1 PM ET.
//
//   [ MAKE YOUR PICKS                0/13 ]   ← big flame CTA with count badge

import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';

const TOTAL_PICKS_PER_WEEK = 13; // typical NFL week; can read from weekGames later

export function PicksOpenHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const userPickCount = useNFLStore(s => s.userPickCount);
  const picksDeadline = useNFLStore(s => s.picksDeadline);
  const sundayAnchor  = useNFLStore(s => s.sundayLockAnchor);

  const {days, hours, minutes} = useCountdown(picksDeadline);
  const picksSet = userPickCount ?? 0;

  const thursdayPretty = picksDeadline
    ? picksDeadline.toLocaleString(undefined, {weekday: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'})
    : null;
  const sundayPretty = sundayAnchor
    ? sundayAnchor.toLocaleString(undefined, {weekday: 'long', hour: 'numeric', timeZoneName: 'short'})
    : null;

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.primary}]}>
        NEXT LOCK IN
      </Text>

      {/* Split countdown — DAYS : HRS : MIN */}
      <View style={styles.countdownRow}>
        <CountUnit n={days}    label="DAYS" color={colors.textPrimary} subColor={colors.textTertiary} />
        <Colon color={colors.primary} />
        <CountUnit n={hours}   label="HRS"  color={colors.textPrimary} subColor={colors.textTertiary} />
        <Colon color={colors.primary} />
        <CountUnit n={minutes} label="MIN"  color={colors.textPrimary} subColor={colors.textTertiary} />
      </View>

      {/* Sub-line — Thursday lock + Sunday remaining-games lock */}
      <Text style={[bodyType.regular, styles.subline, {color: colors.textSecondary}]}>
        {thursdayPretty ? (
          <>
            Thursday Night lock, <Text style={{color: colors.textPrimary}}>{shortTime(picksDeadline!)}</Text>.{' '}
          </>
        ) : null}
        {sundayPretty ? `Remaining games lock Sunday at ${shortTime(sundayAnchor!)}.` : null}
      </Text>

      {/* Primary CTA with pick-count badge on the right */}
      <Pressable
        onPress={() => navigation.navigate('Games')}
        style={({pressed}) => [
          styles.cta,
          {backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Make your picks — ${picksSet} of ${TOTAL_PICKS_PER_WEEK} set`}>
        <Text style={[displayType.display, styles.ctaText]}>MAKE YOUR PICKS</Text>
        <View style={styles.countBadge}>
          <Text style={[monoType.regular, styles.countBadgeText]}>
            {picksSet}/{TOTAL_PICKS_PER_WEEK}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function CountUnit({n, label, color, subColor}: {
  n: string;
  label: string;
  color: string;
  subColor: string;
}) {
  return (
    <View style={styles.unit}>
      <Text
        style={[
          displayType.display,
          monoType.regular,
          {fontSize: 64, color, lineHeight: 64 * 0.9, letterSpacing: -1},
        ]}>
        {n}
      </Text>
      <Text style={[bodyType.bold, styles.unitLabel, {color: subColor}]}>
        {label}
      </Text>
    </View>
  );
}

function Colon({color}: {color: string}) {
  return (
    <View style={styles.colon}>
      <View style={[styles.dot, {backgroundColor: color}]} />
      <View style={[styles.dot, {backgroundColor: color}]} />
    </View>
  );
}

function useCountdown(deadline: Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return {days: '--', hours: '--', minutes: '--'};
  const diff = Math.max(0, deadline.getTime() - now);
  const totalMinutes = Math.floor(diff / 60_000);
  const days    = Math.floor(totalMinutes / (60 * 24));
  const hours   = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return {
    days:    pad(days),
    hours:   pad(hours),
    minutes: pad(minutes),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function shortTime(d: Date): string {
  return d.toLocaleString(undefined, {hour: 'numeric', minute: '2-digit', timeZoneName: 'short'});
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  unit: {
    minWidth: 80,
    alignItems: 'flex-start',
  },
  unitLabel: {
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 6,
  },
  colon: {
    width: 12,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  subline: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md + 2,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
    // Subtle flame glow (iOS)
    shadowColor: '#F66321',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 0},
  },
  ctaText: {
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  countBadge: {
    backgroundColor: '#FFFFFF33',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Manrope-Bold',
  },
});
