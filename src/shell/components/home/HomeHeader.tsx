// src/shell/components/home/HomeHeader.tsx
// Slim top row for the Home Screen.
//
//   HOT PICK SPORTS                  [ NFL26 · W08 ⌄ ]
//
// Left  — text-rendered wordmark (no image asset):
//         "HOT" + "PICK" + " SPORTS"
//         "HOT" + "SPORTS" in primary flame; "PICK" in textPrimary
// Mid   — period pill (NFL26 · W08 / PRESEASON / WC / SB / etc.)
//         primary-bordered italic pill, season-year-aware (e.g. NFL26).
//         Doubles as the Event Switcher when the Player is connected to more
//         than one event (SWITCHER-01 §5c) — see the chevron gate below.
// Right — period pill only. The Settings gear moved to the bottom nav as a
//         real fifth tab (slice 2).
//
// NOTE: PicksHeader composes this same component, so the switcher is reachable
// from the Picks tab too. That is deliberate — the two headers are built to be
// a pixel match, and a chevron on one but not the other would break it.

import React, {useMemo, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, TouchableOpacity, View} from 'react-native';
import {ChevronDown} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getConnectedEvents} from '@sports/registry';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import {COMPACT_PERIOD_LENGTH} from './shortPeriod';
import {usePeriodLabel, useSpokenPeriodLabel} from './usePeriodLabel';
import {EventSwitchModal} from './EventSwitchModal';

// Ceiling on OS accessibility font enlargement for the fixed-layout header row
// (wordmark + period pill). Tune on a real device. Mirrored in PoolHeader /
// PicksHeader so all three header rows behave identically.
const HEADER_MAX_FONT_SCALE = 1.2;

export function HomeHeader() {
  const {colors} = useTheme();
  const period = usePeriodLabel();
  const spokenPeriod = useSpokenPeriodLabel();
  // Persistent reminder for sandbox tester accounts (Operator Console Phase 2 §6c).
  // Brand-themed per Hard Rule #9 (the spec's literal #F28B30 would violate it).
  const isTestAccount = useGlobalStore(s => s.userProfile?.is_test_account === true);

  // ── Event Switcher (SWITCHER-01) ──────────────────────────────────────
  const connectedCompetitions = useGlobalStore(s => s.connectedCompetitions);
  const visibleCompetitions   = useGlobalStore(s => s.visibleCompetitions);
  const activeSport           = useGlobalStore(s => s.activeSport);
  const isDemoActive          = useGlobalStore(s => s.isDemoActive);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const connectedEvents = useMemo(
    () => getConnectedEvents(connectedCompetitions, visibleCompetitions),
    [connectedCompetitions, visibleCompetitions],
  );

  // The chevron appears ONLY when there is somewhere to go — an affordance
  // that opens a list of one teaches Players to ignore it (spec §3). With one
  // entry this renders byte-for-byte what it rendered before the switcher.
  //
  // Suppressed during the onboarding demo: the demo swaps activeSport +
  // activePoolId directly (demoSlice) and the pill reads 'PRACTICE', so
  // switching out through setActiveSport would strand isDemoActive = true and
  // the pre-demo snapshot. PicksHeader renders this header and the demo lives
  // on the Picks tab, so this guard is load-bearing, not defensive.
  const canSwitch = connectedEvents.length > 1 && !isDemoActive;

  const pillText = (
    /* Static font-size step based on label length — iOS
       adjustsFontSizeToFit was ignoring our cap with italic +
       letterSpacing in play, leaving the long off-cycle labels
       ('NFL26 · OFFSEASON' / 'NFL26 · SEASON DONE') at full
       size and crowding the wordmark. ≤12 chars (W08, WC, DIV,
       SB) keeps the full 16.5px; everything longer steps down
       to 13px. */
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}
      style={[
        bodyType.bold,
        period.length > COMPACT_PERIOD_LENGTH ? styles.pillTextCompact : styles.pillText,
        {color: colors.primary},
      ]}>
      {period}
    </Text>
  );

  return (
    <>
    <View style={styles.row}>
      {/* maxFontSizeMultiplier caps OS font enlargement so the wordmark and
          the period pill can't grow into each other at large accessibility
          font settings. (adjustsFontSizeToFit is intentionally NOT used on the
          italic pill — see the static-step comment below.) */}
      <View style={styles.wordmarkRow}>
        <Text maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE} style={[displayType.display, styles.wordmark, {color: colors.primary}]}>HOT</Text>
        <Text maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE} style={[displayType.display, styles.wordmark, {color: colors.textPrimary}]}>PICK</Text>
        <Text maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE} style={[displayType.display, styles.wordmarkSmall, {color: colors.primary}]}> SPORTS</Text>
      </View>
      <View style={styles.rightCluster}>
        {canSwitch ? (
          <TouchableOpacity
            accessibilityRole="button"
            // The visible label is an abbreviation that doesn't read on its
            // own, so name the EVENT and the action instead (spec §5c).
            accessibilityLabel={`${activeSport?.name ?? 'Event'}, ${spokenPeriod}. Change event.`}
            onPress={() => setSwitcherOpen(true)}
            style={[styles.pill, styles.pillSwitchable, {borderColor: colors.primary}]}>
            {pillText}
            <ChevronDown size={14} color={colors.primary} strokeWidth={2.5} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.pill, {borderColor: colors.primary}]}>{pillText}</View>
        )}
      </View>
    </View>
    {canSwitch && (
      <EventSwitchModal
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        events={connectedEvents}
      />
    )}
    {isTestAccount && (
      <View style={styles.testBannerWrap}>
        <View style={[styles.testBanner, {backgroundColor: colors.primary}]}>
          <Text style={[bodyType.bold, styles.testBannerText, {color: colors.onPrimary}]}>
            🧪 Test Account — Sim Only
          </Text>
        </View>
      </View>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 0,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wordmark: {
    fontSize: 15,
    letterSpacing: 0.5,
  },
  wordmarkSmall: {
    fontSize: 9,
    letterSpacing: 0.5,
    marginLeft: 1,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pill: {
    paddingHorizontal: (spacing.sm + 2) * 1.5,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  // Switcher variant: lays the chevron beside the label and trims the right
  // pad so the pill grows by roughly the glyph alone. The header row is fixed
  // width and the long off-cycle labels ('NFL26 · OFFSEASON', already stepped
  // down to the compact font) sit closest to the wordmark — that is the case
  // to check on device.
  pillSwitchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: spacing.sm,
  },
  pillText: {
    fontSize: 16.5,
    letterSpacing: 1.2,
    fontStyle: 'italic',
  },
  // Compact font for long off-cycle labels (OFFSEASON, PRESEASON,
  // SEASON DONE, WK 18 DONE) so they fit without crowding the
  // HOTPICK SPORTS wordmark or the gear icon.
  pillTextCompact: {
    fontSize: 13,
    letterSpacing: 1.1,
    fontStyle: 'italic',
  },
  testBannerWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
    alignItems: 'flex-start',
  },
  testBanner: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  testBannerText: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
