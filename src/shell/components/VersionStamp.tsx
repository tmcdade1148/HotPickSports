import React from 'react';
import {Text, StyleSheet} from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import {useTheme} from '@shell/theme';

/**
 * VersionStamp — the cheapest "did the bundle land?" debugging tool.
 *
 * The app version (1.1.0) is stable across every OTA and tells you nothing on
 * its own — the value that MOVES is `Updates.createdAt` (when the running
 * bundle was published). `isEmbedded` distinguishes "the OTA didn't land" from
 * "this build can't take OTAs at all."
 *
 *   v1.1.0 · preview · Jul 17 15:10 · OTA
 *
 * Null-safe: on an embedded build or in dev, createdAt/channel are null.
 */
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function fmtDate(d: Date): string {
  const mo = MONTHS[d.getMonth()];
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${mo} ${day} ${hh}:${mm}`;
}

export function VersionStamp({style}: {style?: any}) {
  const {colors} = useTheme();
  const version = Constants.expoConfig?.version ?? '?';

  // Read expo-updates constants defensively — reads are safe when updates are
  // disabled (dev), but guard so the stamp can never crash a screen.
  let createdAt: Date | null = null;
  let channel: string | null = null;
  let embedded = false;
  try {
    createdAt = Updates.createdAt;
    channel = Updates.channel;
    embedded = Updates.isEmbedded;
  } catch {
    // updates module unavailable — fall through to the version-only stamp
  }

  const parts = [`v${version}`, channel ?? 'dev'];
  if (createdAt) parts.push(fmtDate(createdAt));
  parts.push(embedded ? 'embedded' : 'OTA');

  return (
    <Text style={[styles.stamp, {color: colors.textTertiary}, style]}>
      {parts.join(' · ')}
    </Text>
  );
}

const styles = StyleSheet.create({
  stamp: {
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
