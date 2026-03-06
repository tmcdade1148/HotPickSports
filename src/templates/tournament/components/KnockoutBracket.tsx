import React from 'react';
import {View, Text, ScrollView, StyleSheet} from 'react-native';
import type {TournamentConfig, KnockoutRoundConfig} from '@shared/types/templates';
import type {DbTournamentMatch} from '@shared/types/database';
import {colors, spacing, borderRadius} from '@shared/theme';
import {useTournamentStore} from '../stores/tournamentStore';

interface KnockoutBracketProps {
  config: TournamentConfig;
}

interface MatchSlot {
  match?: DbTournamentMatch;
  roundConfig: KnockoutRoundConfig;
}

/**
 * KnockoutBracket — Visual bracket display showing knockout rounds
 * as connected columns. Matches flow left to right from R32 → Final.
 * Shows real match data when available, TBD placeholders otherwise.
 * Highlights user's picks. Never references a specific sport.
 */
export function KnockoutBracket({config}: KnockoutBracketProps) {
  const matches = useTournamentStore(s => s.matches);
  const matchPicks = useTournamentStore(s => s.matchPicks);

  const knockoutMatches = matches.filter(m => m.group_letter === null);

  // Group matches by stage key
  const matchesByRound: Record<string, DbTournamentMatch[]> = {};
  for (const m of knockoutMatches) {
    if (!matchesByRound[m.stage]) {
      matchesByRound[m.stage] = [];
    }
    matchesByRound[m.stage].push(m);
  }

  // Build slots for each round
  const roundSlots: MatchSlot[][] = config.knockoutRounds.map(roundConfig => {
    const roundMatches = matchesByRound[roundConfig.key] ?? [];
    if (roundMatches.length > 0) {
      return roundMatches.map(match => ({match, roundConfig}));
    }
    // No matches yet — show TBD placeholders
    return Array.from({length: roundConfig.matchCount}, () => ({roundConfig}));
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Knockout Bracket</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bracketScroll}>
        {roundSlots.map((slots, roundIndex) => {
          const roundConfig = config.knockoutRounds[roundIndex];
          const isFinal = roundConfig.isMegaPick === true;

          return (
            <View key={roundConfig.key} style={styles.roundColumn}>
              <Text
                style={[
                  styles.roundLabel,
                  isFinal && {color: config.color},
                ]}>
                {roundConfig.label}
              </Text>
              <View style={styles.matchesColumn}>
                {slots.map((slot, slotIndex) => {
                  const pick = slot.match
                    ? matchPicks.find(p => p.match_id === slot.match!.match_id)
                    : undefined;

                  return (
                    <MatchSlotView
                      key={slot.match?.match_id ?? `${roundConfig.key}_${slotIndex}`}
                      slot={slot}
                      pick={pick?.picked_team}
                      isHotPick={pick?.is_hotpick}
                      accentColor={config.color}
                      isFinal={isFinal}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// MatchSlotView — One match cell in the bracket
// ---------------------------------------------------------------------------

interface MatchSlotViewProps {
  slot: MatchSlot;
  pick?: string;
  isHotPick?: boolean;
  accentColor: string;
  isFinal: boolean;
}

function MatchSlotView({
  slot,
  pick,
  isHotPick,
  accentColor,
  isFinal,
}: MatchSlotViewProps) {
  const {match} = slot;
  const homeCode = match?.home_team ?? 'TBD';
  const awayCode = match?.away_team ?? 'TBD';
  const isCompleted = match?.status === 'completed';

  return (
    <View
      style={[
        styles.matchSlot,
        isFinal && styles.matchSlotFinal,
        isFinal && {borderColor: accentColor},
      ]}>
      {isFinal && (
        <Text style={[styles.megaPickBadge, {color: accentColor}]}>
          MEGA PICK
        </Text>
      )}
      <TeamRow
        code={homeCode}
        score={match?.home_score}
        isPicked={pick === homeCode}
        isWinner={isCompleted && match?.home_score != null && match?.away_score != null && match.home_score > match.away_score}
        accentColor={accentColor}
      />
      <View style={styles.divider} />
      <TeamRow
        code={awayCode}
        score={match?.away_score}
        isPicked={pick === awayCode}
        isWinner={isCompleted && match?.home_score != null && match?.away_score != null && match.away_score > match.home_score}
        accentColor={accentColor}
      />
      {isHotPick && <Text style={styles.hotPickIndicator}>HotPick</Text>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// TeamRow — Single team line inside a match slot
// ---------------------------------------------------------------------------

interface TeamRowProps {
  code: string;
  score: number | null | undefined;
  isPicked: boolean;
  isWinner: boolean;
  accentColor: string;
}

function TeamRow({code, score, isPicked, isWinner, accentColor}: TeamRowProps) {
  const isTBD = code === 'TBD';

  return (
    <View
      style={[
        styles.teamRow,
        isPicked && {backgroundColor: `${accentColor}12`},
      ]}>
      {isPicked && (
        <View style={[styles.pickIndicator, {backgroundColor: accentColor}]} />
      )}
      <Text
        style={[
          styles.teamCode,
          isTBD && styles.teamCodeTBD,
          isWinner && styles.teamCodeWinner,
          isPicked && {color: accentColor},
        ]}>
        {code}
      </Text>
      {score != null && (
        <Text
          style={[
            styles.teamScore,
            isWinner && styles.teamScoreWinner,
          ]}>
          {score}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SLOT_WIDTH = 120;

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  bracketScroll: {
    paddingBottom: spacing.md,
  },
  roundColumn: {
    marginRight: spacing.md,
    alignItems: 'center',
  },
  roundLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  matchesColumn: {
    justifyContent: 'space-around',
    flex: 1,
  },
  matchSlot: {
    width: SLOT_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  matchSlotFinal: {
    borderWidth: 2,
  },
  megaPickBadge: {
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 2,
    letterSpacing: 1,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  pickIndicator: {
    width: 3,
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  teamCode: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  teamCodeTBD: {
    color: colors.textSecondary,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  teamCodeWinner: {
    fontWeight: '800',
  },
  teamScore: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  teamScoreWinner: {
    fontWeight: '700',
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  hotPickIndicator: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.warning,
    textAlign: 'center',
    paddingBottom: 3,
  },
});
