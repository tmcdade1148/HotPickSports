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
 * bundle was published). `isEmbeddedLaunch` distinguishes "the OTA didn't land" from
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

  // Check isEnabled FIRST. A dev build (Xcode / expo-updates disabled) cannot
  // take an OTA at all, so channel/date are empty and "OTA" would be a lie —
  // the exact wrong answer to the only question this stamp exists to answer.
  // isEmbeddedLaunch is the wrong test here: it asks embedded-vs-downloaded, which
  // only means anything once updates ARE enabled. When disabled we say "dev"
  // and skip channel/date entirely rather than print empty separators.
  let enabled = false;
  let createdAt: Date | null = null;
  let channel: string | null = null;
  let embedded = false;
  try {
    enabled = Updates.isEnabled;
    if (enabled) {
      createdAt = Updates.createdAt;
      channel = Updates.channel;
      embedded = Updates.isEmbeddedLaunch;
    }
  } catch {
    // updates module unavailable — treated as disabled (dev) below
  }

  const parts = [`v${version}`];
  if (!enabled) {
    parts.push('dev');
  } else {
    parts.push(channel ?? '?');
    if (createdAt) parts.push(fmtDate(createdAt));
    parts.push(embedded ? 'embedded' : 'OTA');
  }

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
