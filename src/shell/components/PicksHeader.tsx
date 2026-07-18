// Header for the Picks tab — composed from the SAME modules Home composes, so
// the two headers are a pixel match.
//
//   HOT PICK SPORTS                       [ NFL26 · W08 ]
//   TMCDADE                                  1,234 / SEASON PTS
//
// Deliberately does NOT include SystemMessageSlot, the third module in Home's
// composition: it renders a Flame (rule 1 — flame only on the HotPick card) and
// is Home-scoped by spec §6.4.1.

import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {spacing} from '@shared/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {HomeHeader} from './home/HomeHeader';
import {IdentityBar} from './home/IdentityBar';

export function PicksHeader() {
  const {colors} = useTheme();

  // IDENTITY is an invariant module — the season total must not read '—' just
  // because Home happened not to mount first. This is a second CALLER of the
  // existing loadSeasonTotal action (HomeScreen is the other), guarded on null
  // so it never refetches what Home already loaded. Not a new selector:
  // getState() is a one-shot read, not a subscription, so this adds no re-render
  // path and no second season-points read.
  //
  // Mount-only deps are safe here: PicksTab does not render this header until
  // `activeSport` exists, so user + competition are already resolved.
  useEffect(() => {
    const g = useGlobalStore.getState();
    if (g.seasonTotal != null) return;
    const userId = g.user?.id;
    // activeSport.competition rather than nflStore's copy of it — same value
    // (nflStore is initialized from it), and it keeps this shell component free
    // of a sport-module import (Hard Rule #4).
    const competition = g.activeSport?.competition;
    if (!userId || !competition) return;
    g.loadSeasonTotal(userId, competition).catch(() => {});
  }, []);

  return (
    // Shares Home's chrome transparency via `colors.chrome` so the two can never
    // drift. NOTE: this header is still in NORMAL FLOW — nothing scrolls behind
    // it, so the alpha is invisible here today. The overlay conversion (absolute
    // + re-padding the screen by its measured height, the way HomeScreen does)
    // is DEFERRED to slices 3-7. Deferred, not forgotten.
    //
    // No onLayout here on purpose: Home measures its header height only to pad
    // its own scroll. Picks doesn't need that.
    <View style={{backgroundColor: colors.chrome}}>
      <HomeHeader />
      <IdentityBar style={styles.identityTighten} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Picks needs a tighter gap under the identity row than Home does (Home uses
  // spacing.sm) because the week pills sit directly below it. paddingBottom
  // ONLY — IdentityBar owns its own two-column layout and must not be handed
  // flex/row styling from outside.
  identityTighten: {
    paddingBottom: spacing.xs,
  },
});
