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

/**
 * Format real name for contexts that show identity (e.g. "Tom M.").
 * Last name is truncated to initial for privacy.
 */
export function getRealName(profile: DbProfile | null): string {
  if (!profile) return '';
  if (!profile.last_name) return profile.first_name || '';
  return `${profile.first_name} ${profile.last_name.charAt(0).toUpperCase()}.`;
}
