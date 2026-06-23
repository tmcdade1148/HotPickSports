// Tally-dot week summary: one glyph per game in kickoff order, color
// + weight encode lock state / pick-set / HotPick.

import React, {useMemo, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {LayoutChangeEvent, StyleSheet, View} from 'react-native';
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

// Dot geometry. Dots scale DOWN from MAX_DOT so the whole strip always fits
// the available width on a single line; MIN_DOT keeps them visible on a packed
// playoff/full-slate week. The HotPick dot renders one step larger than the
// rest (capped at MAX_DOT) so it still reads as the highlighted game.
const MAX_DOT = 8;
const MIN_DOT = 3;
const MIN_GAP = 2;       // smallest spacing kept between dots when packed
const HOTPICK_BUMP = 2;  // HotPick dot is this much larger than the base dot

export function WeekLockStrip() {
  const {colors} = useTheme();
  const games        = useSeasonStore(s => s.games);
  const weekPicks    = useSeasonStore(s => s.weekPicks);
  const liveScores   = useNFLStore(s => s.liveScores);
  const userHotPick  = useNFLStore(s => s.userHotPick);

  // Width available to the dot row, measured at layout. Until it's known we
  // fall back to MAX_DOT (correct for short slates; a packed week corrects on
  // the first onLayout pass).
  const [rowWidth, setRowWidth] = useState(0);
  const onTallyLayout = (e: LayoutChangeEvent) =>
    setRowWidth(e.nativeEvent.layout.width);

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

  // Largest base dot that still lets every dot (one bumped for the HotPick)
  // plus minimum gaps fit the measured row on a single line. Dots spread via
  // space-between, so the strip always spans the full pill width and never
  // wraps — it just scales the dots up on short slates and down on packed ones.
  const n = dots.length;
  const baseDot =
    rowWidth > 0
      ? Math.max(
          MIN_DOT,
          Math.min(
            MAX_DOT,
            Math.floor(
              (rowWidth - HOTPICK_BUMP - (n - 1) * MIN_GAP) / n,
            ),
          ),
        )
      : MAX_DOT - HOTPICK_BUMP;

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
      <View style={styles.tallyRow} onLayout={onTallyLayout}>
        {dots.map(d => {
          // One circular dot per game, sized to match the contest-carousel
          // position dots. Encodes three signals:
          //   color  = green editable / gray locked / flame HotPick
          //   size   = HotPick is the slightly larger (highlighted) dot
          //   filled = the user has a pick on this game (hollow = no pick yet)
          const color = d.isHotPick
            ? colors.primary
            : d.isLocked
            ? colors.textTertiary
            : colors.live;
          const size = d.isHotPick
            ? Math.min(MAX_DOT, baseDot + HOTPICK_BUMP)
            : baseDot;
          const filled = d.hasPick || d.isHotPick;
          return (
            <View
              key={d.gameId}
              style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: filled ? color : 'transparent',
                borderWidth: filled ? 0 : 1.5,
                borderColor: color,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Spans the full pill width so the dot row can stretch edge-to-edge.
  wrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Fixed natural width — the dot row takes whatever's left.
  label: {
    fontSize: 10,
    letterSpacing: 1.4,
    flexShrink: 0,
  },
  // Fills the remaining width and distributes the dots across it on a single
  // line (space-between). Dot SIZE is computed per-render so they never wrap.
  tallyRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
