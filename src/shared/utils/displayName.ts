import type {DbProfile} from '@shared/types/database';

/**
 * Resolve display name — always poolie_name.
 * All poolies are identified by their poolie name within the app.
 * First/last name is for account identity only, never shown in UI.
 */
export function getDisplayName(profile: DbProfile | null): string {
  if (!profile) return 'Poolie';
  return profile.poolie_name || 'Poolie';
}
