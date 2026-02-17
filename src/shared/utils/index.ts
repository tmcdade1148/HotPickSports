/**
 * Shared utility functions.
 */
import type { User } from '../types/database';

/**
 * Resolve the display name for a user based on their display_mode setting.
 * If display_mode is 'first_name', returns the first word of full_name.
 * Otherwise returns their poolie_name.
 */
export function getDisplayName(user: User): string {
  if (user.display_mode === 'poolie_name') {
    return user.poolie_name;
  }
  return user.full_name.split(' ')[0] ?? user.poolie_name;
}

/**
 * Format a date into relative time (e.g. "2h ago", "in 3d").
 * Keeps it simple — no heavy date library needed.
 */
export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const absDiff = Math.abs(diffMs);
  const isFuture = diffMs < 0;

  const minutes = Math.floor(absDiff / 60_000);
  const hours = Math.floor(absDiff / 3_600_000);
  const days = Math.floor(absDiff / 86_400_000);

  let label: string;
  if (minutes < 1) label = 'just now';
  else if (minutes < 60) label = `${minutes}m`;
  else if (hours < 24) label = `${hours}h`;
  else if (days < 30) label = `${days}d`;
  else label = new Date(dateStr).toLocaleDateString();

  if (label === 'just now') return label;
  return isFuture ? `in ${label}` : `${label} ago`;
}

/**
 * Generate a random 6-character invite code (uppercase alphanumeric).
 */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/1/0 for readability
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Simple debounce utility.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}
