/**
 * Message Center retention window — the SINGLE source of truth for how far back
 * broadcasts + moderator notes stay visible AND countable as unread.
 *
 * Every reader of "is this broadcast still live?" imports this one constant:
 *   • MessageCenterScreen          — what the inbox actually shows
 *   • HomeInbox                    — super-admin banner unread window
 *   • poolIndicatorsSlice          — Pool Module unread badge (Gaffer broadcasts)
 *   • partnerModuleSlice           — Partner Module unread badge (Club broadcasts)
 *
 * Keeping all four on this constant guarantees the invariant: a broadcast that
 * has aged out of the inbox can never linger as an unread badge with nothing to
 * open. Previously the indicator queries had NO window while the screen showed
 * only the last 10 days, so a >10-day broadcast bumped the badge but couldn't be
 * opened to clear it. (10 days, per Tom 2026-06-15.)
 */
export const MESSAGE_CENTER_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

/** ISO timestamp for the start of the current Message Center window. */
export function messageCenterWindowStartIso(now: number = Date.now()): string {
  return new Date(now - MESSAGE_CENTER_WINDOW_MS).toISOString();
}
