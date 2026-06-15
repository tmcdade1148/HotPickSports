// Tally-dot week summary: one glyph per game in kickoff order, color
// + weight encode lock state / pick-set / HotPick.

import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {isLockedStatus} from '@sports/nfl/utils/gameStatus';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, monoType} from '@shared/theme';

interface DotState {
  gameId: string;
  isLocked: boolean;
  hasPick: boolean;
  isHotPick: boolean;
}

export function WeekLockStrip() {
  const {colors} = useTheme();
  const games        = useSeasonStore(s => s.games);
  const weekPicks    = useSeasonStore(s => s.weekPicks);
  const liveScores   = useNFLStore(s => s.liveScores);
  const userHotPick  = useNFLStore(s => s.userHotPick);

  const dots: DotState[] = useMemo(() => {
    if (games.length === 0) return [];
    const pickByGame = new Map(weekPicks.map(p => [p.game_id, p]));
    return [...games]
      .sort((a, b) => {
        const ta = new Date(a.kickoff_at).getTime();
        const tb = new Date(b.kickoff_at).getTime();
        return ta - tb;
      })
      .map(g => {
        const status = liveScores[g.game_id]?.status ?? g.status ?? '';
        const isLocked = isLockedStatus(status);
        const pick = pickByGame.get(g.game_id);
        return {
          gameId: g.game_id,
          isLocked,
          hasPick: !!pick,
          isHotPick: pick?.is_hotpick === true,
        };
      });
  }, [games, weekPicks, liveScores]);

  if (dots.length === 0) return null;

  const editableCount = dots.filter(d => !d.isLocked).length;
  const allLocked = editableCount === 0;
  const label = allLocked ? 'LOCKED PICKS' : 'EDITABLE PICKS';

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`${editableCount} of ${dots.length} games still editable`}>
      <Text
        style={[
          bodyType.bold,
          monoType.regular,
          styles.label,
          {color: allLocked ? colors.textTertiary : colors.live},
        ]}>
        {label}
      </Text>
      <View style={styles.tallyRow}>
        {dots.map(d => {
          // Glyph encodes three signals at once:
          //   "•"     = editable
          //   "–"     = locked
          //   color   = green / gray / flame for HotPick
          //   bold    = the user has a pick on this game
          const glyph = d.isLocked ? '–' : '•';
          const color = d.isHotPick
            ? colors.primary
            : d.isLocked
            ? colors.textTertiary
            : colors.live;
          return (
            <Text
              key={d.gameId}
              style={[
                styles.tally,
                {
                  color,
                  fontWeight: d.hasPick || d.isHotPick ? '800' : '500',
                },
              ]}>
              {glyph}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.4,
  },
  tallyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
  },
  tally: {
    fontSize: 14,
    lineHeight: 16,
    textAlign: 'center',
    minWidth: 6,
  },
});
