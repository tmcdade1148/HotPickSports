// Complete-state hero: depleted week-lock strip, standing context,
// final-state HotPick card, dimmed CTA, recap line, weekly trend.

import React, {useMemo} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ArrowRight, Flame} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {isFinalStatus} from '@sports/nfl/utils/gameStatus';
import {hexToRgba} from '@shared/utils/color';
import {ordinal} from '@shared/utils/format';
import {fullTeamName} from './teamColors';
import {buildWeekRecap} from './weekRecap';
import {WeeklyTrend} from './WeeklyTrend';
import {WeekLockStrip} from './WeekLockStrip';

export function CompleteHero() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const weekResult      = useNFLStore(s => s.weekResult);
  const currentWeek     = useNFLStore(s => s.currentWeek);
  const userHotPick     = useNFLStore(s => s.userHotPick);
  const userHotPickGame = useNFLStore(s => s.userHotPickGame);
  const activePoolId    = useGlobalStore(s => s.activePoolId);
  const visiblePools    = useGlobalStore(s => s.visiblePools);
  const activePool      = visiblePools.find(p => p.id === activePoolId);

  const newRank  = weekResult?.newRank;
  const poolName = activePool?.name ?? 'your pool';

  // Recap input — cascade through what's available so the recap is
  // ALWAYS visible in complete state, even when weekResult or recentWeeks
  // haven't hydrated.
  const recentWeeks = useGlobalStore(s => s.recentWeeks);
  const recapInput = useMemo(() => {
    if (weekResult) return weekResult;
    const row = recentWeeks.find(r => r.week === currentWeek);
    return {
      weekPoints:    row?.total ?? 0,
      correctPicks:  0,
      totalPicks:    0,
      hotPickCorrect: null as boolean | null,
      rankDelta:     0,
      newRank:       0,
    };
  }, [weekResult, recentWeeks, currentWeek]);

  // HotPick — color the card by final outcome (green if correct, red if not).
  // Cascade through signals so the border is green/red as soon as the
  // outcome is known, even if weekResult hasn't hydrated:
  //   1. weekResult.hotPickCorrect (authoritative once scoring's done)
  //   2. Derived from liveScores[hotPickGame] vs userHotPick.picked_team
  const liveScores = useNFLStore(s => s.liveScores);
  const hotPickCorrect = useMemo(() => {
    if (weekResult?.hotPickCorrect != null) return weekResult.hotPickCorrect;
    if (!userHotPick || !userHotPickGame) return null;
    const score = liveScores[userHotPickGame.game_id];
    if (!score) return null;
    if (!isFinalStatus(score.status)) return null;
    const pickedHome = userHotPick.picked_team === userHotPickGame.home_team;
    const userScore = pickedHome ? score.homeScore : score.awayScore;
    const oppScore  = pickedHome ? score.awayScore : score.homeScore;
    return userScore > oppScore;
  }, [weekResult, userHotPick, userHotPickGame, liveScores]);
  const hotPickValue =
    userHotPickGame?.frozen_rank ?? userHotPickGame?.rank ?? null;
  const hotPickTint =
    hotPickCorrect == null
      ? colors.primary
      : hotPickCorrect
      ? colors.win
      : colors.loss;
  const pickedTeam = fullTeamName(userHotPick?.picked_team);
  const signedHotPickPoints =
    hotPickValue == null || hotPickCorrect == null
      ? null
      : hotPickCorrect
      ? hotPickValue
      : -hotPickValue;

  return (
    <View
      style={[
        styles.card,
        {backgroundColor: colors.surfaceElevated, borderColor: colors.border},
      ]}>
      {/* Depleted pick-lock strip — every glyph reads as locked. Matches
          PicksOpenHero's eyebrow row spacing exactly. HotPick card sits
          directly below with no top margin so the gap is just the
          eyebrowRow's marginBottom (12) — identical to PicksOpenHero. */}
      <View style={styles.eyebrowRow}>
        <WeekLockStrip />
      </View>

      {/* HotPick card — final-state coloring, FINAL chip in upper right. */}
      {userHotPick && userHotPickGame && (
        <View
          style={[
            styles.hotPickCard,
            {
              backgroundColor: hexToRgba(hotPickTint, 0.08),
              borderColor: hotPickTint,
            },
          ]}>
          <View
            style={[
              styles.hotPickIconCircle,
              {backgroundColor: hexToRgba(hotPickTint, 0.18)},
            ]}>
            <Flame size={14} color={hotPickTint} strokeWidth={2.5} />
          </View>
          <View style={styles.hotPickBody}>
            <View style={styles.hotPickHeaderRow}>
              <Text style={[bodyType.bold, styles.hotPickEyebrow, {color: hotPickTint}]}>
                YOUR HOTPICK
              </Text>
              <Text style={[bodyType.bold, styles.hotPickFinalLabel, {color: colors.loss}]}>
                FINAL
              </Text>
            </View>
            <View style={styles.hotPickTeamRow}>
              <Text
                style={[
                  displayType.display,
                  styles.hotPickMatchup,
                  {color: colors.textPrimary, flexShrink: 1},
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.55}>
                {pickedTeam || userHotPick.picked_team}
              </Text>
              {hotPickValue != null && (
                <View
                  style={[
                    styles.hotPickValueBadge,
                    {
                      backgroundColor: hexToRgba(hotPickTint, 0.18),
                      borderColor: hotPickTint,
                    },
                  ]}>
                  <Text style={[displayType.display, styles.hotPickValueText, {color: hotPickTint}]}>
                    {signedHotPickPoints != null
                      ? `${signedHotPickPoints > 0 ? '+' : ''}${signedHotPickPoints}`
                      : hotPickValue}
                    <Text style={styles.hotPickValueUnit}> PTS</Text>
                  </Text>
                </View>
              )}
            </View>
            {(() => {
              const lsHp = liveScores[userHotPickGame.game_id];
              const awayScore = lsHp?.awayScore ?? userHotPickGame.away_score;
              const homeScore = lsHp?.homeScore ?? userHotPickGame.home_score;
              const showScores = awayScore != null || homeScore != null;
              return (
                <Text
                  style={[bodyType.regular, styles.hotPickMatchupSub, {color: colors.textTertiary}]}
                  numberOfLines={1}>
                  <Text>{(userHotPickGame.away_team ?? '').toUpperCase()}</Text>
                  {showScores && (
                    <Text style={{color: colors.textPrimary, fontWeight: '700'}}>
                      {' '}{awayScore ?? 0}
                    </Text>
                  )}
                  {' @ '}
                  <Text>{(userHotPickGame.home_team ?? '').toUpperCase()}</Text>
                  {showScores && (
                    <Text style={{color: colors.textPrimary, fontWeight: '700'}}>
                      {' '}{homeScore ?? 0}
                    </Text>
                  )}
                </Text>
              );
            })()}
          </View>
        </View>
      )}

      {/* Standing context — sits between CTA and trend strip, same spot
          PicksOpenHero uses for its confirmation line. */}
      {typeof newRank === 'number' && (
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

      {/* CTA — dimmed flame, two-line label, arrow aligned to top. */}
      <Pressable
        onPress={() => navigation.navigate('PicksTab')}
        style={({pressed}) => [
          styles.cta,
          {backgroundColor: colors.primary, shadowColor: colors.primary, opacity: pressed ? 0.6 : 0.7},
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Week ${currentWeek} complete — review your picks`}>
        <View style={styles.ctaLabel}>
          <Text style={[displayType.display, styles.ctaText, {color: colors.onPrimary}]} numberOfLines={1}>
            WEEK {currentWeek} COMPLETE
          </Text>
          <Text style={[bodyType.regular, styles.ctaFollowOn, {color: colors.onPrimary}]}>
            review your picks
          </Text>
        </View>
        <ArrowRight size={22} color={colors.onPrimary} strokeWidth={3} />
      </Pressable>

      {/* Week recap — brand-voice sentence recapping the user's week
          (HotPick hit/miss, net points, picks correct). Always renders
          in complete state — falls through to a generic message when
          detailed weekResult/recentWeeks data isn't hydrated. */}
      <Text style={[bodyType.regular, styles.recapLine, {color: colors.textSecondary}]}>
        {buildWeekRecap(recapInput)}
      </Text>

      {/* Weekly trend strip — past weeks + current week earned. */}
      <WeeklyTrend />
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
  // Matches PicksOpenHero.eyebrowRow exactly — same horizontal layout
  // and bottom spacing so the lock strip sits in the same visual slot.
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  hotPickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: borderRadius.lg - 2,
    borderWidth: 1,
    // No marginTop — eyebrowRow's marginBottom (12) above provides the
    // exact same gap PicksOpenHero uses between the lock strip and the
    // HotPick pill.
    marginBottom: 14,
  },
  hotPickIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  hotPickBody: {
    flex: 1,
    minWidth: 0,
  },
  hotPickHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  hotPickEyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
  },
  hotPickFinalLabel: {
    fontSize: 15,
    letterSpacing: 1.4,
  },
  hotPickTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hotPickMatchup: {
    fontSize: 16,
    lineHeight: 18,
  },
  hotPickMatchupSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  hotPickValueBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    flexShrink: 0,
  },
  hotPickValueText: {
    fontSize: 13,
    lineHeight: 14,
  },
  hotPickValueUnit: {
    fontSize: 9,
    letterSpacing: 0.4,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md + 2,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 6},
    elevation: 4,
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
  recapLine: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 12,
  },
});
