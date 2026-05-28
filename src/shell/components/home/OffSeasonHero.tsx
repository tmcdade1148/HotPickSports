// src/shell/components/home/OffSeasonHero.tsx
// Renamed from PreSeasonHero. Fires when current_phase === 'OFF_SEASON'
// — the long quiet window between SEASON_COMPLETE and the first
// preseason game. Today (May–Aug) that's most of the calendar for an
// NFL user.
//
// The Join / Create / share CTAs that used to live here moved into the
// HomeScreen YOUR CONTESTS section so the homepage layout stays
// consistent across all states (off-season, pre-season, in-cycle).
// This hero is now just the greeting + welcome line + countdown to
// season_picks_open_at, plus the tell-a-friend share for organizers
// of existing pools.

import React, {useEffect} from 'react';
import {Pressable, Share, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {useCountdown} from './useCountdown';

export function OffSeasonHero() {
  const {colors} = useTheme();

  const picksOpenAt    = useNFLStore(s => s.picksOpenAt);
  const seasonOpenerAt = useNFLStore(s => s.seasonOpenerAt);
  const visiblePools   = useGlobalStore(s => s.visiblePools);
  const userProfile    = useGlobalStore(s => s.userProfile);
  const activeSport    = useGlobalStore(s => s.activeSport);
  const priorSportHistory   = useGlobalStore(s => s.priorSportHistory);
  const loadPriorSportHistory = useGlobalStore(s => s.loadPriorSportHistory);
  // sportIdentity.displayName is the sport-specific brand: 'HotPick
  // Football' for NFL, 'HotPick Hockey' for NHL, etc. Falls back to
  // 'HotPick' if no sport is active.
  const sportName      = activeSport?.sportIdentity?.displayName ?? 'HotPick';

  const target = picksOpenAt ?? seasonOpenerAt;
  const {days, hours, minutes, isExpired} = useCountdown(target);

  // Trigger the prior-sport-history check on first mount (cached
  // per session inside loadPriorSportHistory).
  useEffect(() => {
    if (!activeSport) return;
    loadPriorSportHistory(activeSport.sport, activeSport.competition).catch(() => {});
  }, [activeSport, loadPriorSportHistory]);

  const hasPriorPicks = activeSport ? priorSportHistory[activeSport.sport] === true : false;

  // First pool with an invite code (for share). Many users will only have one.
  const firstPool = visiblePools.find(p => p.invite_code);
  const firstInviteCode = firstPool?.invite_code ?? null;
  const firstPoolName   = firstPool?.name_display || firstPool?.name || null;

  // Returning = either has a current pool, OR has prior-season picks
  // in this sport. The latter catches users coming back for a new
  // season before they've joined any Contest yet — they should still
  // see 'Welcome back to HotPick Football' rather than the new-user
  // opener.
  const returning = hasPriorPicks || visiblePools.length > 0;
  const careerPts = userProfile?.total_career_points ?? 0;

  const handleShare = async () => {
    if (!firstInviteCode) return;
    const message = firstPoolName
      ? `Join my HotPick Contest "${firstPoolName}" — invite code ${firstInviteCode}`
      : `Join me on HotPick — invite code ${firstInviteCode}`;
    try {
      await Share.share({message});
    } catch {
      // user cancelled / unavailable
    }
  };

  return (
    <View style={styles.wrap}>
      {/* Dropped the contextual greeting line that used to sit above the
          headline. The sport-name welcome carries the welcome on its
          own and the greeting felt redundant. */}
      <Text
        style={[
          displayType.display,
          {fontSize: displayType.size.h2, color: colors.textPrimary},
        ]}>
        {returning
          ? `WELCOME BACK TO ${sportName.toUpperCase()}.`
          : `WELCOME TO ${sportName.toUpperCase()}.`}
      </Text>
      <Text style={[bodyType.regular, styles.welcomeSub, {color: colors.textSecondary}]}>
        {returning
          ? careerPts > 0
            ? `${careerPts.toLocaleString()} career pts. Let's run it back.`
            : "Get your Contest together before kickoff."
          : "Contests are how the game's played. Join one or start your own."}
      </Text>

      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textSecondary}]}>
        PICKS OPEN IN
      </Text>
      {/* flex-1 on each cell + adjustsFontSizeToFit lets the row stay
          inside the screen width on smaller iPhones (SE / mini) where
          fixed display2 sizing of three 2-digit pairs ran off the right
          edge. Numbers and colons share the row evenly. */}
      <View style={styles.countdownRow}>
        <CountUnit n={days}    label="days" color={colors.textPrimary} subColor={colors.textTertiary} />
        <Text style={[displayType.display, styles.colon, {color: colors.primary}]}>:</Text>
        <CountUnit n={hours}   label="hrs"  color={colors.textPrimary} subColor={colors.textTertiary} />
        <Text style={[displayType.display, styles.colon, {color: colors.primary}]}>:</Text>
        <CountUnit n={minutes} label="min"  color={colors.textPrimary} subColor={colors.textTertiary} />
      </View>

      {/* Tell-a-friend — only when the user has a pool to share. */}
      {!isExpired && firstInviteCode && (
        <Pressable
          onPress={handleShare}
          style={({pressed}) => [
            styles.shareCta,
            {borderColor: colors.border, opacity: pressed ? 0.7 : 1},
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Invite a friend to ${firstPoolName ?? 'your Contest'}`}>
          <Text style={[bodyType.bold, styles.shareText, {color: colors.textPrimary}]}>
            Invite friends
            {firstPoolName ? (
              <Text style={[bodyType.regular, {color: colors.textSecondary}]}>
                {'  ·  '}{firstPoolName}
              </Text>
            ) : null}
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
  // flex:1 lets each cell share remaining row width evenly; the colon
  // Texts in between are auto-sized. adjustsFontSizeToFit + a high
  // numberOfLines guard keeps the digits inside the cell on narrow
  // screens without wrapping to a second line.
  return (
    <View style={styles.countUnit}>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        minimumFontScale={0.5}
        style={[
          displayType.display,
          monoType.regular,
          styles.countNumber,
          {color},
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
  welcomeSub:    {fontSize: 14, lineHeight: 20, marginTop: 4, marginBottom: spacing.md},
  eyebrow:       {fontSize: 11, letterSpacing: 2, marginTop: spacing.sm, marginBottom: spacing.sm},
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',  // colons + digits align vertically by baseline of the full row
    gap: 2,
    marginBottom: spacing.lg,
  },
  countUnit:    {flex: 1, alignItems: 'center'},
  countNumber:  {fontSize: 56, lineHeight: 60},
  // Match the digit lineHeight so the colon sits visually centered
  // between the two adjacent number cells. paddingBottom was too
  // aggressive (10px) on iOS — dragged colons below the digit baseline.
  colon:        {fontSize: 44, lineHeight: 60, marginBottom: 12},
  countLabel:   {fontSize: 10, letterSpacing: 2, marginTop: 2},

  shareCta: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  shareText: {fontSize: 14, letterSpacing: 0.5},
});
