import type {SeasonConfig} from '@shared/types/templates';
import {nflSeason} from './config';

// Spec: docs/DEMO_WEEK_SPEC.md
//
// nflDemo is the new-user onboarding demo competition. It is intentionally
// NOT added to the sport registry (ALL_EVENTS in src/sports/registry.ts):
// the demo is reached only via globalStore.enterDemo(), never the sport
// switcher or a Home event card (spec §8, Hard Rule #19). It runs as a single
// REGULAR / picks_open week on the pre-seeded nfl_demo data; scoring is
// per-user and server-side (the demo-settle Edge Function).

/** Competition string for the demo sandbox (matches the seed migration). */
export const DEMO_COMPETITION = 'nfl_demo';

/**
 * Fixed UUID of the seeded hidden demo pool.
 * See supabase/migrations/20260601120000_demo_week_seed_nfl_demo.sql.
 */
export const DEMO_POOL_ID = 'd0d0d0d0-0000-4000-8000-000000000001';

/**
 * Demo competition config — derived from nflSeason (same template, tabs,
 * scoring, teams) with a single week and the demo competition string.
 */
export const nflDemo: SeasonConfig = {
  ...nflSeason,
  competition: DEMO_COMPETITION,
  name: 'HotPick Demo Week',
  shortName: 'DEMO',
  status: 'active',
  totalWeeks: 1,
  playoffStartWeek: 19,
};
