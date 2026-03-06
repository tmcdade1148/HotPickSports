import type {DbProfile} from '@shared/types/database';

/**
 * Resolve what name to show based on user's display preference.
 * Never store a computed display name — always resolve at render time.
 */
export function getDisplayName(profile: DbProfile | null): string {
  if (!profile) return 'Poolie';
  if (
    profile.display_name_preference === 'poolie_name' &&
    profile.poolie_name
  ) {
    return profile.poolie_name;
  }
  return profile.first_name || 'Poolie';
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
