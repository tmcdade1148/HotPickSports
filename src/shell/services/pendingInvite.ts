import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import {useGlobalStore} from '@shell/stores/globalStore';

/**
 * Pending invite-code handling for the deferred ("cold install") deep-link flow.
 *
 * Layers, in priority order:
 *   1. Live deep link this session  → already in globalStore.pendingInviteCode
 *   2. Persisted across launches     → AsyncStorage (survives the app being
 *      backgrounded mid-signup, or a relaunch before PoolWelcome is reached)
 *   3. Cold install handoff          → FIRST-LAUNCH-ONLY clipboard probe. The
 *      web landing page copies the code to the clipboard when the user taps a
 *      store button; on the very first launch after install we read it back.
 *
 * The join itself is unchanged — this only delivers the code to the existing
 * join_pool_by_invite flow. The manual entry on PoolWelcomeScreen remains the
 * guaranteed fallback when none of the above produces a code.
 */

/** Invite codes: 6–12 chars, uppercase alphanumeric (matches pool_invite_codes CHECK). */
const INVITE_CODE_RE = /^[0-9A-Z]{6,12}$/;

/** Holds a pending invite code across launches / backgrounding. */
const PENDING_CODE_KEY = 'hotpick_pending_invite_code';
/** Set once the one-time, first-launch clipboard probe has run. Never probe twice. */
const CLIPBOARD_PROBED_KEY = 'hotpick_invite_clipboard_probed';

/** Normalize + validate a candidate code. Returns the clean code, or null if invalid. */
function normalizeInviteCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return INVITE_CODE_RE.test(code) ? code : null;
}

/**
 * Record a pending invite code from a deep link: set it in the store immediately
 * (memory, so live links route instantly) AND persist it so it survives the app
 * being backgrounded during signup or a cold relaunch. Disk write is best-effort.
 */
export function persistPendingInviteCode(raw: string): void {
  const code = normalizeInviteCode(raw);
  if (!code) return;
  useGlobalStore.getState().setPendingInviteCode(code);
  AsyncStorage.setItem(PENDING_CODE_KEY, code).catch(() => {});
}

/**
 * Resolve a pending invite code at app launch (steps 1→3 above). Safe to call
 * more than once; it short-circuits once a code is present.
 *
 * The clipboard is read AT MOST ONCE EVER (gated by CLIPBOARD_PROBED_KEY) — never
 * on subsequent launches, per the spec's hard constraint. `hasString()` avoids the
 * iOS paste banner when the clipboard is empty; `getString()` (which may show the
 * banner) only runs when there's actually something to read. Non-matching contents
 * are silently ignored and fall through to manual entry.
 */
export async function resolvePendingInviteCodeOnLaunch(): Promise<void> {
  const store = useGlobalStore.getState();
  if (store.pendingInviteCode) return;

  // Step 2: restore a code persisted from a previous session.
  try {
    const persisted = normalizeInviteCode(
      await AsyncStorage.getItem(PENDING_CODE_KEY),
    );
    if (persisted) {
      store.setPendingInviteCode(persisted);
      return;
    }
  } catch {
    // AsyncStorage unavailable — fall through.
  }

  // Step 3: first-launch-only clipboard probe.
  try {
    if (await AsyncStorage.getItem(CLIPBOARD_PROBED_KEY)) return;
    // Mark probed BEFORE reading so a thrown read can never cause a re-probe.
    await AsyncStorage.setItem(CLIPBOARD_PROBED_KEY, '1');

    const hasString = await Clipboard.hasString().catch(() => false);
    if (!hasString) return;
    const code = normalizeInviteCode(await Clipboard.getString());
    if (code) persistPendingInviteCode(code);
  } catch {
    // Clipboard unavailable — silently fall through to manual entry.
  }
}

/** Clear the pending invite code from both memory and disk once it's consumed. */
export function consumePendingInviteCode(): void {
  useGlobalStore.getState().clearPendingInviteCode();
  AsyncStorage.removeItem(PENDING_CODE_KEY).catch(() => {});
}
