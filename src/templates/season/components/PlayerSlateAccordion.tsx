// src/templates/season/components/PlayerSlateAccordion.tsx
// Slice 2 — inline full-slate accordion for the week-side ladder.
// Presentational only: it renders whatever the get_player_week_picks RPC
// returned (passed in via `slate`) against the week's game list (`games`).
// The RPC is the sole gate — this component never re-computes privacy or lock
// state. `isNonPrivate` is used ONLY to choose empty-state copy.

import React from 'react';
import {View, ActivityIndicator, StyleSheet} from 'react-native';
import {Text} from '@shared/components/AppText';
import {useTheme} from '@shell/theme';
import {spacing, borderRadius} from '@shared/theme';
import type {DbSeasonGame} from '@shared/types/database';

export interface PlayerSlatePick {
  game_id: string;
  picked_team: string;
  is_hotpick: boolean;
}

export interface PlayerSlateState {
  status: 'loading' | 'ready' | 'error';
  picks: PlayerSlatePick[];
}

interface Props {
  /** The week's full game list (from allWeekGames[week]). */
  games: DbSeasonGame[];
  /** The RPC result for this member+week, or undefined before the tap fires. */
  slate: PlayerSlateState | undefined;
  /** True when the pool is NOT private. Chooses empty-state copy only. */
  isNonPrivate: boolean;
}

export function PlayerSlateAccordion({games, slate, isNonPrivate}: Props) {
  const {colors} = useTheme();
  const styles = createStyles(colors);

  if (!slate || slate.status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (slate.status === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Couldn't load this slate.</Text>
      </View>
    );
  }

  // ready — build a game_id → pick lookup.
  const pickByGame: Record<string, PlayerSlatePick> = {};
  for (const p of slate.picks) pickByGame[p.game_id] = p;

  // Empty result from the RPC. In a non-private pool the full slate is withheld
  // by design (message); otherwise the member simply has no picks and every
  // game renders "No Pick" below.
  if (slate.picks.length === 0 && isNonPrivate) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>
          Full slates are shown only in private contests.
        </Text>
      </View>
    );
  }

  if (games.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Slate unavailable.</Text>
      </View>
    );
  }

  // Match SeasonPicksScreen's byRank order (and the raw allWeekGames order):
  // frozen_rank ?? rank ?? 999 ascending — reads 1→16, null-safe.
  const ordered = [...games].sort(
    (a, b) =>
      (a.frozen_rank ?? a.rank ?? 999) - (b.frozen_rank ?? b.rank ?? 999),
  );

  return (
    <View style={styles.container}>
      {ordered.map(g => {
        const pick = pickByGame[g.game_id];
        const away = g.away_team ?? '';
        const home = g.home_team ?? '';
        const picked = pick?.picked_team;
        return (
          <View key={g.game_id} style={styles.gameRow}>
            <View style={styles.matchup}>
              {picked === away ? (
                <View style={styles.pickedBox}>
                  <Text style={styles.pickedText}>{away}</Text>
                </View>
              ) : (
                <Text style={styles.teamText}>{away}</Text>
              )}
              <Text style={styles.atText}>@</Text>
              {picked === home ? (
                <View style={styles.pickedBox}>
                  <Text style={styles.pickedText}>{home}</Text>
                </View>
              ) : (
                <Text style={styles.teamText}>{home}</Text>
              )}
            </View>
            {pick?.is_hotpick ? (
              <Text style={styles.hotFlag}>{'🔥'} HotPick</Text>
            ) : !pick ? (
              <Text style={styles.noPick}>No Pick</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginTop: -spacing.sm,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderBottomLeftRadius: borderRadius.md,
      borderBottomRightRadius: borderRadius.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: 6,
    },
    gameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 3,
    },
    matchup: {flexDirection: 'row', alignItems: 'center', gap: 4},
    teamText: {fontSize: 12, color: colors.textSecondary},
    atText: {fontSize: 10, color: colors.textSecondary},
    pickedBox: {
      borderWidth: 1.5,
      borderColor: colors.accentTeal,
      borderRadius: 3,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    pickedText: {fontSize: 12, fontWeight: '700', color: colors.accentTeal},
    hotFlag: {fontSize: 11, fontWeight: '700', color: colors.primary},
    noPick: {fontSize: 11, fontStyle: 'italic', color: colors.textSecondary},
    muted: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing.sm,
    },
  });
