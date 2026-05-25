// src/shell/components/home/HotPickCinematic.tsx
// Cinematic full-bleed HotPick matchup card.
//
// Composition:
//   - Diagonal team-color split background with dark scrim
//   - Top-left HOTPICK · N PTS badge
//   - Top-right status pill ("Locked" / "LIVE" / "Thursday 8:15 PM")
//   - Big team monograms with city + name
//   - Bottom-left "Your pick · TEAM" / live score readout

import React from 'react';
import {StyleSheet, Text, View, type ViewStyle} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';

export interface HotPickCinematicProps {
  /** Visual mode — drives status pill + score readout */
  mode: 'locked' | 'live' | 'scheduled';
  awayTeam: string;        // 'MIN'
  awayCity?: string;       // 'MINNESOTA'
  awayColor?: string;      // team brand color (NOT a theme token — sports data)
  homeTeam: string;        // 'LAC'
  homeCity?: string;       // 'LOS ANGELES'
  homeColor?: string;
  /** User's picked team abbr — gets the flame glow */
  pickedTeam?: string;
  /** Display rank (1–16) — drives the "± N PTS" badge */
  frozenRank: number;
  /** Kickoff time string when mode='scheduled' or 'locked' */
  kickoffLabel?: string;   // 'Thursday 8:15 PM'
  /** Live score (mode='live' only) */
  liveScore?: {away: number; home: number; periodLabel: string};
  /** Compact mode for picks_open card (small variant) */
  compact?: boolean;
}

const TEAM_FALLBACK_COLOR = '#1A1A1A'; // last-resort if a team has no color

export function HotPickCinematic({
  mode,
  awayTeam,
  awayCity,
  awayColor,
  homeTeam,
  homeCity,
  homeColor,
  pickedTeam,
  frozenRank,
  kickoffLabel,
  liveScore,
  compact = false,
}: HotPickCinematicProps) {
  const {colors} = useTheme();
  const away = awayColor || TEAM_FALLBACK_COLOR;
  const home = homeColor || TEAM_FALLBACK_COLOR;

  const wrapStyle: ViewStyle = {
    height: compact ? 160 : 240,
    borderRadius: borderRadius.lg + 4,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: away,
  };

  // We render the home-color half via an absolutely-positioned overlay
  // using a clip-path-like 45deg edge. RN doesn't support clip-path
  // directly so we approximate with a rotated rectangle.

  const statusPill = (() => {
    if (mode === 'live') {
      return (
        <View style={[styles.pill, {backgroundColor: colors.primary + '2A', borderColor: colors.primary}]}>
          <View style={[styles.pulseDot, {backgroundColor: colors.primary}]} />
          <Text style={[styles.pillText, {color: colors.primary}]}>LIVE</Text>
        </View>
      );
    }
    if (mode === 'locked') {
      return (
        <View style={[styles.pill, {backgroundColor: colors.success + '26', borderColor: colors.success}]}>
          <Text style={[styles.pillText, {color: colors.success}]}>🔒 LOCKED</Text>
        </View>
      );
    }
    return (
      <View style={[styles.pill, {backgroundColor: colors.surfaceElevated + 'CC', borderColor: colors.border}]}>
        <Text style={[styles.pillText, {color: '#FFFFFF'}]}>{kickoffLabel ?? 'SCHEDULED'}</Text>
      </View>
    );
  })();

  const isPickedAway = pickedTeam === awayTeam;
  const isPickedHome = pickedTeam === homeTeam;

  return (
    <View style={wrapStyle}>
      {/* Right half — home color overlay */}
      <View style={[StyleSheet.absoluteFillObject, styles.rightHalf, {backgroundColor: home}]} />
      {/* Scrim */}
      <View style={[StyleSheet.absoluteFillObject, styles.scrim]} />

      {/* Top row — badge + status */}
      <View style={styles.topRow}>
        <View style={[styles.pill, {backgroundColor: '#00000073', borderColor: '#FFFFFF1F'}]}>
          <Text style={[styles.flame, {color: colors.primary}]}>🔥</Text>
          <Text style={[styles.pillText, {color: '#FFFFFF'}]}>
            HOTPICK · {frozenRank} PTS
          </Text>
        </View>
        {statusPill}
      </View>

      {/* Matchup row */}
      <View style={[styles.matchupRow, compact && {paddingBottom: spacing.md}]}>
        <View style={styles.team}>
          <Text style={styles.cityText}>{awayCity ?? ''}</Text>
          <Text
            style={[
              displayType.display,
              styles.teamName,
              isPickedAway && {textShadowColor: colors.primary, textShadowRadius: 16},
            ]}
            numberOfLines={1}>
            {awayTeam}
          </Text>
        </View>
        <Text style={[displayType.display, styles.atText]}>@</Text>
        <View style={[styles.team, styles.teamRight]}>
          <Text style={styles.cityText}>{homeCity ?? ''}</Text>
          <Text
            style={[
              displayType.display,
              styles.teamName,
              isPickedHome && {textShadowColor: colors.primary, textShadowRadius: 16},
            ]}
            numberOfLines={1}>
            {homeTeam}
          </Text>
        </View>
      </View>

      {/* Bottom strip — live score OR your-pick readout */}
      {!compact && (
        <View style={styles.bottomStrip}>
          {mode === 'live' && liveScore ? (
            <Text style={[bodyType.regular, monoType.regular, styles.bottomText]}>
              <Text style={[displayType.display, styles.bottomScore]}>
                {liveScore.away} · {liveScore.home}
              </Text>
              {'  '}
              {liveScore.periodLabel}
            </Text>
          ) : (
            <Text style={[bodyType.regular, styles.bottomText]}>
              Your pick · <Text style={styles.pickedTeamText}>{pickedTeam ?? '—'}</Text>
              <Text style={styles.dividerDot}>  ·  </Text>
              ±{frozenRank} pts
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rightHalf: {
    // Diagonal split via overflow + rotation. Origin at center.
    left: '50%',
    transform: [{translateX: 0}, {rotate: '12deg'}, {translateX: 0}],
  },
  scrim: {
    backgroundColor: '#00000080',
  },
  topRow: {
    position: 'absolute',
    top: spacing.md - 2,
    left: spacing.md - 2,
    right: spacing.md - 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flame: {fontSize: 12},
  pillText: {fontSize: 11, fontFamily: 'Manrope-Bold', letterSpacing: 1},
  pulseDot: {width: 6, height: 6, borderRadius: 999},
  matchupRow: {
    position: 'absolute',
    bottom: spacing.lg + 8,
    left: spacing.md + 4,
    right: spacing.md + 4,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  team: {
    flex: 1,
    alignItems: 'flex-start',
  },
  teamRight: {
    alignItems: 'flex-end',
  },
  cityText: {
    color: '#FFFFFF8C',
    fontSize: 10,
    fontFamily: 'Manrope-Bold',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  teamName: {
    color: '#FFFFFF',
    fontSize: 34,
  },
  atText: {
    color: '#FFFFFF80',
    fontSize: 20,
    paddingHorizontal: spacing.sm,
    paddingBottom: 6,
  },
  bottomStrip: {
    position: 'absolute',
    bottom: spacing.md - 2,
    left: spacing.md + 4,
    right: spacing.md + 4,
  },
  bottomText: {
    color: '#FFFFFFB3',
    fontSize: 12,
  },
  bottomScore: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  pickedTeamText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope-Bold',
  },
  dividerDot: {color: '#FFFFFF80'},
});
