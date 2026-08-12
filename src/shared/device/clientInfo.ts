// ---------------------------------------------------------------------------
// getClientInfo — the ONE place that derives "which client build is this?"
//
// Spec: 260812_HotPick_UpdateDeliveryAndClientTelemetry_Spec v1.4 §6.1.
//
// A PLAIN FUNCTION, not a hook, for two independent reasons:
//   • logError.ts is a plain module function with no React in it, and it is one
//     of the three consumers. A hook cannot be called from there.
//   • Every value below is a static module constant that cannot change during a
//     session, so there is nothing for a hook to subscribe to.
//
// Three consumers, one derivation:
//   • VersionStamp.tsx      — the on-screen "did the bundle land?" stamp
//   • logError.ts           — app_version + platform on every client_error_log row
//   • reportClientInfo.ts   — all six values into record_client_info()
//
// GUARD ORDER MATTERS. Check Updates.isEnabled BEFORE touching any other
// Updates.* field: in a dev build (expo-updates disabled) those reads throw, and
// isEmbeddedLaunch is the wrong test — it asks embedded-vs-downloaded, which
// only means anything once updates ARE enabled.
// ---------------------------------------------------------------------------
import {Platform} from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export interface ClientInfo {
  /** app.json `version` — currently "1.1". NOT runtimeVersion ("1.1.0"). */
  appVersion: string | null;
  /** Platform.OS: ios | android | web. The RPC whitelists exactly these. */
  osPlatform: string;
  /**
   * EAS channel: production | preview. Null only on Expo Go and dev builds —
   * it is a BUILD property, so it survives an embedded launch. This is what
   * separates preseason testers on preview from real users on production.
   */
  channel: string | null;
  /**
   * UUID of the RUNNING update. Null ONLY where expo-updates is disabled.
   * NOT null on an embedded launch — use isEmbedded for "has not taken an OTA".
   */
  updateId: string | null;
  /**
   * Creation time of the running update, whether it was embedded in the build
   * or downloaded at runtime. This is the value that MOVES across an OTA, so it
   * is the one directly comparable to a publish time.
   */
  updateCreatedAt: Date | null;
  /** true = running the store bundle, no OTA taken. */
  isEmbedded: boolean | null;
  /** false in a dev build — nothing else above is meaningful when it is. */
  updatesEnabled: boolean;
}

export function getClientInfo(): ClientInfo {
  const appVersion = Constants.expoConfig?.version ?? null;
  const osPlatform = Platform.OS;

  let updatesEnabled = false;
  let channel: string | null = null;
  let updateId: string | null = null;
  let updateCreatedAt: Date | null = null;
  let isEmbedded: boolean | null = null;

  try {
    updatesEnabled = Updates.isEnabled;
    if (updatesEnabled) {
      channel = Updates.channel;
      updateId = Updates.updateId;
      updateCreatedAt = Updates.createdAt;
      isEmbedded = Updates.isEmbeddedLaunch;
    }
  } catch {
    // Updates module unavailable — treat as disabled (dev), same as VersionStamp.
  }

  return {
    appVersion,
    osPlatform,
    channel,
    updateId,
    updateCreatedAt,
    isEmbedded,
    updatesEnabled,
  };
}
