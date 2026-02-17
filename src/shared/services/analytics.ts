/**
 * Analytics service — fire-and-forget event tracking.
 * P0 from day one per Blueprint. Writes to analytics_events table in Supabase.
 */
import { supabase } from '../config/supabase';

interface TrackParams {
  event: string;
  data?: Record<string, unknown>;
  sportKey?: string;
}

/**
 * Track an analytics event. Fire-and-forget — errors are silently caught.
 * Call this for key user actions: sign_up, sign_in, pick_made, pool_created, etc.
 */
export async function track({ event, data = {}, sportKey }: TrackParams): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id ?? null;

    await supabase.from('analytics_events').insert({
      user_id: userId,
      event_name: event,
      event_data: data,
      sport_key: sportKey ?? null,
    });
  } catch {
    // Fire-and-forget: don't let analytics errors break the app
    if (__DEV__) {
      console.warn('[Analytics] Failed to track event:', event);
    }
  }
}

// ─── Common Event Names ─────────────────────────────────────────────────────

export const Events = {
  // Auth
  SIGN_UP: 'sign_up',
  SIGN_IN: 'sign_in',
  SIGN_OUT: 'sign_out',

  // Navigation
  SPORT_SWITCHED: 'sport_switched',
  TAB_VIEWED: 'tab_viewed',
  SCREEN_VIEWED: 'screen_viewed',

  // Picks
  PICK_MADE: 'pick_made',
  PICK_CHANGED: 'pick_changed',
  GROUP_PICK_MADE: 'group_pick_made',
  BRACKET_PICK_MADE: 'bracket_pick_made',

  // Pools
  POOL_CREATED: 'pool_created',
  POOL_JOINED: 'pool_joined',
  POOL_LEFT: 'pool_left',
  INVITE_SHARED: 'invite_shared',

  // Social
  SMACK_TALK_SENT: 'smack_talk_sent',
  LEADERBOARD_VIEWED: 'leaderboard_viewed',
} as const;
