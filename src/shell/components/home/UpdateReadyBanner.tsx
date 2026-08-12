// src/shell/components/home/UpdateReadyBanner.tsx
// Spec: 260812_HotPick_UpdateDeliveryAndClientTelemetry_Spec v1.4 §6.3 / §6.4
//
// An OTA downloads silently at launch (EXUpdatesCheckOnLaunch=ALWAYS,
// EXUpdatesLaunchWaitMs=0) and then waits for a cold start. Nothing tells the
// Player. This banner is that telling, plus the one-tap way to take it now.
//
// PERSISTENT WITHIN THE SESSION. No dismiss, no snooze, no auto-hide timer. It
// is resolved by the Player tapping Restart, or by their next cold start —
// whichever comes first. Do NOT add a stored flag to make it survive a cold
// start: after that start the pending bundle IS the running bundle, and
// isUpdatePending is correctly false. There is nothing left to announce.
//
// Never reloads on its own. reloadAsync() remounts the JS tree, and doing that
// unprompted mid-picks on a Sunday would discard unsaved selections.
//
// Lives INSIDE HomeScreen's header overlay (below SystemMessageSlot, above
// IdentityBar) so the overlay's existing onLayout repads the ScrollView for it.
// Inside the ScrollView it would scroll away.
//
// HotPick-themed via useTheme (Hard Rule #9). Informational, so surface and
// secondary — never the error/destructive colour.

import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import * as Updates from 'expo-updates';
import {Download} from 'lucide-react-native';
import {Text} from '@shared/components/AppText';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {getClientInfo} from '@shared/device/clientInfo';

/**
 * Outer gate. Calls NO hooks, so the early return is legal — and that is the
 * point: `Updates.useUpdates()` is only ever mounted on a build where
 * expo-updates is actually enabled.
 *
 * This is deliberate defence, not ceremony. jest.setup.js documents that
 * expo-updates resolves its native module eagerly at import time and has to be
 * mocked member-by-member; a dev build that blanks `isEnabled` is exactly the
 * shape where an unguarded hook call is most likely to throw. A dev build can
 * never take an update anyway, so there is nothing to subscribe to there.
 *
 * `updatesEnabled` comes from a static module constant behind getClientInfo's
 * try/catch, so it cannot change between renders and cannot break hook order.
 */
export function UpdateReadyBanner() {
  const {updatesEnabled} = getClientInfo();
  if (!updatesEnabled) return null;
  return <PendingUpdateBanner />;
}

/** Mounted only when expo-updates is enabled. Owns the subscription. */
function PendingUpdateBanner() {
  const {colors} = useTheme();
  const {isUpdatePending} = Updates.useUpdates();

  if (!isUpdatePending) return null;

  return (
    <View
      style={[
        styles.wrap,
        {backgroundColor: colors.surface, borderColor: colors.border},
      ]}>
      <View style={styles.iconWrap}>
        <Download size={16} color={colors.secondary} strokeWidth={2.25} />
      </View>

      <View style={styles.copyWrap}>
        <Text
          style={[bodyType.bold, styles.eyebrow, {color: colors.textTertiary}]}>
          UPDATE READY
        </Text>
        <Text
          style={[bodyType.regular, styles.message, {color: colors.textPrimary}]}
          numberOfLines={1}>
          A new version is ready. Restart to update.
        </Text>
      </View>

      <Pressable
        onPress={() => {
          // The ONLY caller of reloadAsync in the app.
          Updates.reloadAsync().catch(() => {});
        }}
        hitSlop={8}
        style={({pressed}) => [styles.action, {opacity: pressed ? 0.6 : 1}]}
        accessibilityRole="button"
        accessibilityLabel="Restart now to load the new version">
        <Text style={[bodyType.bold, styles.actionLabel, {color: colors.secondary}]}>
          Restart
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: borderRadius.lg - 2,
    borderWidth: 1,
  },
  iconWrap: {width: 20, alignItems: 'center', justifyContent: 'center'},
  copyWrap: {flex: 1, gap: 1},
  eyebrow: {fontSize: 10, letterSpacing: 0.6},
  message: {fontSize: 13, lineHeight: 17},
  action: {paddingVertical: 2, paddingHorizontal: 2},
  actionLabel: {fontSize: 14, letterSpacing: 0.2},
});
