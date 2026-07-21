// Complete-state hero: standing context, dimmed CTA. HISTORY owns the
// finished-week HotPick, recap, and weekly trend (v4.1 handoff at settling).

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {ArrowRight} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {ordinal} from '@shared/utils/format';
import {GamesTagFlame} from '@shared/components/GamesTagFlame';

// LAUNCH FLAG — the "You sit Nth in <Contest>" standing line is HIDDEN for launch.
// weekResult.newRank intermittently renders a null "0th" (render-timing), which
// reads as broken on the first screen, and the line duplicates the Ladder (one tap
// away). Removed for launch, NOT deleted — flip to true to restore the status line
// once newRank loading is reliable. See also userRankByPool/get_user_ranks_in_pools.
const SHOW_STANDING_LINE = false;

export function CompleteHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const weekResult      = useNFLStore(s => s.weekResult);
  const currentWeek     = useNFLStore(s => s.currentWeek);
  const activePoolId    = useGlobalStore(s => s.activePoolId);
  const visiblePools    = useGlobalStore(s => s.visiblePools);
  const activePool      = visiblePools.find(p => p.id === activePoolId);

  const newRank  = weekResult?.newRank;
  const poolName = activePool?.name ?? 'your Contest';

  return (
    <View
      style={[
        styles.card,
        {backgroundColor: colors.surfaceElevated, borderColor: colors.border},
      ]}>
      {/* Standing context — sits between CTA and trend strip, same spot
          PicksOpenHero uses for its confirmation line. */}
      {SHOW_STANDING_LINE && typeof newRank === 'number' && (
        <Text style={[bodyType.regular, styles.standingText, {color: colors.textPrimary}]}>
          You sit <Text style={{fontFamily: 'Manrope-Bold'}}>{ordinal(newRank)}</Text> in {poolName}.
        </Text>
      )}
      {weekResult?.rankDelta != null && weekResult.rankDelta !== 0 && (
        <Text
          style={[
            monoType.regular,
            styles.delta,
            {color: weekResult.rankDelta > 0 ? colors.win : colors.loss},
          ]}>
          {weekResult.rankDelta > 0 ? '↑' : '↓'} {Math.abs(weekResult.rankDelta)} from last week
        </Text>
      )}

      {/* CTA — dimmed flame, two-line label, arrow aligned to top. Left
          1/6 is a HotPick-blue flame strip matching the PicksOpenHero
          CTA so the navigation destination (Games) is visually
          consistent across home states. */}
      <Pressable
        onPress={() => navigation.navigate('PicksTab')}
        style={({pressed}) => [
          styles.cta,
          {backgroundColor: colors.primary, shadowColor: colors.primary, opacity: pressed ? 0.6 : 0.7},
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Go to games — Week ${currentWeek} complete, review your picks`}>
        <View style={[styles.gamesTag, {backgroundColor: colors.highlight}]}>
          <GamesTagFlame size={44} />
        </View>
        <View style={styles.ctaBody}>
          <View style={styles.ctaLabel}>
            <Text style={[displayType.display, styles.ctaText, {color: colors.onPrimary}]} numberOfLines={1}>
              WEEK {currentWeek} COMPLETE
            </Text>
            <Text style={[bodyType.regular, styles.ctaFollowOn, {color: colors.onPrimary}]}>
              review your picks
            </Text>
          </View>
          <ArrowRight size={22} color={colors.onPrimary} strokeWidth={3} />
        </View>
      </Pressable>

      {/* The week-recap prose is deleted. It called buildWeekRecap with RAW
          server counts, so it printed "of 16" — while HISTORY's recap card,
          showing the same week, derives "of 15" per the map. In the complete
          state both were on screen at once, disagreeing. HISTORY owns the
          recap; this hero keeps the standing and the rank delta. */}

      {/* WeeklyTrend (the 3 week-pills) is retired — HISTORY owns per-week
          scores now. The recap line above is the card's last element; the
          card's own 18px padding closes the bottom, so no spacing was lost
          (the strip carried its own marginTop, not a bottom gap). */}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: 18,
    borderRadius: borderRadius.lg + 2,
    borderWidth: 1,
  },
  standingText: {
    fontSize: 14,
    lineHeight: 20,
  },
  delta: {
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 12,
  },
  cta: {
    flexDirection: 'row',
    borderRadius: borderRadius.md + 2,
    overflow: 'hidden',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 6},
    elevation: 4,
  },
  // Left 1/6 — solid HotPick light-blue strip backing the full-color flame
  // brand mark. Fill is colors.highlight (#A5CCD9, applied inline).
  gamesTag: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Right 5/6 — wraps the original label + arrow. Padding lives here
  // so the GAMES tag bleeds to the rounded edge.
  ctaBody: {
    flex: 5,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 20,
  },
  ctaLabel: {
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 18,
    letterSpacing: 0.5,
  },
  ctaFollowOn: {
    fontSize: 10,
    lineHeight: 11,
    fontStyle: 'italic',
    opacity: 0.78,
    marginTop: 1,
  },
});
