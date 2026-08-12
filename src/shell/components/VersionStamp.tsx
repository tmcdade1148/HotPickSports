import React from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet} from 'react-native';
import {useTheme} from '@shell/theme';
import {getClientInfo} from '@shared/device/clientInfo';

/**
 * VersionStamp — the cheapest "did the bundle land?" debugging tool.
 *
 * The app version (1.1) is stable across every OTA and tells you nothing on its
 * own — the value that MOVES is `Updates.createdAt` (when the running bundle was
 * published). `isEmbeddedLaunch` distinguishes "the OTA didn't land" from "this
 * build can't take OTAs at all."
 *
 *   v1.1 · preview · Jul 17 15:10 · OTA
 *
 * NOTE on the version string: this is app.json `version` ("1.1"), NOT
 * runtimeVersion ("1.1.0"). Different fields. An earlier revision of this
 * comment said 1.1.0 and was wrong.
 *
 * NOTE on null-ness, corrected against the expo-updates 55.0.24 typings: only a
 * DEV build (expo-updates disabled) blanks these. `createdAt` is the creation
 * time of the running update whether it was embedded or downloaded at runtime,
 * and `channel` is a build property that is null only on Expo Go and dev builds.
 * An earlier revision of this comment claimed both were null on an embedded
 * build; they are not, and the telemetry checklist tests exactly that.
 *
 * Derivation lives in @shared/device/clientInfo — one plain function shared by
 * this stamp, logError and reportClientInfo, so the three cannot disagree.
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
  const {appVersion, channel, updateCreatedAt, isEmbedded, updatesEnabled} =
    getClientInfo();

  const parts = [`v${appVersion ?? '?'}`];
  if (!updatesEnabled) {
    // A dev build cannot take an OTA at all, so channel/date are empty and
    // "OTA" would be a lie — the exact wrong answer to the only question this
    // stamp exists to answer.
    parts.push('dev');
  } else {
    parts.push(channel ?? '?');
    if (updateCreatedAt) parts.push(fmtDate(updateCreatedAt));
    parts.push(isEmbedded ? 'embedded' : 'OTA');
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
