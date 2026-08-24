// src/shared/utils/invite.ts
// The ONE invite share message. Every surface that shares a /join/ link
// calls buildInviteMessage — nobody builds the string locally.
//
// Why code-first (2026-08-24): warm deep links are broken on iOS.
// AppDelegate.swift carries no RCTLinkingManager overrides, so a
// hotpick.app/join/CODE link tapped while the app is BACKGROUNDED is
// dropped — cold launch works, warm does not. The likeliest first-time
// flow (tap link -> App Store -> install -> open -> back to the text ->
// tap again) lands on the warm path, so the person the link fails is a
// brand-new player. The native fix needs an Apple resubmit and is held
// until after Week 1. Until then the message leads with the invite CODE,
// which always works because a human types it, and frames the link as
// what it is genuinely good at: installing the app.
//
// Why the sport label comes from the registry: the old copy hardcoded
// "football", which is wrong the moment an NHL or World Cup Contest
// shares an invite. getEventByCompetition keeps the shell off the sport
// modules (Hard Rule #4).
//
// Lexicon note: this message says "pool", not "Contest". The reader has
// never opened the app — pool is the word they already know. Deliberate
// exception to REFERENCE.md §22, Tom's call 2026-08-24.

import {getEventByCompetition} from '@sports/registry';

// Universal-link base — https so the invite linkifies in every messaging
// app. Claimed by the AASA file (/join/*), so on a cold launch it opens
// the app directly; otherwise it lands on the install page.
const INVITE_BASE = 'https://hotpick.app/join';

/** The pool fields the message needs. DbPool satisfies this. */
export interface InvitePool {
  competition: string;
  name: string;
  name_display?: string | null;
}

function inviteUrlForCode(code: string): string {
  return `${INVITE_BASE}/${code}`;
}

/**
 * Build the invite share text for a pool + invite code.
 *
 * Every optional part degrades to nothing rather than to a gap: an
 * unregistered competition reads "my HotPick pool", never "my undefined
 * pool", and a sport with no emoji reads "Pick games, talk smack" with
 * no double space where the emoji would have been.
 */
export function buildInviteMessage(pool: InvitePool, code: string): string {
  const event = getEventByCompetition(pool.competition);

  // inviteName is how a competition introduces itself to an outsider;
  // shortName is tuned for the in-app header chip and can read as
  // gibberish in a text message ("NFL26"), so it is only the fallback.
  const label = event?.inviteName ?? event?.shortName ?? null;
  const emoji = event?.inviteEmoji ?? null;
  const poolName = pool.name_display?.trim() || pool.name?.trim() || '';

  const labelPart = label ? ` ${label}` : '';
  const namePart = poolName ? ` "${poolName}"` : '';
  const emojiPart = emoji ? ` ${emoji}` : '';

  return (
    `Hey — come play in my HotPick${labelPart} pool${namePart}.\n` +
    `Pick games${emojiPart}, talk smack, settle who's got bragging rights.\n\n` +
    `Your invite code:\n${code}\n\n` +
    `Already have HotPick? Open it and enter that code.\n` +
    `New here? Grab the app 👉 ${inviteUrlForCode(code)}`
  );
}
