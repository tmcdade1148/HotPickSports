import type {DbProfile} from '@shared/types/database';

/**
 * Resolve display name — always poolie_name.
 * All poolies are identified by their poolie name within the app.
 * First/last name is for account identity only, never shown in UI.
 */
export function getDisplayName(profile: DbProfile | null): string {
  if (!profile) return 'Player';
  return profile.poolie_name || 'Player';
}

/**
 * Resolve the name shown for ANOTHER member — reaction rows, the moderation
 * queue, broadcast senders.
 *
 * Mirrors what the server stamps on a Chirp: send_smack_message writes
 * author_name as COALESCE(poolie_name, first_name). Matching that chain here is
 * the whole point — resolve it any other way and the same person shows up twice
 * on one screen under two different names (the Chirp says "Sonny Spoon", the
 * reaction on it says "Kenn S.").
 *
 * The 'Player' terminal is ours, not the server's: 21 profiles currently have
 * no poolie_name, and nothing should ever render blank.
 *
 * Takes a structural subset, not DbProfile, so callers can select just the two
 * columns they need.
 */
export function getMemberName(
  profile: {poolie_name?: string | null; first_name?: string | null} | null,
  fallback: string = 'Player',
): string {
  return profile?.poolie_name || profile?.first_name || fallback;
}
