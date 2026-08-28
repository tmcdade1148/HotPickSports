// src/shell/components/home/RecruiterBand.tsx
// The standing ask: getting somebody into a Contest that is still just its
// Gaffer. Roster line + invite code + a share CTA.
//
// Renders for ONE population and self-hides for everyone else: the current user
// organizes this Contest (pool.organizer_id === their id) and its roster is
// exactly them. Once anybody joins it disappears, because a repeated ask after
// the ask has been answered is just noise.
//
// It was written for the off-cycle layout, dropped from it, and then imported
// by nothing at all until 2026-08-25 — a complete component that made the one
// request the app never made anywhere. It now sits with the in-cycle Contests.
//
// The share text itself comes from buildInviteMessage (@shared/utils/invite) —
// the single invite voice, shared with Contest Settings → Share. It leads with
// the invite code because a code always works; warm deep links on iOS do not
// (see that file for the why).

import React, {useEffect, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, Share, StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {supabase} from '@shared/config/supabase';
import {buildInviteMessage} from '@shared/utils/invite';
import {bodyType, spacing, borderRadius} from '@shared/theme';

export function RecruiterBand() {
  const {colors} = useTheme();

  const visiblePools = useGlobalStore(s => s.visiblePools);
  const userId       = useGlobalStore(s => s.user?.id);

  // Exactly the population this exists for: a Contest the user ORGANIZES that
  // is still only them. Once somebody joins, the ask is done and a standing
  // prompt turns into noise, so the band disappears on its own.
  //
  // visiblePools has already dropped archived, hidden and demo Contests — that
  // is what makes it "visible" — so this picks the candidate on the one
  // condition it does not cover. Restating the whole real-Contest definition
  // here would be a second copy of it, and a definition kept in several places
  // is what produced the 77-recipient broadcast on 2026-08-25.
  // TEMPORARY GUARD — removed by the Contest Invite Row build
  // (260828_HotPick_ContestInviteRow_Spec), which deletes this component
  // outright and moves the invite code into the Contest card itself, where it
  // reads from that card's own props and the mismatch below becomes
  // structurally impossible rather than merely narrowed.
  //
  // This used to be a bare .find(). That returns the FIRST Contest the user
  // organizes that carries a code, and it never looks at which card the
  // carousel is showing — the band has no connection to carousel position at
  // all. Device evidence 2026-08-28: with TestContestA / B / C all solo, the
  // band read "TestContestB · code 6JV6HR" while the carousel displayed A, and
  // again while it displayed C. Wrong code under the wrong Contest, on two of
  // three cards, and tapping Share would have sent players to the wrong place.
  //
  // Narrowing to EXACTLY ONE candidate makes that unreachable: with a single
  // candidate there is nothing for the pick to get wrong. Organizers holding
  // two or more coded Contests lose the band entirely — that is the intended
  // trade, not a regression. They still reach the code via the gear icon on
  // each card, and via the Handoff at creation.
  //
  // Do NOT "fix" this by loosening the comparison, reading a carousel index,
  // or reaching for the globally selected pool. Any of those reintroduces the
  // bug this guard exists to remove.
  const candidates = visiblePools.filter(
    p => p.invite_code && p.organizer_id === userId,
  );
  const pool = candidates.length === 1 ? candidates[0] : undefined;

  // THE COUNT HAS TO BE THE ROSTER, NOT THE RANK RPC.
  //
  // userRankByPool.memberCount comes from get_user_ranks_in_pools, whose
  // active_members CTE filters `NOT is_super_admin` — it is the STANDINGS
  // population, sized to rank against, not the number of people in the Contest.
  // Verified 2026-08-25: NFL HotPick 26A has 2 active members and the RPC
  // reports 1; The Natural NFL26 is 3 and reports 2. Gating `=== 1` on that
  // number showed the band on a Contest that already had somebody in it.
  //
  // get_pool_member_counts is NOT the fix either, despite the name: it carries
  // the identical super-admin filter. Checked before reaching for it.
  //
  // This is the same population mismatch that parked the PoolModule rank chip
  // ("12 of 11"), surfacing in a second place. Counting the roster directly is
  // what removes it; loosening the gate to `<= 1` would only hide it.
  //
  // A handful of rows, only for a Gaffer, only when there is a candidate.
  const [rosterCount, setRosterCount] = useState<number | null>(null);
  const poolId = pool?.id;

  useEffect(() => {
    if (!poolId) {
      setRosterCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const {count, error} = await supabase
        .from('pool_members')
        .select('user_id', {count: 'exact', head: true})
        .eq('pool_id', poolId)
        .eq('status', 'active');
      if (!cancelled) setRosterCount(error ? null : count ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [poolId]);

  if (!pool?.invite_code) return null;
  // null covers both "still counting" and "the count failed", and both mean the
  // same thing here: say nothing rather than flash an ask at somebody whose
  // Contest already has people in it.
  if (rosterCount !== 1) return null;

  const code     = pool.invite_code;
  const poolName = pool.name_display || pool.name || 'your Contest';

  const handleShare = async () => {
    const message = buildInviteMessage(pool, code);
    try {
      await Share.share({message});
    } catch {
      // user cancelled / unavailable
    }
  };

  // The non-Gaffer and multi-member variants that used to live here are gone
  // with the branch that could reach them: the band now renders only for a
  // Gaffer whose Contest has exactly one member, so every "if they are not the
  // organizer" and "if the count is more than one" arm was unreachable.
  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.textTertiary}]}>
        BRING YOUR GROUP IN
      </Text>
      <Text style={[bodyType.regular, styles.roster, {color: colors.textSecondary}]}>
        {`Just you in ${poolName} so far · code ${code}`}
      </Text>
      <Pressable
        onPress={handleShare}
        style={({pressed}) => [
          styles.primaryBtn,
          {backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Share invite link to ${poolName}`}>
        <Text style={[bodyType.bold, styles.primaryBtnText, {color: colors.onPrimary}]}>
          Share Invite Link
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  eyebrow: {fontSize: 11, letterSpacing: 1.8, marginBottom: 4},
  roster:  {fontSize: 14, lineHeight: 20, marginBottom: 4},
  primaryBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  primaryBtnText: {fontSize: 15, letterSpacing: 0.5},
});
